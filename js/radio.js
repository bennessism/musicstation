const DEFAULT_TRACK_SECONDS = 240;
const TUNING_DELAY_MS = 650;

function getStoredVolume() {
  const stored = Number.parseInt(localStorage.getItem("bennessism-volume") || "65", 10);
  return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 65;
}

export class RadioEngine extends EventTarget {
  constructor(audioElement) {
    super();
    this.audio = audioElement;
    this.channels = [];
    this.channelIndex = 0;
    this.trackIndex = 0;
    this.isPowered = false;
    this.isTuning = false;
    this.tuningSequence = 0;
    this.volume = getStoredVolume();
    this.audio.volume = this.volume / 100;

    this.audio.addEventListener("ended", () => this.advanceTrack());
    this.audio.addEventListener("playing", () => this.emitState());
    this.audio.addEventListener("pause", () => this.emitState());
    this.audio.addEventListener("error", () => this.handleTrackError());
  }

  setChannels(channels) {
    this.channels = channels;
    const storedId = localStorage.getItem("bennessism-channel");
    const storedIndex = channels.findIndex((channel) => channel.id === storedId);
    this.channelIndex = storedIndex >= 0 ? storedIndex : 0;
    this.trackIndex = this.stationTrackIndex();
    this.emitChannel();
  }

  get channel() {
    return this.channels[this.channelIndex] || null;
  }

  get track() {
    return this.channel?.tracks[this.trackIndex] || null;
  }

  stationTrackIndex() {
    const count = this.channel?.tracks.length || 1;
    return Math.floor(Date.now() / (DEFAULT_TRACK_SECONDS * 1000)) % count;
  }

  stationOffset() {
    return (Date.now() / 1000) % DEFAULT_TRACK_SECONDS;
  }

  async powerOn() {
    if (!this.channel) return;
    this.isPowered = true;
    await this.tune({ synchronize: true });
  }

  powerOff() {
    this.isPowered = false;
    this.audio.pause();
    this.emitState();
  }

  async togglePower() {
    if (this.isPowered) this.powerOff();
    else await this.powerOn();
  }

  async selectChannel(index, { startPlayback = false } = {}) {
    if (!this.channels.length) return;
    const shouldPlay = this.isPowered || startPlayback;
    const sequence = ++this.tuningSequence;
    this.isPowered = shouldPlay;

    if (shouldPlay) {
      this.isTuning = true;
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.removeAttribute("src");
      delete this.audio.dataset.trackId;
      this.audio.load();
    }

    this.channelIndex = (index + this.channels.length) % this.channels.length;
    this.trackIndex = this.stationTrackIndex();
    localStorage.setItem("bennessism-channel", this.channel.id);
    this.emitChannel();

    if (shouldPlay) {
      await new Promise((resolve) => setTimeout(resolve, TUNING_DELAY_MS));
      if (sequence !== this.tuningSequence) return;
      await this.tune({ synchronize: true });
    }
  }

  async tune({ synchronize = false } = {}) {
    const track = this.track;
    if (!track) return;

    const sourceChanged = this.audio.dataset.trackId !== track.id;
    if (sourceChanged) {
      this.audio.src = track.url;
      this.audio.dataset.trackId = track.id;
      this.audio.load();
    }

    if (synchronize) {
      const setOffset = () => {
        if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
          this.audio.currentTime = this.stationOffset() % this.audio.duration;
        }
      };

      if (this.audio.readyState >= 1) setOffset();
      else this.audio.addEventListener("loadedmetadata", setOffset, { once: true });
    }

    try {
      await this.audio.play();
      this.isTuning = false;
      this.emitState();
    } catch (error) {
      this.isPowered = false;
      this.isTuning = false;
      this.emitState();
      console.warn("Playback needs a user gesture.", error);
    }
  }

  async advanceTrack() {
    if (!this.channel?.tracks.length) return;
    this.trackIndex = (this.trackIndex + 1) % this.channel.tracks.length;
    if (this.isPowered) await this.tune();
  }

  async handleTrackError() {
    if (!this.isPowered || !this.channel?.tracks.length) return;
    this.trackIndex = (this.trackIndex + 1) % this.channel.tracks.length;
    await this.tune();
  }

  setVolume(value) {
    this.volume = Math.min(100, Math.max(0, Math.round(value)));
    this.audio.volume = this.volume / 100;
    localStorage.setItem("bennessism-volume", String(this.volume));
    this.dispatchEvent(new CustomEvent("volumechange", { detail: this.volume }));
  }

  emitChannel() {
    this.dispatchEvent(new CustomEvent("channelchange", { detail: this.channel }));
    this.emitState();
  }

  emitState() {
    this.dispatchEvent(
      new CustomEvent("statechange", {
        detail: {
          isPowered: this.isPowered,
          isPlaying: !this.audio.paused,
          isTuning: this.isTuning,
          channel: this.channel,
          track: this.track,
        },
      }),
    );
  }
}
