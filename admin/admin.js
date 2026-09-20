import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { loadChannels } from "../engine/catalog.js";
import { auth, db, googleProvider } from "../engine/firebase.js";

const ADMIN_UIDS = new Set([
  "1t7mv9yXmJYYjpBFn2ar1BgUiVX2",
  "8G9oQmdk8fUhUYIZMjZ9OtLPZnt2",
]);

const loginPanel = document.querySelector("#loginPanel");
const identityPanel = document.querySelector("#identityPanel");
const googleLogin = document.querySelector("#googleLogin");
const signOutButton = document.querySelector("#signOut");
const copyUidButton = document.querySelector("#copyUid");
const authError = document.querySelector("#authError");
const userEmail = document.querySelector("#userEmail");
const userUid = document.querySelector("#userUid");
const channelForm = document.querySelector("#channelForm");
const channelSelect = document.querySelector("#channelSelect");
const refreshChannels = document.querySelector("#refreshChannels");
const formMessage = document.querySelector("#formMessage");
const broadcastMode = document.querySelector("#broadcastMode");
const channelDisplayName = document.querySelector("#channelDisplayName");
const scheduleFields = document.querySelector("#scheduleFields");
const scheduleStart = document.querySelector("#scheduleStart");
const scheduleEnd = document.querySelector("#scheduleEnd");
const channelDescriptionInput = document.querySelector("#channelDescriptionInput");
const hostName = document.querySelector("#hostName");
const hostInfo = document.querySelector("#hostInfo");
const trackList = document.querySelector("#trackList");
const trackCount = document.querySelector("#trackCount");
const saveChannel = document.querySelector("#saveChannel");

let channels = [];
let editorStarted = false;
let loadSequence = 0;
const DURATION_TIMEOUT_MS = 20_000;

function showError(message) {
  authError.textContent = message;
}

function isAdmin(user) {
  return Boolean(user && ADMIN_UIDS.has(user.uid));
}

function setFormMessage(message, tone = "") {
  formMessage.textContent = message;
  formMessage.dataset.tone = tone;
}

function currentChannel() {
  return channels.find((channel) => channel.id === channelSelect.value) || null;
}

function updateScheduleVisibility() {
  scheduleFields.hidden = broadcastMode.value !== "scheduled";
}

function measureTrackDuration(track) {
  if (Number.isFinite(track.durationSeconds) && track.durationSeconds > 0) {
    return Promise.resolve(track.durationSeconds);
  }

  return new Promise((resolve, reject) => {
    const probe = document.createElement("audio");
    let settled = false;

    const finish = (error, duration) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      probe.removeAttribute("src");
      probe.load();
      if (error) reject(error);
      else resolve(duration);
    };

    const timeout = setTimeout(
      () => finish(new Error(`Timed out while reading ${track.name}`)),
      DURATION_TIMEOUT_MS,
    );
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) finish(null, probe.duration);
      else finish(new Error(`Invalid duration for ${track.name}`));
    }, { once: true });
    probe.addEventListener(
      "error",
      () => finish(new Error(`Could not read duration for ${track.name}`)),
      { once: true },
    );
    probe.src = track.url;
    probe.load();
  });
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function createTrackRow(track, saved = {}) {
  const row = document.createElement("article");
  row.className = "track-row";
  row.dataset.filename = track.name;

  const heading = document.createElement("div");
  heading.className = "track-heading";

  const title = document.createElement("strong");
  title.textContent = track.title;
  const filename = document.createElement("span");
  filename.textContent = track.name;
  heading.append(title, filename);

  const typeField = document.createElement("label");
  typeField.className = "field track-type";
  typeField.innerHTML = "<span>Type</span>";
  const type = document.createElement("select");
  type.dataset.field = "type";
  for (const [value, label] of [
    ["music", "Music"],
    ["programme", "Programme"],
    ["ad", "Advertisement"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    type.append(option);
  }
  type.value = saved.type || "music";
  typeField.append(type);

  const urlField = document.createElement("label");
  urlField.className = "field track-url";
  urlField.innerHTML = "<span>Clickable URL <small>optional</small></span>";
  const url = document.createElement("input");
  url.type = "url";
  url.placeholder = "https://…";
  url.maxLength = 500;
  url.dataset.field = "targetUrl";
  url.value = saved.targetUrl || "";
  urlField.append(url);

  const labelField = document.createElement("label");
  labelField.className = "field track-label";
  labelField.innerHTML = "<span>Link label <small>optional</small></span>";
  const linkLabel = document.createElement("input");
  linkLabel.placeholder = "Visit sponsor";
  linkLabel.maxLength = 80;
  linkLabel.dataset.field = "linkLabel";
  linkLabel.value = saved.linkLabel || "";
  labelField.append(linkLabel);

  row.append(heading, typeField, urlField, labelField);
  return row;
}

async function loadChannelEditor() {
  const channel = currentChannel();
  if (!channel) return;

  const sequence = ++loadSequence;
  channelForm.classList.add("is-loading");
  saveChannel.disabled = true;
  setFormMessage("Loading channel settings…");

  broadcastMode.value = "always";
  channelDisplayName.value = channel.name;
  scheduleStart.value = "23:00";
  scheduleEnd.value = "03:00";
  channelDescriptionInput.value = channel.description || "";
  hostName.value = "";
  hostInfo.value = "";
  updateScheduleVisibility();
  trackList.replaceChildren(...channel.tracks.map((track) => createTrackRow(track)));
  trackCount.textContent = `${channel.tracks.length} ${channel.tracks.length === 1 ? "item" : "items"}`;

  try {
    const channelRef = doc(db, "channels", channel.id);
    const [channelSnapshot, itemSnapshot] = await Promise.all([
      getDoc(channelRef),
      getDocs(collection(channelRef, "items")),
    ]);
    if (sequence !== loadSequence) return;

    const savedChannel = channelSnapshot.exists() ? channelSnapshot.data() : {};
    const savedItems = new Map(itemSnapshot.docs.map((item) => [item.id, item.data()]));

    channel.tracks.forEach((track) => {
      const saved = savedItems.get(track.name);
      if (
        saved &&
        Number.isFinite(saved.durationSeconds) &&
        saved.durationSeconds > 0 &&
        (!track.sourceSha || saved.sourceSha === track.sourceSha)
      ) {
        track.durationSeconds = saved.durationSeconds;
      } else {
        delete track.durationSeconds;
      }
    });

    broadcastMode.value = savedChannel.broadcastMode || "always";
    channelDisplayName.value = savedChannel.name || channel.name;
    scheduleStart.value = savedChannel.scheduleStart || "23:00";
    scheduleEnd.value = savedChannel.scheduleEnd || "03:00";
    channelDescriptionInput.value = savedChannel.description || channel.description || "";
    hostName.value = savedChannel.hostName || "";
    hostInfo.value = savedChannel.hostInfo || "";
    updateScheduleVisibility();

    trackList.replaceChildren(
      ...channel.tracks.map((track) => createTrackRow(track, savedItems.get(track.name))),
    );
    trackCount.textContent = `${channel.tracks.length} ${channel.tracks.length === 1 ? "item" : "items"}`;
    setFormMessage(channelSnapshot.exists() ? "Saved settings loaded." : "New channel. Add details and save.");
  } catch (error) {
    console.error(error);
    setFormMessage("Could not load Firebase settings. Check Firestore and its rules.", "error");
  } finally {
    if (sequence === loadSequence) {
      channelForm.classList.remove("is-loading");
      saveChannel.disabled = false;
    }
  }
}

async function scanChannels({ keepSelection = true } = {}) {
  const previous = keepSelection ? channelSelect.value : "";
  refreshChannels.disabled = true;
  saveChannel.disabled = true;
  setFormMessage("Scanning GitHub music folders…");

  try {
    channels = await loadChannels({ includeSaved: false });
    channelSelect.replaceChildren(
      ...channels.map((channel) => {
        const option = document.createElement("option");
        option.value = channel.id;
        option.textContent = channel.name;
        return option;
      }),
    );

    if (!channels.length) throw new Error("No audio channels found.");
    if (channels.some((channel) => channel.id === previous)) channelSelect.value = previous;
    channelForm.hidden = false;
    await loadChannelEditor();
  } catch (error) {
    console.error(error);
    setFormMessage("No channels could be loaded from GitHub.", "error");
  } finally {
    refreshChannels.disabled = false;
  }
}

async function saveChannelSettings(event) {
  event.preventDefault();
  const channel = currentChannel();
  if (!channel || !auth.currentUser || !isAdmin(auth.currentUser)) return;

  const itemRows = [...trackList.querySelectorAll(".track-row")];
  const invalidUrl = itemRows
    .map((row) => row.querySelector('[data-field="targetUrl"]'))
    .find((input) => input.value && !input.value.startsWith("https://"));

  if (invalidUrl) {
    invalidUrl.focus();
    setFormMessage("Clickable URLs must begin with https://", "error");
    return;
  }

  saveChannel.disabled = true;
  setFormMessage("Saving channel…");

  try {
    const channelRef = doc(db, "channels", channel.id);
    const existingItems = await getDocs(collection(channelRef, "items"));
    const savedItems = new Map(existingItems.docs.map((item) => [item.id, item.data()]));
    const currentNames = new Set(channel.tracks.map((track) => track.name));
    setFormMessage("Checking audio durations…");
    const durations = await mapWithConcurrency(channel.tracks, 4, async (track) => {
      const saved = savedItems.get(track.name);
      const canReuse =
        saved &&
        Number.isFinite(saved.durationSeconds) &&
        saved.durationSeconds > 0 &&
        (!track.sourceSha || saved.sourceSha === track.sourceSha);
      const durationSeconds = canReuse
        ? saved.durationSeconds
        : await measureTrackDuration(track);
      track.durationSeconds = durationSeconds;
      return durationSeconds;
    });

    const batch = writeBatch(db);
    existingItems.docs
      .filter((item) => !currentNames.has(item.id))
      .forEach((item) => batch.delete(item.ref));
    const timeline = itemRows.map((row, order) => {
      const track = channel.tracks.find((entry) => entry.name === row.dataset.filename);
      return {
        filename: track.name,
        title: track.title,
        audioUrl: track.url,
        sourceSha: track.sourceSha || "",
        durationSeconds: durations[channel.tracks.indexOf(track)],
        order,
        type: row.querySelector('[data-field="type"]').value,
        targetUrl: row.querySelector('[data-field="targetUrl"]').value.trim(),
        linkLabel: row.querySelector('[data-field="linkLabel"]').value.trim(),
      };
    });

    batch.set(channelRef, {
      id: channel.id,
      name: channelDisplayName.value.trim(),
      broadcastMode: broadcastMode.value,
      scheduleStart: broadcastMode.value === "scheduled" ? scheduleStart.value : "",
      scheduleEnd: broadcastMode.value === "scheduled" ? scheduleEnd.value : "",
      description: channelDescriptionInput.value.trim(),
      hostName: hostName.value.trim(),
      hostInfo: hostInfo.value.trim(),
      trackCount: channel.tracks.length,
      timeline,
      updatedAt: serverTimestamp(),
    });

    itemRows.forEach((row, order) => {
      const track = channel.tracks.find((entry) => entry.name === row.dataset.filename);
      batch.set(doc(channelRef, "items", track.name), {
        filename: track.name,
        title: track.title,
        audioUrl: track.url,
        sourceSha: track.sourceSha || "",
        durationSeconds: durations[channel.tracks.indexOf(track)],
        order,
        type: row.querySelector('[data-field="type"]').value,
        targetUrl: row.querySelector('[data-field="targetUrl"]').value.trim(),
        linkLabel: row.querySelector('[data-field="linkLabel"]').value.trim(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    setFormMessage("Channel saved.", "success");
  } catch (error) {
    console.error(error);
    const message = /duration|reading|timed out/i.test(error.message || "")
      ? error.message
      : "Could not save. Check that the Firestore rules were published.";
    setFormMessage(message, "error");
  } finally {
    saveChannel.disabled = false;
  }
}

async function initializeEditor() {
  if (editorStarted) return;
  editorStarted = true;
  await scanChannels({ keepSelection: false });
}

async function rejectUnauthorizedUser() {
  loginPanel.hidden = false;
  identityPanel.hidden = true;
  await signOut(auth);
  showError("This Google account is not authorized.");
}

googleLogin.addEventListener("click", async () => {
  googleLogin.disabled = true;
  showError("");

  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!isAdmin(result.user)) await rejectUnauthorizedUser();
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      showError(
        error.code === "auth/unauthorized-domain"
          ? "This website is not authorized in Firebase."
          : "Google sign-in could not be completed.",
      );
      console.error(error);
    }
  } finally {
    googleLogin.disabled = false;
  }
});

signOutButton.addEventListener("click", () => signOut(auth));

copyUidButton.addEventListener("click", async () => {
  const uid = userUid.textContent;
  try {
    await navigator.clipboard.writeText(uid);
    copyUidButton.textContent = "Copied";
    setTimeout(() => {
      copyUidButton.textContent = "Copy UID";
    }, 1600);
  } catch {
    showError("Could not copy automatically. Select the UID and copy it manually.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user && !isAdmin(user)) {
    await rejectUnauthorizedUser();
    return;
  }

  loginPanel.hidden = isAdmin(user);
  identityPanel.hidden = !isAdmin(user);

  if (isAdmin(user)) {
    userEmail.textContent = user.email || "Google account";
    userUid.textContent = user.uid;
    await initializeEditor();
  } else {
    userEmail.textContent = "—";
    userUid.textContent = "—";
  }
});

channelSelect.addEventListener("change", loadChannelEditor);
broadcastMode.addEventListener("change", updateScheduleVisibility);
refreshChannels.addEventListener("click", () => scanChannels());
channelForm.addEventListener("submit", saveChannelSettings);
