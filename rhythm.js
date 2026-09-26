"use strict";
window.CF = window.CF || {};
(() => {
  const PPQN = 384;
  const id = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const toMs = (tick, bpm) => ((tick / PPQN) * 60000) / bpm;
  const toTick = (ms, bpm) => ((ms * bpm) / 60000) * PPQN;
  const endTick = (notes) => notes.reduce((end, n) => Math.max(end, n.tick), 0);
  const duration = (chart) =>
    chart.notes.length ? toMs(endTick(chart.notes) + PPQN, chart.bpm) : 0;
  function quantize(raw, bpm) {
    const groups = [];
    for (const e of [...raw].sort((a, b) => a.timestampMs - b.timestampMs)) {
      const prev = groups.at(-1);
      if (
        prev &&
        e.timestampMs - prev.time <= 15 &&
        !prev.events.some((n) => n.lane === e.lane)
      )
        prev.events.push(e);
      else groups.push({ time: e.timestampMs, events: [e] });
    }
    const notes = [],
      seen = new Set();
    let collisions = 0;
    for (const g of groups) {
      const tick = Math.max(0, Math.round(toTick(g.time, bpm) / 48) * 48);
      for (const e of g.events) {
        const key = `${e.lane}:${tick}`;
        if (seen.has(key)) collisions++;
        else {
          seen.add(key);
          notes.push({ id: id(), lane: e.lane, tick });
        }
      }
    }
    return { notes, collisions };
  }
  class Clock {
    constructor(time = 0) {
      this.base = time;
      this.running = false;
      this.anchor = 0;
    }
    time(now = performance.now()) {
      return this.base + (this.running ? now - this.anchor : 0);
    }
    start(now = performance.now()) {
      if (!this.running) {
        this.anchor = now;
        this.running = true;
      }
    }
    pause(now = performance.now()) {
      this.base = this.time(now);
      this.running = false;
    }
    seek(time) {
      this.base = time;
      this.anchor = performance.now();
    }
  }
  class Audio {
    constructor() {
      this.enabled = true;
      this.volume = 0.35;
      this.timer = null;
    }
    unlock() {
      try {
        this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (_) {}
    }
    tone(freq = 700, when, length = 0.055, volume = 1) {
      if (!this.enabled || !this.ctx) return;
      const at = Math.max(this.ctx.currentTime, when ?? this.ctx.currentTime),
        osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, this.volume * 2.16 * volume * 0.5625),
        at + 0.003,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(at);
      osc.stop(at + length + 0.01);
    }
    metronome(clock, bpm) {
      this.stop();
      const beat = 60000 / bpm;
      // The animation frame may run just after the count-in boundary. Include
      // beat zero (or a just-reached beat on resume) instead of rounding past it.
      const position = Math.max(0, clock.time()) / beat;
      let next =
        (position - Math.floor(position)) * beat < 20
          ? Math.floor(position)
          : Math.ceil(position);
      const schedule = () => {
        if (!clock.running || !this.ctx) return;
        const t = clock.time();
        while (next * beat < t + 65) {
          const delay = next * beat - t;
          if (delay >= -20)
            this.tone(
              next % 4 === 0 ? 1000 : 650,
              this.ctx.currentTime + Math.max(0, delay) / 1000,
              0.055,
              0.5,
            );
          next++;
        }
      };
      schedule();
      this.timer = setInterval(schedule, 25);
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  function validate(input) {
    const c = input.chart || input;
    if (
      !c ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 120 ||
      ![4, 5, 6, 7, 8].includes(c.keyCount) ||
      !Number.isFinite(c.bpm) ||
      c.bpm < 20 ||
      c.bpm > 500 ||
      c.ppqn !== 384 ||
      !Number.isFinite(c.scrollSpeed) ||
      c.scrollSpeed < 1 ||
      c.scrollSpeed > 25 ||
      !Array.isArray(c.notes) ||
      c.notes.length > 100000 ||
      !Array.isArray(c.rawRecording) ||
      c.rawRecording.length > 200000
    )
      throw new Error("This file is not a supported ChartFlow chart.");
    const seen = new Set();
    const notes = c.notes.map((n) => {
      if (
        !Number.isInteger(n.lane) ||
        n.lane < 0 ||
        n.lane >= c.keyCount ||
        !Number.isSafeInteger(n.tick) ||
        n.tick < 0 ||
        n.tick > 384 * 500 * 60 * 24
      )
        throw new Error("The chart contains an invalid note.");
      const key = `${n.lane}:${n.tick}`;
      if (seen.has(key))
        throw new Error("The chart contains overlapping notes.");
      seen.add(key);
      return { id: id(), lane: n.lane, tick: n.tick };
    });
    const rawRecording = c.rawRecording.map((e) => {
      if (
        !Number.isInteger(e.lane) ||
        e.lane < 0 ||
        e.lane >= c.keyCount ||
        !Number.isFinite(e.timestampMs) ||
        e.timestampMs < 0
      )
        throw new Error("The raw recording contains an invalid event.");
      return { lane: e.lane, timestampMs: e.timestampMs };
    });
    return {
      id: id(),
      name: c.name.trim(),
      keyCount: c.keyCount,
      bpm: c.bpm,
      scrollSpeed: c.scrollSpeed,
      ppqn: 384,
      notes: notes.sort((a, b) => a.tick - b.tick || a.lane - b.lane),
      rawRecording,
      collisions:
        Number.isSafeInteger(c.collisions) && c.collisions >= 0
          ? c.collisions
          : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  Object.assign(CF, {
    PPQN,
    id,
    toMs,
    toTick,
    endTick,
    duration,
    quantize,
    Clock,
    Audio,
    validate,
    bindings: {
      4: ["d", "f", "j", "k"],
      5: ["d", "f", "j", "k", "l"],
      6: ["s", "d", "f", "j", "k", "l"],
      7: ["s", "d", "f", "j", "k", "l", ";"],
      8: ["a", "s", "d", "f", "j", "k", "l", ";"],
    },
  });
})();
