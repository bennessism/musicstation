import { loadChannels } from "../engine/catalog.js";
import { createTuningDial, createVolumeDial } from "./dial.js";
import { RadioEngine } from "./radio.js";

const elements = {
  radio: document.querySelector(".radio"),
  audio: document.querySelector("#radioAudio"),
  tuner: document.querySelector("#tunerWrap"),
  ring: document.querySelector("#tunerRing"),
  channelWindow: document.querySelector("#channelWindow"),
  channelName: document.querySelector("#channelName"),
  channelStatus: document.querySelector("#channelStatus"),
  broadcastTime: document.querySelector("#broadcastTime"),
  trackTitle: document.querySelector("#trackTitle"),
  channelDescription: document.querySelector("#channelDescription"),
  volumeDial: document.querySelector("#volumeDial"),
  volumeValue: document.querySelector("#volumeValue"),
  powerButton: document.querySelector("#powerButton"),
  powerLabel: document.querySelector("#powerLabel"),
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

function renderState({ isPowered, isPlaying, track }) {
  elements.radio.classList.toggle("is-playing", isPlaying);
  elements.powerButton.setAttribute("aria-pressed", String(isPowered));
  elements.powerLabel.textContent = isPowered ? "Power on" : "Power off";
  elements.channelStatus.textContent = isPlaying ? "On air" : isPowered ? "Tuning" : "Standby";
  elements.trackTitle.textContent = isPowered && track ? track.title : "Turn on the station";
  document.title = isPlaying && track ? `${track.title} — BENNESSism` : "BENNESSism | Music Station";
}

radio.addEventListener("channelchange", (event) => renderChannel(event.detail));
radio.addEventListener("statechange", (event) => renderState(event.detail));
radio.addEventListener("volumechange", (event) => {
  elements.volumeValue.textContent = String(event.detail);
});

createTuningDial(elements.tuner, elements.ring, (direction) => {
  if (!radio.channels.length) return;
  activeIndex = (activeIndex + direction + radio.channels.length) % radio.channels.length;
  radio.selectChannel(activeIndex);
});

createVolumeDial(elements.volumeDial, radio.volume, (value) => radio.setVolume(value));

elements.powerButton.addEventListener("click", () => radio.togglePower());

elements.channelWindow.addEventListener("click", (event) => {
  if (event.detail === 0 && radio.channels.length) {
    activeIndex = (activeIndex + 1) % radio.channels.length;
    radio.selectChannel(activeIndex);
  }
});

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
