import { loadChannels } from "../engine/catalog.js";
import { createChannelButtons, createVolumeDial } from "./dial.js";
import { RadioEngine } from "./radio.js";

const elements = {
  radio: document.querySelector(".radio"),
  audio: document.querySelector("#radioAudio"),
  channelField: document.querySelector(".channel-field"),
  channelUp: document.querySelector("#channelUp"),
  channelDown: document.querySelector("#channelDown"),
  channelName: document.querySelector("#channelName"),
  channelStatus: document.querySelector("#channelStatus"),
  broadcastTime: document.querySelector("#broadcastTime"),
  trackTitle: document.querySelector("#trackTitle"),
  channelDescription: document.querySelector("#channelDescription"),
  volumeDial: document.querySelector("#volumeDial"),
  volumeValue: document.querySelector("#volumeValue"),
  localTime: document.querySelector("#localTime"),
};

const radio = new RadioEngine(elements.audio);
let activeIndex = 0;
let resumeExpected = sessionStorage.getItem("bennessism-was-on-air") === "1";

function animateChannelName() {
  elements.channelName.classList.remove("is-changing");
  void elements.channelName.offsetWidth;
  elements.channelName.classList.add("is-changing");
}

function renderChannel(channel) {
  if (!channel) return;
  elements.channelName.textContent = channel.name;
  elements.broadcastTime.textContent = channel.broadcastLabel;
  elements.channelDescription.textContent = channel.description;
  animateChannelName();
}

function renderState({ isPowered, isPlaying, isTuning, track }) {
  if (isPlaying) {
    sessionStorage.setItem("bennessism-was-on-air", "1");
    resumeExpected = false;
  }

  elements.radio.classList.toggle("is-playing", isPlaying);
  elements.radio.classList.toggle("is-tuning", isTuning);
  elements.channelStatus.textContent = isTuning
    ? "Tuning"
    : isPlaying
      ? "On air"
      : isPowered
        ? "Connecting"
        : resumeExpected
          ? "Paused"
          : "Choose channel";
  elements.trackTitle.textContent = isTuning
    ? "Changing channel…"
    : isPowered && track
      ? track.title
      : resumeExpected
        ? "Tap to resume"
        : "Choose a channel to listen";
  document.title = isPlaying && track ? `${track.title} — BENNESSism` : "BENNESSism | Music Station";
}

radio.addEventListener("channelchange", (event) => renderChannel(event.detail));
radio.addEventListener("statechange", (event) => renderState(event.detail));
radio.addEventListener("volumechange", (event) => {
  elements.volumeValue.textContent = String(event.detail);
});

createChannelButtons(
  elements.channelField,
  elements.channelUp,
  elements.channelDown,
  (direction) => {
    if (!radio.channels.length) return;
    activeIndex = (activeIndex + direction + radio.channels.length) % radio.channels.length;
    radio.selectChannel(activeIndex, { startPlayback: true });
  },
);

createVolumeDial(elements.volumeDial, radio.volume, (value) => radio.setVolume(value));

document.addEventListener(
  "pointerdown",
  (event) => {
    if (!radio.isPowered && !event.target.closest(".channel-arrows")) {
      radio.powerOn();
    }
  },
  { capture: true },
);

function updateClock() {
  elements.localTime.textContent = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

async function start() {
  updateClock();
  setInterval(updateClock, 15_000);

  const channels = await loadChannels();
  radio.setChannels(channels);
  activeIndex = radio.channelIndex;

  if (resumeExpected) radio.powerOn();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Offline shell unavailable.", error);
    });
  }
}

start();
