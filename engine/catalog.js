const REPOSITORY = "BENNESSism/musicstation";
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}/contents/music`;
const INDEX_URL = "./music-index.json";
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
    name: channel.name || details.name || titleCase(channel.id),
    description: channel.description || details.description || "Independent continuous radio.",
    broadcastLabel: channel.broadcastLabel || details.broadcastLabel || "24 hours",
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

async function loadFromIndex() {
  const response = await fetch(INDEX_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Music index returned ${response.status}`);

  const index = await response.json();
  return Object.entries(index.channels || {})
    .map(([channelId, entry]) => {
      const channel = Array.isArray(entry) ? { tracks: entry } : entry;
      const broadcastLabel = channel.broadcastMode === "scheduled" && channel.scheduleStart && channel.scheduleEnd
        ? `${channel.scheduleStart}–${channel.scheduleEnd}`
        : channel.broadcastMode === "off"
          ? "Off air"
          : "24 hours";
      return {
        id: channelId,
        name: channel.name || "",
        description: channel.description || "",
        broadcastMode: channel.broadcastMode || "always",
        broadcastLabel,
        tracks: (channel.tracks || []).map((item) => ({
          ...trackFromName(channelId, item.filename, null, item.sourceSha || ""),
          title: item.title || titleCase(item.filename.replace(/\.[^.]+$/, "")),
          duration: Number(item.durationSeconds) || undefined,
          type: item.type || "music",
          targetUrl: item.targetUrl || "",
          linkLabel: item.linkLabel || "",
        })),
      };
    })
    .filter((channel) => channel.broadcastMode !== "off")
    .filter((channel) => channel.tracks.length)
    .map(decorateChannel);
}

export async function loadChannels() {
  try {
    const channels = await loadFromIndex();
    if (channels.length) return channels;
  } catch (error) {
    console.warn("The generated music index is not ready; scanning GitHub instead.", error);
  }

  try {
    const channels = await loadFromGitHub();
    if (channels.length) return channels;
  } catch (error) {
    console.warn("Using the built-in station catalog.", error);
  }

  return FALLBACK_CHANNELS.map(decorateChannel);
}
