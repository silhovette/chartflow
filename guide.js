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
      `<p>The recording screen starts empty.</p><p class="guide-callout">Your first lane key starts the recording and the metronome.</p><p>Play any rhythm you want using the lane keys. You can press multiple keys at the same time to create chords.</p><p>No notes are shown while recording — just follow the beat and play naturally.</p>`,
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
    this.open({ introOnly: !!seen });
  },
  open({ introOnly = false } = {}) {
    this.dialog = document.querySelector("#guide");
    if (this.dialog.open) return;
    this.introOnly = introOnly;
    clearTimeout(this.exitTimer);
    this.step = -1;
    this.busy = false;
    this.closing = false;
    this.introSeen = false;
    this.navigation = 0;
    this.dialog.innerHTML = "";
    this.dialog.oncancel = (e) => {
      e.preventDefault();
      this.close();
    };
    this.dialog.onkeydown = (e) => {
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
      if (e.key === "ArrowLeft" && this.step > -1) this.go(-1);
      if (e.key === "ArrowRight") {
        if (this.step === this.pages.length - 1) this.close();
        else this.go(1);
      }
    };
    this.dialog.showModal();
    document.body.classList.add("guide-open");
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.dialog);
    this.render();
    document.body.classList.remove("startup-pending");
    this.dialog.querySelector("#guide-title").focus({ preventScroll: true });
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
    this.intro = null;
    const intro = this.step === -1;
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
    this.dialog.querySelector('[data-guide="back"]').disabled = intro;
    this.dialog.querySelector('[data-guide="next"]').textContent =
      this.step === this.pages.length - 1 ? "Let’s begin ↗" : "Continue →";
    this.dialog.querySelector(".guide-top").inert = intro;
    this.dialog.querySelector(".guide-footer").inert = intro;
    this.fit();
    if (intro)
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
        this.introSeen,
        this.introOnly,
      );
  },
  async go(delta) {
    if (this.introOnly || this.closing) return;
    const next = Math.max(
      -1,
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
  async close() {
    if (this.closing || !this.dialog.open) return;
    this.closing = true;
    clearTimeout(this.exitTimer);
    this.navigation++;
    this.transition?.cancel();
    this.busy = true;
    this.intro?.stop();
    this.observer?.disconnect();
    let cover;
    if (this.introOnly) {
      this.dialog.dataset.state = "closing";
      await this.motion(this.dialog, [{ opacity: 1 }, { opacity: 0 }], 900);
    } else {
      cover = document.createElement("div");
      cover.className = "guide-exit";
      document.body.append(cover);
      await this.motion(this.dialog, [{ opacity: 1 }, { opacity: 0 }], 380);
    }
    this.dialog.close();
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
