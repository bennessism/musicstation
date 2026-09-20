import { execFileSync } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const musicDirectory = path.join(root, "music");
const audioPattern = /\.(mp3|m4a|aac|ogg|wav|flac)$/i;

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

const channels = {};
const entries = await readdir(musicDirectory, { withFileTypes: true });

for (const directory of entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const channelDirectory = path.join(musicDirectory, directory.name);
  const files = await readdir(channelDirectory, { withFileTypes: true });
  const tracks = [];

  for (const file of files.filter((entry) => entry.isFile() && audioPattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(channelDirectory, file.name);
    const details = await stat(filePath);
    if (details.size < 1024) continue;

    tracks.push({
      filename: file.name,
      durationSeconds: durationFor(filePath),
      sourceSha: gitBlobSha(filePath),
    });
  }

  if (tracks.length) channels[directory.name] = tracks;
}

const index = {
  schemaVersion: 1,
  channels,
};

await writeFile(
  path.join(root, "music-index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
  "utf8",
);
