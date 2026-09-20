import { execFileSync } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const musicDirectory = path.join(root, "music");
const audioPattern = /\.(mp3|m4a|aac|ogg|wav|flac)$/i;
const firestoreRoot =
  "https://firestore.googleapis.com/v1/projects/bennessism-stn/databases/(default)/documents";
const firebaseApiKey = "AIzaSyD61vOfnwsbYKA-3waF_u1dqY1LPIOS6vQ";

function decodeFirestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeFirestoreValue(entry)]),
    );
  }
  return undefined;
}

function decodeDocument(document) {
  return {
    id: document.name.split("/").at(-1),
    ...Object.fromEntries(
      Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
    ),
  };
}

async function listDocuments(collectionPath) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(`${firestoreRoot}/${collectionPath}`);
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("key", firebaseApiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Firestore returned ${response.status} for ${collectionPath}`);
    const page = await response.json();
    documents.push(...(page.documents || []).map(decodeDocument));
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  return documents;
}

async function loadStationMetadata() {
  const channels = await listDocuments("channels");
  const metadata = new Map();

  for (const channel of channels) {
    const channelId = channel.id;
    const items = await listDocuments(`channels/${encodeURIComponent(channelId)}/items`);
    metadata.set(channelId, {
      ...channel,
      items: new Map(items.map((item) => [item.filename || item.id, item])),
    });
  }

  return metadata;
}

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function durationFor(filePath) {
  const output = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine duration for ${filePath}`);
  }
  return Math.round(duration * 1000) / 1000;
}

function gitBlobSha(filePath) {
  return execFileSync("git", ["hash-object", filePath], { encoding: "utf8" }).trim();
}

const stationMetadata = await loadStationMetadata();
const channels = {};
const entries = await readdir(musicDirectory, { withFileTypes: true });

for (const directory of entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const channelDirectory = path.join(musicDirectory, directory.name);
  const channelMetadata = stationMetadata.get(directory.name) || {};
  const files = await readdir(channelDirectory, { withFileTypes: true });
  const tracks = [];

  for (const file of files.filter((entry) => entry.isFile() && audioPattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(channelDirectory, file.name);
    const details = await stat(filePath);
    if (details.size < 1024) continue;

    const itemMetadata = channelMetadata.items?.get(file.name) || {};
    tracks.push({
      filename: file.name,
      title: itemMetadata.title || titleCase(file.name.replace(/\.[^.]+$/, "")),
      durationSeconds: durationFor(filePath),
      sourceSha: gitBlobSha(filePath),
      order: Number.isFinite(itemMetadata.order) ? itemMetadata.order : tracks.length,
      type: itemMetadata.type || "music",
      targetUrl: itemMetadata.targetUrl || "",
      linkLabel: itemMetadata.linkLabel || "",
    });
  }

  if (tracks.length) {
    tracks.sort((a, b) => a.order - b.order);
    channels[directory.name] = {
      name: channelMetadata.name || titleCase(directory.name),
      description: channelMetadata.description || "Independent continuous radio.",
      broadcastMode: channelMetadata.broadcastMode || "always",
      scheduleStart: channelMetadata.scheduleStart || "",
      scheduleEnd: channelMetadata.scheduleEnd || "",
      hostName: channelMetadata.hostName || "",
      hostInfo: channelMetadata.hostInfo || "",
      tracks,
    };
  }
}

const index = {
  schemaVersion: 2,
  channels,
};

await writeFile(
  path.join(root, "music-index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
  "utf8",
);
