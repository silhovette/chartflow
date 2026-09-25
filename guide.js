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
      `<p class="guide-signoff">That’s the flow.</p><div class="guide-finale-mark" aria-hidden="true">≋</div>`,
    ],
  ],
  async firstVisit() {
    const seen = await CF.storage.request("settings", "readonly", (s) =>
      s.get("guideSeen"),
    );
    if (!seen) this.open();
  },
  open() {
    this.dialog = document.querySelector("#guide");
    if (this.dialog.open) return;
    this.step = 0;
    this.busy = false;
    this.dialog.oncancel = (e) => {
      e.preventDefault();
      this.close();
    };
    this.render();
    this.dialog.showModal();
    document.body.classList.add("guide-open");
    this.dialog.querySelector("#guide-title").focus({ preventScroll: true });
    this.motion(this.dialog, [{ opacity: 0 }, { opacity: 1 }], 650);
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
  render() {
    const [label, title, body] = this.pages[this.step];
    this.dialog.dataset.finale = this.step === this.pages.length - 1;
    this.dialog.innerHTML = `<div class="guide-top"><span class="eyebrow">CHARTFLOW / GETTING STARTED</span><button class="guide-nav" data-guide="close">Skip guide ↗</button></div><div class="guide-scroll"><div class="guide-body"><div class="section-kicker">${label}</div><h2 id="guide-title" tabindex="-1">${title}</h2>${body}</div></div><footer class="guide-footer"><div class="guide-position"><span aria-live="polite">${String(this.step + 1).padStart(2, "0")} <span>/ ${String(this.pages.length).padStart(2, "0")}</span></span><div class="guide-progress" aria-hidden="true"><i style="width:${((this.step + 1) / this.pages.length) * 100}%"></i></div></div><div class="actions"><button class="guide-nav" data-guide="back" ${this.step === 0 ? "disabled" : ""}>← Back</button><button class="guide-nav guide-next" data-guide="next">${this.step === this.pages.length - 1 ? "Let’s begin ↗" : "Continue →"}</button></div></footer>`;
    this.dialog.querySelector('[data-guide="close"]').onclick = () =>
      this.close();
    this.dialog.querySelector('[data-guide="back"]').onclick = () =>
      this.go(-1);
    this.dialog.querySelector('[data-guide="next"]').onclick = () =>
      this.step === this.pages.length - 1 ? this.close() : this.go(1);
  },
  async go(delta) {
    if (this.busy) return;
    this.busy = true;
    await this.motion(
      this.dialog.querySelector(".guide-body"),
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-8px)" },
      ],
      220,
    );
    this.step = Math.max(0, Math.min(this.pages.length - 1, this.step + delta));
    this.render();
    this.dialog.querySelector("#guide-title").focus({ preventScroll: true });
    await this.motion(
      this.dialog.querySelector(".guide-body"),
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      480,
    );
    this.busy = false;
  },
  async close() {
    if (this.busy) return;
    this.busy = true;
    await this.motion(this.dialog, [{ opacity: 1 }, { opacity: 0 }], 300);
    this.dialog.close();
    document.body.classList.remove("guide-open");
    this.busy = false;
    CF.storage
      .request("settings", "readwrite", (s) => s.put(true, "guideSeen"))
      .catch(() => CF.ui.toast("Guide preference could not be saved."));
  },
};
