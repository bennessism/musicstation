const REPOSITORY = "BENNESSism/musicstation";
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}/contents/music`;
const FIRESTORE_ROOT =
  "https://firestore.googleapis.com/v1/projects/bennessism-stn/databases/(default)/documents/channels";
const FIREBASE_API_KEY = "AIzaSyD61vOfnwsbYKA-3waF_u1dqY1LPIOS6vQ";
const AUDIO_PATTERN = /\.(mp3|m4a|aac|ogg|wav|flac)$/i;
const MINIMUM_AUDIO_BYTES = 1024;

const FALLBACK_CHANNELS = [
  {
    id: "gothic",
    tracks: [
      "cold-stone-altars.mp3",
      "the-pale-chapel-at-midnight.mp3",
      "the-rain-soaked-nave.mp3",
      "the-weight-of-marble.mp3",
    ],
  },
  {
    id: "meditation",
    tracks: [
      "clock.mp3",
      "fantasy-rain-meditation.mp3",
      "meditation-with-the-birds.mp3",
      "morning-mist-raising.mp3",
      "strings-and-waves.mp3",
      "tibetan-singing-bowls.mp3",
    ],
  },
];

const CHANNEL_DETAILS = {
  gothic: {
    name: "Gothic",
    description: "Dark, slow and atmospheric.",
    broadcastLabel: "24 hours",
  },
  meditation: {
    name: "Meditation",
    description: "Continuous calm and meditation.",
    broadcastLabel: "24 hours",
  },
};

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function trackFromName(channelId, name, downloadUrl, sourceSha = "") {
  return {
    id: `${channelId}/${name}`,
    name,
    title: titleCase(name.replace(/\.[^.]+$/, "")),
    url: downloadUrl || `./music/${encodeURIComponent(channelId)}/${encodeURIComponent(name)}`,
    sourceSha,
  };
}

function decorateChannel(channel) {
  const details = CHANNEL_DETAILS[channel.id] || {};
  return {
    ...channel,
    name: details.name || titleCase(channel.id),
    description: details.description || "Independent continuous radio.",
    broadcastLabel: details.broadcastLabel || "24 hours",
    tracks: channel.tracks.map((track) =>
      typeof track === "string" ? trackFromName(channel.id, track) : track,
    ),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  return response.json();
}

async function loadFromGitHub() {
  const rootItems = await fetchJson(API_ROOT);
  const folders = rootItems.filter((item) => item.type === "dir");

  const channels = await Promise.all(
    folders.map(async (folder) => {
      const items = await fetchJson(folder.url);
      const tracks = items
        .filter(
          (item) =>
            item.type === "file" &&
            item.size >= MINIMUM_AUDIO_BYTES &&
            AUDIO_PATTERN.test(item.name),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => trackFromName(folder.name, item.name, item.download_url, item.sha));

      return { id: folder.name, tracks };
    }),
  );

  return channels.filter((channel) => channel.tracks.length).map(decorateChannel);
}

function decodeFirestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeFirestoreValue(entry)]),
    );
  }
  return undefined;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
}

async function loadSavedChannel(channel) {
  try {
    const response = await fetch(
      `${FIRESTORE_ROOT}/${encodeURIComponent(channel.id)}?key=${FIREBASE_API_KEY}`,
    );
    if (response.status === 404) return channel;
    if (!response.ok) throw new Error(`Firestore returned ${response.status}`);

    const saved = decodeFirestoreFields((await response.json()).fields);
    const timeline = Array.isArray(saved.timeline) ? saved.timeline : [];
    const savedTracks = new Map(timeline.map((item) => [item.filename, item]));
    const tracks = channel.tracks
      .map((track, fallbackOrder) => {
        const item = savedTracks.get(track.name);
        if (!item) return { ...track, order: fallbackOrder };
        const durationMatchesSource = !track.sourceSha || item.sourceSha === track.sourceSha;
        return {
          ...track,
          title: item.title || track.title,
          duration: durationMatchesSource ? Number(item.durationSeconds) || undefined : undefined,
          order: Number.isFinite(item.order) ? item.order : fallbackOrder,
          type: item.type || "music",
          targetUrl: item.targetUrl || "",
          linkLabel: item.linkLabel || "",
        };
      })
      .sort((a, b) => a.order - b.order);

    return {
      ...channel,
      name: saved.name || channel.name,
      description: saved.description || channel.description,
      tracks,
    };
  } catch (error) {
    console.warn(`Using GitHub-only details for ${channel.id}.`, error);
    return channel;
  }
}

export async function loadChannels({ includeSaved = true } = {}) {
  try {
    const channels = await loadFromGitHub();
    if (channels.length) {
      return includeSaved ? Promise.all(channels.map(loadSavedChannel)) : channels;
    }
  } catch (error) {
    console.warn("Using the built-in station catalog.", error);
  }

  return FALLBACK_CHANNELS.map(decorateChannel);
}
