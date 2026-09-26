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
      this.updateUI();
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
        this.scrollTarget = null;
        const anchor = this.tickAt(p.y);
        this.zoom = Math.max(
          0.25,
          Math.min(4, this.zoom * Math.exp(-e.deltaY * 0.002)),
        );
        this.offset = Math.max(0, anchor - (this.line - p.y) / this.scale);
      } else {
        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1);
        this.scrollTarget = Math.max(0, (this.scrollTarget ?? this.offset) - delta / this.scale);
        this.scrollTime = performance.now();
      }
      this.updateUI();
    };
  }
  advanceScroll(now) {
    if (this.scrollTarget == null) return;
    const elapsed = Math.max(0, now - this.scrollTime);
    this.scrollTime = now;
    this.offset += (this.scrollTarget - this.offset) * (1 - Math.exp(-elapsed / 70));
    if (Math.abs(this.scrollTarget - this.offset) * this.scale < 0.2) {
      this.offset = this.scrollTarget;
      this.scrollTarget = null;
    }
  }
  jumpToStart(audio) {
    this.stop(audio);
    this.cursor = this.offset = 0;
    this.clock.seek(0);
    this.updateUI();
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
    for (let i = this.firstAtY(this.notes, p.y + 8); i < this.notes.length; i++) {
      const n = this.notes[i], y = this.yAt(n.tick);
      if (y <= p.y - 8) break;
      if (Math.abs(y - p.y) < 8 &&
        p.x > this.left + n.lane * this.laneWidth + 7 &&
        p.x < this.left + (n.lane + 1) * this.laneWidth - 7)
        return n;
    }
  }
  firstAtY(notes, y, dt = 0, exclusive = false) {
    let low = 0, high = notes.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const noteY = this.yAt(notes[mid].tick + dt);
      if (exclusive ? noteY >= y : noteY > y) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  history(next) {
    const before = this.notes, removed = [], added = [];
    let i = 0, j = 0;
    // Keep positions only for changed notes. Shared notes form the unchanged
    // subsequence, including when a move crosses other notes or changes order.
    while (i < before.length || j < next.length) {
      if (i < before.length && j < next.length && before[i] === next[j]) {
        i++; j++;
      } else if (j === next.length ||
          (i < before.length && before[i].tick < next[j].tick)) {
        removed.push(i, before[i++]);
      } else if (i === before.length || next[j].tick < before[i].tick) {
        added.push(j, next[j++]);
      } else {
        removed.push(i, before[i++]);
        added.push(j, next[j++]);
      }
      // Large edits are cheaper to retain as shared immutable arrays.
      if (removed.length + added.length >= before.length + next.length)
        return { before, after: next };
    }
    return { removed, added };
  }
  restore(entry, reverse) {
    if (entry.before) return reverse ? entry.before : entry.after;
    const remove = reverse ? entry.added : entry.removed,
      insert = reverse ? entry.removed : entry.added,
      notes = this.notes,
      next = new Array(notes.length + (insert.length - remove.length) / 2);
    let source = 0, r = 0, a = 0;
    for (let target = 0; target < next.length; target++) {
      if (a < insert.length && insert[a] === target) {
        next[target] = insert[a + 1];
        a += 2;
      } else {
        while (r < remove.length && remove[r] === source) {
          source++;
          r += 2;
        }
        next[target] = notes[source++];
      }
    }
    return next;
  }
  commit(next) {
    let sorted = true, previous;
    for (const n of next) {
      if (
        n.lane < 0 ||
        n.lane >= this.chart.keyCount ||
        n.tick < 0
      ) {
        CF.ui.toast("Move blocked: notes would overlap or leave the grid.");
        return false;
      }
      if (previous && (previous.tick > n.tick ||
          (previous.tick === n.tick && previous.lane > n.lane))) sorted = false;
      previous = n;
    }
    const unchanged = this.notes.length === next.length && this.notes.every((n, i) =>
      n === next[i] || JSON.stringify(n) === JSON.stringify(next[i]));
    if (!sorted) {
      if (next === this.notes) next = next.slice();
      next.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
    }
    // Sorting places collisions next to each other; no full-chart Set needed.
    for (let i = 1; i < next.length; i++) {
      if (next[i - 1].tick === next[i].tick && next[i - 1].lane === next[i].lane) {
        CF.ui.toast("Move blocked: notes would overlap or leave the grid.");
        return false;
      }
    }
    if (unchanged) return false;
    this.undoStack.push(this.history(next));
    this.redoStack = [];
    this.chart.notes = next;
    this.changed();
    return true;
  }
  changed() {
    if (this.selected.size) {
      const ids = new Set();
      for (const n of this.notes)
        if (this.selected.has(n.id)) ids.add(n.id);
      this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
    }
    this.onChange(this.chart);
    this.updateUI();
  }
  undo() {
    if (!this.undoStack.length) return;
    const entry = this.undoStack.pop();
    this.chart.notes = this.restore(entry, true);
    this.redoStack.push(entry);
    this.changed();
  }
  redo() {
    if (!this.redoStack.length) return;
    const entry = this.redoStack.pop();
    this.chart.notes = this.restore(entry, false);
    this.undoStack.push(entry);
    this.changed();
  }
  transform(dt, dl) {
    return this.notes.map((n) =>
      this.selected.has(n.id)
        ? { ...n, tick: n.tick + dt, lane: n.lane + dl }
        : n,
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
    if (this.commit([...this.notes, n])) {
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
            : n,
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
    if (this.commit([...this.notes, ...next])) {
      this.selected = new Set(next.map((n) => n.id));
      this.updateUI();
    }
  }
  down(e) {
    if (this.preview) return;
    if (e.button !== 0) return;
    this.scrollTarget = null;
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
        const minX = Math.min(p.x, d.p.x), maxX = Math.max(p.x, d.p.x),
          minY = Math.min(p.y, d.p.y), maxY = Math.max(p.y, d.p.y);
        for (let i = this.firstAtY(this.notes, maxY); i < this.notes.length; i++) {
          const n = this.notes[i];
          const x = this.left + (n.lane + 0.5) * this.laneWidth,
            y = this.yAt(n.tick);
          if (y < minY) break;
          if (
            x >= minX && x <= maxX && y >= minY && y <= maxY
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
    this.scrollTarget = null;
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
        this.previewHead = 0;
        this.previewEnd = this.previewNotes.reduce(
          (end, n) => Math.max(end, n.ms),
          CF.toMs(this.previewOrigin.cursor, this.chart.bpm),
        );
      }
      this.clock.start();
      this.playing = true;
      audio.unlock();
    }
    this.updateUI();
  }
  stop(audio) {
    this.scrollTarget = null;
    if (this.preview) {
      this.clock.pause();
      this.playing = false;
      this.preview = false;
      this.cursor = this.previewOrigin.cursor;
      this.offset = this.previewOrigin.offset;
      this.previewNotes = [];
      this.previewHits = [];
      this.previewFlashes = [];
      this.previewOrigin = null;
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
    this.dirty = true;
    CF.app?.requestFrame?.();
    const $ = (s) => document.querySelector(s);
    if (!$("#editor-time")) return;
    this.updateTime();
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
        '[data-action="undo"],[data-action="redo"],[data-action="add-note"],[data-action="resnap"],#snap',
      )
      .forEach((el) => {
        if (this.preview) el.disabled = true;
        else if (el.id !== "undo" && el.id !== "redo") el.disabled = false;
      });
    $("#resnap").disabled = this.preview || !this.selected.size;
  }
  updateTime() {
    const el = document.querySelector("#editor-time");
    if (!el) return;
    const text = CF.ui.time(CF.toMs(this.cursor, this.chart.bpm), true);
    if (el.textContent !== text) el.textContent = text;
  }
  draw(audio) {
    if (!this.canvas?.isConnected) return;
    this.advanceScroll(performance.now());
    if (this.preview) {
      // Repaint the final frame that clears a fading hit before becoming idle.
      if (this.previewHits.length) this.dirty = true;
      if (this.playing || this.previewHits.length) this.advancePreview(audio);
    }
    const { ctx, w, h } = CF.ui.fit(this.canvas);
    // Static editor frames only need repainting after input or a size change.
    const previous = this.rendered;
    if (
      !this.playing && !this.previewHits?.length && !this.dirty && previous &&
      previous.w === w && previous.h === h &&
      previous.dpr === devicePixelRatio && previous.canvas === this.canvas &&
      previous.offset === this.offset && previous.zoom === this.zoom &&
      previous.cursor === this.cursor && previous.snap === this.snap &&
      previous.notes === this.notes && previous.speed === this.chart.scrollSpeed &&
      previous.drag === this.drag
    )
      return;
    this.rendered = {
      w, h, dpr: devicePixelRatio, canvas: this.canvas,
      offset: this.offset, zoom: this.zoom, cursor: this.cursor, snap: this.snap,
      notes: this.notes, speed: this.chart.scrollSpeed, drag: this.drag,
    };
    this.dirty = false;
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
    const display = this.preview ? this.previewNotes : this.notes;
    const moving = this.drag?.type === "notes";
    // Include both the stationary and shifted intervals, retaining paint order.
    const dt = moving ? this.drag.dt : 0;
    const start = this.firstAtY(display, this.line + 9),
      end = this.firstAtY(display, this.top - 10, 0, true),
      shiftedStart = dt ? this.firstAtY(display, this.line + 9, dt) : start,
      shiftedEnd = dt ? this.firstAtY(display, this.top - 10, dt, true) : end;
    const first = Math.min(start, shiftedStart), last = Math.max(end, shiftedEnd),
      gapStart = Math.min(end, shiftedEnd), gapEnd = Math.max(start, shiftedStart);
    for (let i = first; i < last; i++) {
      // A long drag can leave thousands of invisible notes between the two
      // intervals. Jump that gap while preserving the original paint order.
      if (i >= gapStart && i < gapEnd) i = gapEnd;
      if (i >= last) break;
      const n = display[i];
      if (this.preview && n.judged) continue;
      const selected = this.selected.has(n.id);
      const y = this.yAt(n.tick + (moving && selected ? this.drag.dt : 0));
      if (y < this.top - 10 || y > this.line + 9) continue;
      const lane = n.lane + (moving && selected ? this.drag.dl : 0);
      const x = this.left + lane * this.laneWidth + 10;
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
      while (this.previewHead < this.previewNotes.length) {
        const note = this.previewNotes[this.previewHead];
        if (note.ms > time) break;
        this.previewHead++;
        if (!note.judged) {
          note.judged = true;
          this.previewFlashes[note.lane] = now;
          this.previewHits.push({ lane: note.lane, at: now });
          audio.tone(290 + note.lane * 85, undefined, 0.05, 0.25);
        }
      }
      this.offset = Math.max(0, CF.toTick(time, this.chart.bpm));
      this.cursor = this.offset;
      if (time > this.previewEnd + 600) {
        this.clock.pause();
        this.playing = false;
        this.updateUI();
      }
    }
    CF.highway.expireHits(this.previewHits, now);
    this.updateTime();
  }
};
