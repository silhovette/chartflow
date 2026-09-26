"use strict";
CF.music = {
  fadeSeconds: 0.6,
  loopOverlap: 0.8,
  screen: "loading",
  ready: false,
  intro: false,
  volume: 1,
  levels: new WeakMap(),
  fades: new Map(),
  setLevel(media, level) {
    this.levels.set(media, level);
    media.volume = level * this.volume;
  },
  setVolume(volume) {
    this.volume = volume;
    const media = new Set([...(this.background || []), ...this.fades.keys(), this.introMedia, this.previewMedia]);
    for (const track of media) {
      if (track) track.volume = (this.levels.get(track) ?? 0) * volume;
    }
  },
  wake(delay = 20) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), delay);
  },
  watchTiming(media) {
    for (const event of ["loadedmetadata", "playing", "pause", "seeking", "seeked", "ratechange"])
      media.addEventListener(event, () => this.wake());
  },
  fade(media, target, seconds = this.fadeSeconds, done) {
    this.fades.set(media, {
      from: this.levels.get(media) ?? 0, target, start: performance.now(),
      duration: seconds * 1000, done,
    });
    this.wake();
  },
  setScreen(screen) {
    this.screen = screen;
    this.update();
  },
  setIntro(active) {
    this.intro = active;
    if (!active) this.ready = true;
    this.update();
  },
  update() {
    const wanted = this.ready && !this.intro && !this.continuingIntro && !this.previewMedia &&
      !["loading", "error", "record", "processing", "play", "results", "editor"].includes(this.screen);
    if (this.wanted === wanted) return;
    this.wanted = wanted;
    if (wanted) this.playBackground();
    else for (const media of this.background || []) {
      this.fade(media, 0, this.fadeSeconds, () => media.pause());
    }
  },
  previewIntro() {
    let media = this.previewMedia;
    if (!media) {
      media = this.previewMedia = new Audio("audio/intro.ogg");
      media.onended = media.onerror = () => this.stopPreview();
    }
    this.setLevel(media, 1);
    media.currentTime = 0;
    this.update();
    media.play().catch((error) => {
      if (this.previewMedia !== media || error.name === "AbortError") return;
      this.stopPreview();
      CF.ui.toast("Music preview could not play.");
    });
  },
  stopPreview() {
    const media = this.previewMedia;
    if (!media) return;
    this.previewMedia = null;
    media.onended = media.onerror = null;
    media.pause();
    media.removeAttribute("src");
    media.load();
    this.update();
  },
  async playBackground() {
    if (!this.wanted || this.starting) return;
    if (!this.background) {
      this.background = Array.from({ length: 2 }, (_, index) => {
        const media = new Audio("audio/background.mp3");
        this.watchTiming(media);
        media.preload = "auto";
        this.setLevel(media, 0);
        media.onended = () => {
          if (this.wanted && this.current === index) this.nextLoop();
        };
        return media;
      });
      this.current = 0;
    }
    this.starting = true;
    const media = this.background[this.current];
    if (media.paused) {
      this.fades.delete(media);
      this.setLevel(media, 0);
    }
    try {
      await media.play();
      if (this.wanted) this.fade(media, 1);
      else this.fade(media, 0, this.fadeSeconds, () => media.pause());
    } catch (error) {
      if (error.name !== "NotAllowedError" && error.name !== "AbortError")
        console.warn("Background music could not play:", error);
    } finally {
      this.starting = false;
    }
  },
  async nextLoop() {
    if (this.switching || !this.wanted) return;
    this.switching = true;
    const previous = this.background[this.current];
    const nextIndex = 1 - this.current;
    const next = this.background[nextIndex];
    this.fades.delete(next);
    this.setLevel(next, 0);
    next.currentTime = 0;
    try {
      await next.play();
      if (!this.wanted) {
        next.pause();
        return;
      }
      this.current = nextIndex;
      const overlap = Math.max(0.05, Math.min(this.loopOverlap, previous.duration - previous.currentTime));
      this.fade(previous, 0, overlap, () => previous.pause());
      this.fade(next, 1, overlap);
    } catch (error) {
      if (error.name !== "NotAllowedError" && error.name !== "AbortError")
        console.warn("Background loop could not start:", error);
    } finally {
      this.switching = false;
    }
  },
  watchIntro(media) {
    if (this.introMedia !== media) this.watchTiming(media);
    this.introMedia = media;
    this.introEnding = false;
    this.fade(media, 1);
  },
  continueIntro(media) {
    this.continuingIntro = media;
    if (this.introMedia !== media) this.watchIntro(media);
    const finish = () => {
      if (this.continuingIntro !== media) return;
      this.continuingIntro = null;
      if (this.introMedia === media) this.introMedia = null;
      this.fades.delete(media);
      media.onended = media.onerror = null;
      media.removeAttribute("src");
      media.load();
      this.update();
    };
    media.onended = media.onerror = finish;
    if (media.ended) finish();
    else if (media.paused) media.play().catch(finish);
    this.update();
  },
  stopIntro(media) {
    if (this.introMedia === media) this.introMedia = null;
    media.onerror = null;
    this.fade(media, 0, this.fadeSeconds, () => {
      media.pause();
      media.removeAttribute("src");
      media.load();
    });
  },
  tick() {
    this.timer = null;
    const now = performance.now();
    for (const [media, fade] of this.fades) {
      const progress = Math.min(1, (now - fade.start) / fade.duration);
      const eased = progress * progress * (3 - 2 * progress);
      this.setLevel(media, fade.from + (fade.target - fade.from) * eased);
      if (progress === 1) {
        this.fades.delete(media);
        fade.done?.();
      }
    }
    const intro = this.introMedia;
    if (intro && !intro.paused && !this.introEnding &&
        Number.isFinite(intro.duration) && intro.duration - intro.currentTime <= this.fadeSeconds) {
      this.introEnding = true;
      this.fade(intro, 0, Math.max(0.01, intro.duration - intro.currentTime));
    }
    const media = this.background?.[this.current];
    if (this.wanted && media && !media.paused &&
        Number.isFinite(media.duration) && media.duration - media.currentTime <= this.loopOverlap) {
      this.nextLoop();
    }
    // Keep the existing 20 ms fade steps; steady playback only needs a check
    // near a fade/loop boundary. Seeking and rate changes wake this immediately.
    let delay = this.fades.size ? 20 : Infinity;
    for (const [track, margin] of [[intro, this.fadeSeconds],
      [this.wanted ? media : null, this.loopOverlap]]) {
      if (!track || track.paused || track.ended) continue;
      const remaining = (track.duration - track.currentTime - margin) /
        (track.playbackRate || 1) * 1000;
      delay = Math.min(delay, Number.isFinite(remaining)
        ? Math.max(20, Math.min(1000, remaining)) : 1000);
    }
    if (Number.isFinite(delay)) this.wake(delay);
  },
};
// A real interaction can unlock background audio when browser autoplay is blocked.
for (const event of ["pointerdown", "keydown"]) {
  document.addEventListener(event, () => {
    const music = CF.music;
    if (music.wanted && music.background?.[music.current]?.paused) music.playBackground();
  });
}
