"use strict";
CF.guide = {
  pages: [
    [
      "THE FLOW",
      "Welcome to ChartFlow",
      `<p>ChartFlow lets you <strong>perform a rhythm first, then turn it into a playable chart</strong>.</p><p>No manual note placement is required to get started.</p><div class="guide-flow" aria-label="Perform, shape, play"><span>01<strong>Perform</strong>Find your rhythm</span><span>02<strong>Shape</strong>Make it precise</span><span>03<strong>Play</strong>Feel the flow</span></div>`,
    ],
    [
      "01 / CREATE",
      "Create a Chart",
      `<p>Choose <strong>New Chart</strong>, then set:</p><dl class="guide-fields"><div><dt>Name</dt><dd>Your chart name</dd></div><div><dt>Keys</dt><dd>4K, 5K, 6K, or more</dd></div><div><dt>BPM</dt><dd>The tempo of your rhythm</dd></div><div><dt>Scroll Speed</dt><dd>How fast notes move during play</dd></div></dl><p>Check your lane keys, then choose <strong>Record a Performance</strong>.</p>`,
    ],
    [
      "02 / PERFORM",
      "Perform Your Rhythm",
      `<p>The recording screen starts empty.</p><p class="guide-callout">Press Space to start an 8-beat metronome countdown at your chosen BPM.</p><p>After two 4/4 bars, recording starts automatically on the next downbeat, even if you play no notes. Then play any rhythm you want using the lane keys. You can press multiple keys at the same time to create chords.</p><p>No notes are shown while recording — just follow the beat and play naturally.</p>`,
    ],
    [
      "03 / FINISH",
      "Finish the Recording",
      `<div class="guide-key"><kbd>Enter</kbd><span>Finish your performance</span></div><p>Press <strong>Enter</strong> when you are done.</p><p>ChartFlow will automatically clean up your timing to a certain extent.</p><p>Your original performance timing is also preserved.</p>`,
    ],
    [
      "04 / PLAY",
      "Play Your Chart",
      `<p>After recording, choose <strong>Play</strong> to try the chart as a falling-note rhythm game.</p><p class="guide-callout">Hit notes when they reach the judgment line.</p><div class="guide-key"><kbd>P</kbd><span>Pause / resume</span></div><p>Press <strong>P</strong> to pause or resume.</p>`,
    ],
    [
      "05 / REFINE",
      "Refine It in the Editor",
      `<p>Choose <strong>Edit</strong> to fine-tune your chart.</p><ul><li>Drag notes to change their timing or lane</li><li>Select and move multiple notes together</li><li>Add or delete notes</li><li>Copy and paste patterns</li><li>Undo and redo changes</li><li>Change <strong>Snap</strong> for precise editing</li><li>Test the chart instantly</li></ul>`,
    ],
    [
      "QUICK REFERENCE",
      "Essential Controls",
      `<table class="guide-controls"><thead><tr><th>Control</th><th>Action</th></tr></thead><tbody>${[
        ["P", "Pause / resume"],
        ["Space", "Start recording with an 8-beat count-in"],
        ["Enter", "Finish recording"],
        ["Esc", "Back / cancel"],
        ["Ctrl + Z", "Undo"],
        ["Ctrl + Y", "Redo"],
        ["Ctrl + C / V", "Copy / paste"],
        ["Delete", "Delete selected notes"],
        ["Mouse Wheel", "Scroll through the editor"],
        ["Ctrl + Wheel", "Zoom the timeline"],
      ]
        .map(
          ([key, action]) =>
            `<tr><td><kbd>${key}</kbd></td><td>${action}</td></tr>`,
        )
        .join("")}</tbody></table>`,
    ],
    [
      "YOUR NEXT CHAPTER",
      "Perform. Shape. Play.",
      `<p class="guide-signoff">That’s the flow.</p>`,
    ],
  ],
  async firstVisit() {
    const seen = await CF.storage.request("settings", "readonly", (s) =>
      s.get("guideSeen"),
    );
    this.open({ introOnly: !!seen, showIntro: true });
  },
  open({ introOnly = false, showIntro = introOnly } = {}) {
    this.dialog = document.querySelector("#guide");
    if (this.dialog.open) return;
    this.introOnly = introOnly;
    clearTimeout(this.exitTimer);
    this.firstStep = showIntro ? -1 : 0;
    this.step = this.firstStep;
    this.busy = false;
    this.closing = false;
    this.introSeen = false;
    this.lastIntroSpace = null;
    this.navigation = 0;
    this.lastWheel = 0;
    this.wheelDelta = 0;
    this.wheelUsed = false;
    this.dialog.innerHTML = "";
    this.dialog.oncancel = (e) => {
      e.preventDefault();
      this.close();
    };
    this.dialog.onkeydown = (e) => {
      if (e.code === "Space" && this.step === -1 &&
          !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || this.closing) return;
        const now = performance.now();
        if (this.lastIntroSpace !== null && now - this.lastIntroSpace <= 450) {
          this.lastIntroSpace = null;
          this.close({ preserveAudio: true });
        } else this.lastIntroSpace = now;
        return;
      }
      if (
        !["ArrowLeft", "ArrowRight"].includes(e.key) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      if (
        this.introOnly ||
        this.closing ||
        (this.step === -1 && !this.intro?.done)
      )
        return;
      if (e.key === "ArrowLeft" && this.step > this.firstStep) this.go(-1);
      if (e.key === "ArrowRight") {
        if (this.step === this.pages.length - 1) this.close();
        else this.go(1);
      }
    };
    this.dialog.onwheel = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !e.deltaY ||
          Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      // Treat a trackpad gesture and its inertia as one page turn.
      if (now - this.lastWheel > 180) {
        this.wheelDelta = 0;
        this.wheelUsed = false;
      }
      this.lastWheel = now;
      if (this.introOnly || this.closing || this.busy || this.wheelUsed ||
          (this.step === -1 && !this.intro?.done)) return;
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.dialog.clientHeight : 1;
      if (Math.sign(e.deltaY) !== Math.sign(this.wheelDelta)) this.wheelDelta = 0;
      this.wheelDelta += e.deltaY * scale;
      if (Math.abs(this.wheelDelta) < 40) return;
      this.wheelUsed = true;
      if (this.wheelDelta > 0 && this.step === this.pages.length - 1) this.close();
      else this.go(Math.sign(this.wheelDelta));
    };
    if (showIntro || matchMedia("(prefers-reduced-motion: reduce)").matches)
      delete this.dialog.dataset.state;
    else this.dialog.dataset.state = "opening";
    this.dialog.onanimationend = (event) => {
      if (event.target === this.dialog && event.animationName === "guide-enter" &&
          this.dialog.dataset.state === "opening") delete this.dialog.dataset.state;
    };
    this.dialog.showModal();
    document.body.classList.add("guide-open");
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.dialog);
    this.render();
    document.body.classList.remove("startup-pending");
    this.dialog.querySelector("#guide-title").focus({ preventScroll: true });
  },
  playIntroMusic(startAnimation) {
    this.stopIntroMusic();
    const music = new Audio("audio/intro.ogg");
    this.introMusic = music;
    music.preload = "auto";
    music.volume = 0;
    let started = false;
    const active = () => this.introMusic === music && this.dialog.open && !this.closing;
    const begin = () => {
      if (!active() || started) return;
      started = true;
      if (!music.paused) CF.music.watchIntro(music);
      startAnimation(music.currentTime);
    };
    // Start together when playback succeeds; never block the opening on audio permission.
    music.onerror = begin;
    music.play().then(begin).catch((error) => {
      if (error.name !== "AbortError") begin();
    });
  },
  stopIntroMusic() {
    if (this.introMusic) {
      CF.music.stopIntro(this.introMusic);
      this.introMusic = null;
    }
  },
  motion(element, frames, duration) {
    return element
      .animate(frames, {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : duration,
        easing: "cubic-bezier(.22,1,.36,1)",
      })
      .finished.catch(() => {});
  },
  fit() {
    const stage = this.dialog.querySelector(".guide-scroll"),
      body = this.dialog.querySelector(".guide-body");
    if (!stage || !body) {
      this.intro?.resize();
      return;
    }
    body.style.transform = "translate(-50%, -50%)";
    const width = stage.clientWidth - 32,
      height = stage.clientHeight - 16;
    const scale = Math.min(
      1,
      Math.max(1, width) / body.scrollWidth,
      Math.max(1, height) / body.scrollHeight,
    );
    body.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
    this.intro?.resize();
  },
  render() {
    this.intro?.stop();
    this.stopIntroMusic();
    this.intro = null;
    const intro = this.step === -1;
    CF.music.setIntro(intro);
    const [label, title, body] = intro
      ? ["", "Welcome to ChartFlow", ""]
      : this.pages[this.step];
    this.dialog.dataset.intro = intro;
    this.dialog.dataset.finale = this.step === this.pages.length - 1;
    this.dialog.classList.remove("intro-ready");

    if (!this.dialog.querySelector(".guide-top")) {
      this.dialog.innerHTML =
        '<div class="guide-top"><span class="eyebrow">CHARTFLOW / GETTING STARTED</span><button class="guide-nav" data-guide="close">Skip guide ↗</button></div><div class="guide-scroll"></div><footer class="guide-footer"><div class="guide-position"><span class="guide-page-number" aria-live="polite"></span><div class="guide-progress" aria-hidden="true"><i></i></div></div><div class="actions"><button class="guide-nav" data-guide="back">← Back</button><button class="guide-nav guide-next" data-guide="next"></button></div></footer>';
      this.dialog.querySelector('[data-guide="close"]').onclick = () =>
        this.close();
      this.dialog.querySelector('[data-guide="back"]').onclick = () =>
        this.go(-1);
      this.dialog.querySelector('[data-guide="next"]').onclick = () =>
        this.step === this.pages.length - 1 ? this.close() : this.go(1);
    }
    this.dialog.querySelector(".guide-scroll").innerHTML = intro
      ? '<div class="guide-intro-scene"><canvas aria-hidden="true"></canvas><h2 id="guide-title" class="guide-intro-title" tabindex="-1">Welcome to ChartFlow</h2></div>'
      : `<div class="guide-body"><div class="guide-page"><div class="section-kicker">${label}</div><h2 id="guide-title" tabindex="-1">${title}</h2>${body}</div></div>`;
    this.dialog.querySelector(".guide-page-number").innerHTML = intro
      ? "INTRO"
      : `${String(this.step + 1).padStart(2, "0")} <span>/ ${String(this.pages.length).padStart(2, "0")}</span>`;
    this.dialog.querySelector(".guide-progress i").style.width =
      (intro ? 0 : ((this.step + 1) / this.pages.length) * 100) + "%";
    this.dialog.querySelector('[data-guide="back"]').disabled = this.step === this.firstStep;
    this.dialog.querySelector('[data-guide="next"]').textContent =
      this.step === this.pages.length - 1 ? "Let’s begin ↗" : "Continue →";
    this.dialog.querySelector(".guide-top").inert = intro;
    this.dialog.querySelector(".guide-footer").inert = intro;
    this.fit();
    if (intro) {
      this.playIntroMusic((elapsed) => {
        this.intro = new CF.GuideIntro(
          this.dialog.querySelector(".guide-intro-scene"),
          () => {
            this.introSeen = true;
            if (this.introOnly) {
              this.exitTimer = setTimeout(() => this.close(), 950);
              return;
            }
            this.dialog.classList.add("intro-ready");
            this.dialog.querySelector(".guide-top").inert = false;
            this.dialog.querySelector(".guide-footer").inert = false;
          },
          false,
          this.introOnly,
        );
        this.intro.start -= elapsed * 1000;
      });
    }
  },
  async go(delta) {
    if (this.introOnly || this.closing) return;
    const next = Math.max(
      this.firstStep,
      Math.min(this.pages.length - 1, this.step + delta),
    );
    if (next === this.step) return;
    this.step = next;
    const token = ++this.navigation;
    this.busy = true;
    this.transition?.cancel();
    this.render();
    this.dialog.querySelector("#guide-title").focus({ preventScroll: true });
    if (this.step >= 0) {
      this.transition = this.dialog.querySelector(".guide-page").animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 750,
          easing: "cubic-bezier(.4,0,.2,1)",
        },
      );
      await this.transition.finished.catch(() => {});
    }
    if (token === this.navigation) this.busy = false;
  },
  async close({ preserveAudio = false } = {}) {
    if (this.closing || !this.dialog.open) return;
    this.closing = true;
    clearTimeout(this.exitTimer);
    this.navigation++;
    this.transition?.cancel();
    this.busy = true;
    this.intro?.stop();
    if (preserveAudio && this.introMusic) {
      CF.music.continueIntro(this.introMusic);
      this.introMusic = null;
    } else this.stopIntroMusic();
    this.observer?.disconnect();
    const opacity = +getComputedStyle(this.dialog).opacity;
    this.dialog.dataset.state = "closing";
    let cover;
    if (this.introOnly || preserveAudio) {
      await this.motion(this.dialog, [{ opacity }, { opacity: 0 }], 900);
    } else {
      cover = document.createElement("div");
      cover.className = "guide-exit";
      document.body.append(cover);
      await this.motion(this.dialog, [{ opacity }, { opacity: 0 }], 380);
    }
    this.dialog.close();
    CF.music.setIntro(false);
    document.body.classList.remove("guide-open");
    delete this.dialog.dataset.state;
    if (cover) {
      await this.motion(cover, [{ opacity: 1 }, { opacity: 0 }], 900);
      cover.remove();
    }
    this.busy = false;
    this.closing = false;
    CF.storage
      .request("settings", "readwrite", (s) => s.put(true, "guideSeen"))
      .catch(() => CF.ui.toast("Guide preference could not be saved."));
  },
};
