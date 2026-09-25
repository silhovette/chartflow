"use strict";
CF.Editor = class {
  constructor(chart, onChange) {
    this.chart = chart;
    this.onChange = onChange;
    this.selected = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.snap = 32;
    this.zoom = 1;
    this.offset = 0;
    this.cursor = 0;
    this.cursorLane = 0;
    this.clipboard = [];
    this.clock = new CF.Clock();
    this.playing = false;
    this.preview = false;
    this.drag = null;
    this.lastTick = 0;
  }
  get step() {
    return 1536 / this.snap;
  }
  get scale() {
    return (100 * this.zoom * (this.chart.scrollSpeed / 15)) / 384;
  }
  get notes() {
    return this.chart.notes;
  }
  attach(canvas) {
    this.canvas = canvas;
    canvas.onpointerdown = (e) => this.down(e);
    canvas.onpointermove = (e) => this.move(e);
    canvas.onpointerup = (e) => this.up(e);
    canvas.onpointercancel = () => {
      this.drag = null;
    };
    canvas.oncontextmenu = (e) => {
      e.preventDefault();
      if (this.preview) return;
      this.drag = null;
      const note = this.hit(this.point(e));
      if (note) this.commit(this.notes.filter((n) => n.id !== note.id));
    };
    canvas.onwheel = (e) => {
      e.preventDefault();
      if (this.preview) return;
      const p = this.point(e);
      if (e.ctrlKey || e.metaKey) {
        const anchor = this.tickAt(p.y);
        this.zoom = Math.max(
          0.25,
          Math.min(4, this.zoom * Math.exp(-e.deltaY * 0.002)),
        );
        this.offset = Math.max(0, anchor - (this.line - p.y) / this.scale);
      } else this.offset = Math.max(0, this.offset + e.deltaY / this.scale);
      this.updateUI();
    };
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  tickAt(y) {
    return this.offset + (this.line - y) / this.scale;
  }
  yAt(tick) {
    return this.line - (tick - this.offset) * this.scale;
  }
  laneAt(x) {
    return Math.max(
      0,
      Math.min(
        this.chart.keyCount - 1,
        Math.floor((x - this.left) / this.laneWidth),
      ),
    );
  }
  hit(p) {
    return this.notes.find(
      (n) =>
        Math.abs(this.yAt(n.tick) - p.y) < 8 &&
        p.x > this.left + n.lane * this.laneWidth + 7 &&
        p.x < this.left + (n.lane + 1) * this.laneWidth - 7,
    );
  }
  snapshot() {
    return this.notes.map((n) => ({ ...n }));
  }
  commit(next) {
    const seen = new Set();
    for (const n of next) {
      const k = `${n.lane}:${n.tick}`;
      if (
        n.lane < 0 ||
        n.lane >= this.chart.keyCount ||
        n.tick < 0 ||
        seen.has(k)
      ) {
        CF.ui.toast("Move blocked: notes would overlap or leave the grid.");
        return false;
      }
      seen.add(k);
    }
    if (JSON.stringify(this.notes) === JSON.stringify(next)) return false;
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
    this.chart.notes = next.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
    this.changed();
    return true;
  }
  changed() {
    this.selected = new Set(
      [...this.selected].filter((id) => this.notes.some((n) => n.id === id)),
    );
    this.onChange(this.chart);
    this.updateUI();
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.chart.notes = this.undoStack.pop();
    this.changed();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.chart.notes = this.redoStack.pop();
    this.changed();
  }
  transform(dt, dl) {
    return this.notes.map((n) =>
      this.selected.has(n.id)
        ? { ...n, tick: n.tick + dt, lane: n.lane + dl }
        : { ...n },
    );
  }
  shift(dt, dl) {
    if (this.selected.size) this.commit(this.transform(dt, dl));
  }
  remove() {
    if (this.selected.size)
      this.commit(this.notes.filter((n) => !this.selected.has(n.id)));
  }
  add() {
    const n = {
      id: CF.id(),
      lane: this.cursorLane,
      tick: Math.max(0, Math.round(this.cursor / this.step) * this.step),
    };
    const existing = this.notes.find(
      (note) => note.lane === n.lane && note.tick === n.tick,
    );
    if (existing) {
      this.selected = new Set([existing.id]);
      this.updateUI();
      return;
    }
    if (this.commit([...this.snapshot(), n])) {
      this.selected = new Set([n.id]);
      this.updateUI();
    }
  }
  resnap() {
    if (this.selected.size)
      this.commit(
        this.notes.map((n) =>
          this.selected.has(n.id)
            ? { ...n, tick: Math.round(n.tick / this.step) * this.step }
            : { ...n },
        ),
      );
  }
  copy() {
    this.clipboard = this.notes
      .filter((n) => this.selected.has(n.id))
      .map((n) => ({ ...n }));
    if (this.clipboard.length)
      CF.ui.toast(`${this.clipboard.length} notes copied`);
  }
  paste() {
    if (!this.clipboard.length) return;
    const start = Math.min(...this.clipboard.map((n) => n.tick)),
      lane = Math.min(...this.clipboard.map((n) => n.lane));
    const next = this.clipboard.map((n) => ({
      ...n,
      id: CF.id(),
      tick: n.tick - start + Math.round(this.cursor / this.step) * this.step,
      lane: n.lane - lane + this.cursorLane,
    }));
    if (this.commit([...this.snapshot(), ...next])) {
      this.selected = new Set(next.map((n) => n.id));
      this.updateUI();
    }
  }
  down(e) {
    if (this.preview) return;
    if (e.button !== 0) return;
    this.canvas.focus();
    const p = this.point(e);
    if (p.y < this.top || p.y > this.line + 6) return;
    this.canvas.setPointerCapture(e.pointerId);
    const n = this.hit(p);
    if (n) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        if (this.selected.has(n.id)) this.selected.delete(n.id);
        else this.selected.add(n.id);
      } else if (!this.selected.has(n.id)) this.selected = new Set([n.id]);
      if (!this.selected.has(n.id)) {
        this.drag = null;
        this.updateUI();
        return;
      }
      this.drag = {
        type: "notes",
        p,
        tick: n.tick,
        lane: n.lane,
        dt: 0,
        dl: 0,
      };
    } else {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) this.selected.clear();
      this.cursor = Math.max(
        0,
        Math.round(this.tickAt(p.y) / this.step) * this.step,
      );
      this.cursorLane = this.laneAt(p.x);
      this.clock.seek(CF.toMs(this.cursor, this.chart.bpm));
      this.drag = {
        type: "box",
        p,
        end: p,
        initial: new Set(this.selected),
        moved: false,
        add:
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          p.x > this.left &&
          p.x < this.left + this.laneWidth * this.chart.keyCount,
      };
    }
    this.updateUI();
  }
  move(e) {
    if (!this.drag) return;
    const p = this.point(e),
      d = this.drag;
    if (d.type === "notes") {
      d.dt =
        Math.round((d.tick - (p.y - d.p.y) / this.scale) / this.step) *
          this.step -
        d.tick;
      d.dl = Math.round((p.x - d.p.x) / this.laneWidth);
      if (Math.abs(p.x - d.p.x) + Math.abs(p.y - d.p.y) < 4) {
        d.dt = 0;
        d.dl = 0;
      }
    } else {
      d.end = p;
      if (Math.abs(p.x - d.p.x) + Math.abs(p.y - d.p.y) > 4) {
        d.moved = true;
        this.selected = new Set(d.initial);
        for (const n of this.notes) {
          const x = this.left + (n.lane + 0.5) * this.laneWidth,
            y = this.yAt(n.tick);
          if (
            x >= Math.min(p.x, d.p.x) &&
            x <= Math.max(p.x, d.p.x) &&
            y >= Math.min(p.y, d.p.y) &&
            y <= Math.max(p.y, d.p.y)
          )
            this.selected.add(n.id);
        }
      }
    }
    this.updateUI();
  }
  up(e) {
    if (e && e.button !== 0) return;
    if (this.drag?.type === "box" && !this.drag.moved && this.drag.add)
      this.add();
    if (this.drag?.type === "notes" && (this.drag.dt || this.drag.dl))
      this.commit(this.transform(this.drag.dt, this.drag.dl));
    this.drag = null;
    this.updateUI();
  }
  toggle(audio) {
    if (this.playing) {
      this.clock.pause();
      this.playing = false;
      audio.stop();
    } else {
      if (!this.preview) {
        this.preview = true;
        this.previewOrigin = { cursor: this.cursor, offset: this.offset };
        this.clock.seek(CF.toMs(this.offset, this.chart.bpm));
        this.previewNotes = this.notes
          .filter((n) => n.tick >= this.offset)
          .map((n) => ({
            ...n,
            ms: CF.toMs(n.tick, this.chart.bpm),
            judged: false,
          }));
        this.previewFlashes = [];
        this.previewHits = [];
      }
      this.clock.start();
      this.playing = true;
      audio.unlock();
    }
    this.updateUI();
  }
  stop(audio) {
    if (this.preview) {
      this.clock.pause();
      this.playing = false;
      this.preview = false;
      this.cursor = this.previewOrigin.cursor;
      this.offset = this.previewOrigin.offset;
      audio.stop();
      this.updateUI();
    }
  }
  key(e) {
    if (this.preview) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl) {
      const commands = {
        z: () => (e.shiftKey ? this.redo() : this.undo()),
        y: () => this.redo(),
        a: () => {
          this.selected = new Set(this.notes.map((n) => n.id));
          this.updateUI();
        },
        c: () => this.copy(),
        v: () => this.paste(),
        x: () => {
          this.copy();
          this.remove();
        },
      };
      if (commands[k]) {
        e.preventDefault();
        commands[k]();
        return true;
      }
    }
    const commands = {
      Delete: () => this.remove(),
      Backspace: () => this.remove(),
      ArrowUp: () => this.shift(this.step, 0),
      ArrowDown: () => this.shift(-this.step, 0),
      ArrowLeft: () => this.shift(0, -1),
      ArrowRight: () => this.shift(0, 1),
    };
    if (commands[e.key]) {
      e.preventDefault();
      commands[e.key]();
      return true;
    }
    return false;
  }
  updateUI() {
    const $ = (s) => document.querySelector(s);
    if (!$("#editor-time")) return;
    $("#editor-time").textContent = CF.ui.time(
      CF.toMs(this.cursor, this.chart.bpm),
      true,
    );
    $("#editor-zoom").textContent = `${Math.round(this.zoom * 100)}%`;
    $("#selection-count").textContent = `${this.selected.size} selected`;
    $("#editor-note-count").textContent = `${this.notes.length} notes`;
    $("#undo").disabled = !this.undoStack.length;
    $("#redo").disabled = !this.redoStack.length;
    $("#timeline-play").textContent = this.playing
      ? "Ⅱ Pause"
      : this.preview
        ? "▷ Resume"
        : "▷ Preview";
    $("#stop-preview").hidden = !this.preview;
    document
      .querySelectorAll(
        '[data-action="undo"],[data-action="redo"],[data-action="add-note"],[data-action="resnap"],[data-action="delete-notes"],#snap',
      )
      .forEach((el) => {
        if (this.preview) el.disabled = true;
        else if (el.id !== "undo" && el.id !== "redo") el.disabled = false;
      });
    $("#delete-notes").disabled = this.preview || !this.selected.size;
    $("#resnap").disabled = this.preview || !this.selected.size;
  }
  draw(audio) {
    if (!this.canvas?.isConnected) return;
    if (this.preview) this.advancePreview(audio);
    const { ctx, w, h } = CF.ui.fit(this.canvas);
    this.left = 55;
    this.top = 43;
    this.line = h - 42;
    this.laneWidth = (w - this.left - 22) / this.chart.keyCount;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b121a";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.top, w, this.line - this.top + 9);
    ctx.clip();
    for (let lane = 0; lane <= this.chart.keyCount; lane++) {
      const x = this.left + lane * this.laneWidth;
      ctx.strokeStyle = "#ffffff0b";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (lane < this.chart.keyCount && lane % 2 === 0) {
        ctx.fillStyle = "#ffffff01";
        ctx.fillRect(x, this.top, this.laneWidth, h);
      }
    }
    const minor =
      this.step * this.scale < 8 ? Math.max(this.step, 96) : this.step;
    for (
      let tick = Math.max(0, Math.floor(this.offset / minor) * minor);
      tick < this.offset + h / this.scale;
      tick += minor
    ) {
      const y = this.yAt(tick),
        major = tick % 384 === 0,
        measure = tick % 1536 === 0;
      ctx.strokeStyle = measure
        ? "#8dacac30"
        : major
          ? "#8dacac19"
          : "#8dacac09";
      ctx.beginPath();
      ctx.moveTo(this.left, y);
      ctx.lineTo(w - 22, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = measure ? "#a5b5bd" : "#536575";
        ctx.font = "9px Consolas,monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          `${Math.floor(tick / 1536) + 1}.${((tick / 384) % 4) + 1}`,
          this.left - 12,
          y + 3,
        );
      }
    }
    const display =
      this.drag?.type === "notes"
        ? this.transform(this.drag.dt, this.drag.dl)
        : this.preview
          ? this.previewNotes.filter((n) => !n.judged)
          : this.notes;
    for (const n of display) {
      const y = this.yAt(n.tick);
      if (y < this.top - 10 || y > this.line + 9) continue;
      const x = this.left + n.lane * this.laneWidth + 10,
        selected = this.selected.has(n.id);
      CF.highway.note(ctx, x, y, this.laneWidth - 20, selected);
    }
    const y = this.yAt(this.cursor);
    ctx.fillStyle = "#7fa8ff10";
    ctx.fillRect(this.left, y - 9, w - this.left - 22, 9);
    ctx.strokeStyle = "#7fa8ff";
    ctx.beginPath();
    ctx.moveTo(this.left - 6, y);
    ctx.lineTo(w - 22, y);
    ctx.stroke();
    ctx.fillStyle = "#7fa8ff";
    ctx.beginPath();
    ctx.moveTo(this.left - 7, y - 4);
    ctx.lineTo(this.left, y);
    ctx.lineTo(this.left - 7, y + 4);
    ctx.fill();
    if (this.drag?.type === "box") {
      const { p, end } = this.drag;
      ctx.fillStyle = "#6fe7d213";
      ctx.strokeStyle = "#6fe7d280";
      ctx.fillRect(p.x, p.y, end.x - p.x, end.y - p.y);
      ctx.strokeRect(p.x, p.y, end.x - p.x, end.y - p.y);
    }
    ctx.restore();
    // The fixed judgement line belongs to the editor in both idle and preview.
    ctx.strokeStyle = "#6fe7d28c";
    ctx.beginPath();
    ctx.moveTo(this.left, this.line);
    ctx.lineTo(w - 22, this.line);
    ctx.stroke();
    for (let lane = 0; lane < this.chart.keyCount; lane++) {
      ctx.fillStyle = "#8ec5bca0";
      ctx.fillRect(
        this.left + lane * this.laneWidth + 10,
        this.line - 1,
        this.laneWidth - 20,
        2,
      );
    }
    if (this.preview)
      for (const hit of this.previewHits)
        CF.highway.hitGlow(
          ctx,
          this.left + hit.lane * this.laneWidth + 10,
          this.line,
          this.laneWidth - 20,
          performance.now() - hit.at,
        );
    ctx.font = "9px Consolas,monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#708c94";
    ctx.fillText(
      this.preview
        ? this.playing
          ? "AUTO PREVIEW"
          : "PREVIEW PAUSED"
        : "JUDGEMENT / CURRENT TIME",
      this.left,
      h - 15,
    );
    ctx.fillStyle = "#111a24";
    ctx.fillRect(0, 0, w, this.top);
    ctx.strokeStyle = "#ffffff0b";
    ctx.beginPath();
    ctx.moveTo(0, this.top);
    ctx.lineTo(w, this.top);
    ctx.stroke();
    ctx.font = "10px Consolas,monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#8c9dac";
    const bindings = CF.app.settings.bindings[this.chart.keyCount];
    for (let i = 0; i < this.chart.keyCount; i++)
      ctx.fillText(
        bindings[i].toUpperCase(),
        this.left + (i + 0.5) * this.laneWidth,
        26,
      );
    ctx.textAlign = "left";
    ctx.fillStyle = "#485d6b";
    ctx.font = "8px Consolas,monospace";
    ctx.fillText("BAR", 12, 26);
  }
  advancePreview(audio) {
    const time = this.clock.time(),
      now = performance.now();
    if (this.playing) {
      for (const note of this.previewNotes) {
        if (!note.judged && note.ms <= time) {
          note.judged = true;
          this.previewFlashes[note.lane] = now;
          this.previewHits.push({ lane: note.lane, at: now });
          audio.tone(290 + note.lane * 85, undefined, 0.05, 0.5);
        }
      }
      this.offset = Math.max(0, CF.toTick(time, this.chart.bpm));
      this.cursor = this.offset;
      if (
        time >
        this.previewNotes.reduce(
          (end, n) => Math.max(end, n.ms),
          CF.toMs(this.previewOrigin.cursor, this.chart.bpm),
        ) +
          600
      ) {
        this.clock.pause();
        this.playing = false;
      }
    }
    this.previewHits = this.previewHits.filter((hit) => now - hit.at < 520);
    this.updateUI();
  }
};
