import { loadChannels } from "../engine/catalog.js";
import { createChannelSlider, createVolumeDial } from "./dial.js";
import { RadioEngine } from "./radio.js";

const elements = {
  radio: document.querySelector(".radio"),
  audio: document.querySelector("#radioAudio"),
  channelSlider: document.querySelector("#channelSlider"),
  sliderThumb: document.querySelector("#sliderThumb"),
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
  elements.radio.classList.toggle("is-playing", isPlaying);
  elements.radio.classList.toggle("is-tuning", isTuning);
  elements.channelStatus.textContent = isTuning ? "Tuning" : isPlaying ? "On air" : isPowered ? "Connecting" : "Slide tuner";
  elements.trackTitle.textContent = isTuning
    ? "Changing channel…"
    : isPowered && track
      ? track.title
      : "Slide the tuner to listen";
  document.title = isPlaying && track ? `${track.title} — BENNESSism` : "BENNESSism | Music Station";
}

radio.addEventListener("channelchange", (event) => renderChannel(event.detail));
radio.addEventListener("statechange", (event) => renderState(event.detail));
radio.addEventListener("volumechange", (event) => {
  elements.volumeValue.textContent = String(event.detail);
});

createChannelSlider(
  elements.channelSlider,
  elements.sliderThumb,
  (direction) => {
    if (!radio.channels.length) return;
    activeIndex = (activeIndex + direction + radio.channels.length) % radio.channels.length;
    radio.selectChannel(activeIndex, { startPlayback: true });
  },
  () => {
    if (!radio.isPowered && radio.channels.length) radio.powerOn();
  },
);

createVolumeDial(elements.volumeDial, radio.volume, (value) => radio.setVolume(value));

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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Offline shell unavailable.", error);
    });
  }
}

start();
