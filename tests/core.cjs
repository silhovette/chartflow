const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const scope = {
  performance,
  crypto: require("node:crypto").webcrypto,
  document: { querySelector: () => null },
  console,
  setInterval,
  clearInterval,
};
scope.window = scope;
vm.createContext(scope);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../rhythm.js"), "utf8"),
  scope,
);
scope.CF = scope.window.CF;
scope.CF.ui = { toast() {} };
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../editor.js"), "utf8"),
  scope,
);
const CF = scope.CF;
test("history restores every edit exactly without changing earlier note states", () => {
  const e = editor(), states = [JSON.stringify(e.notes)];
  const edit = (action) => { action(); states.push(JSON.stringify(e.notes)); };
  e.selected = new Set(["a"]);
  edit(() => e.shift(48, 1));
  edit(() => e.resnap());
  edit(() => { e.copy(); e.cursor = 768; e.cursorLane = 0; e.paste(); });
  edit(() => e.remove());
  edit(() => { e.cursor = 1536; e.add(); });
  for (let i = states.length - 2; i >= 0; i--) {
    e.undo();
    assert.equal(JSON.stringify(e.notes), states[i]);
  }
  for (let i = 1; i < states.length; i++) {
    e.redo();
    assert.equal(JSON.stringify(e.notes), states[i]);
  }
});
test("marquee interval lookup preserves inclusive edges, chords and initial selection", () => {
  const e = new CF.Editor({ keyCount: 8, scrollSpeed: 15,
    notes: Array.from({ length: 10000 }, (_, i) => ({
      id: String(i), tick: Math.floor(i / 8) * 48, lane: i % 8,
    })),
  }, () => {});
  e.left = 55; e.line = 600; e.laneWidth = 80;
  e.point = (p) => p;
  for (const zoom of [0.25, 1, 4]) {
    e.zoom = zoom; e.offset = 24000;
    for (const [p, end] of [
      [{ x: 95, y: 600 }, { x: 655, y: 100 }],
      [{ x: 655, y: 100 }, { x: 95, y: 600 }],
      [{ x: 95, y: -100 }, { x: 255, y: -50 }],
    ]) {
      e.drag = { type: "box", p, initial: new Set(["0"]) };
      e.move(end);
      const expected = new Set(["0"]);
      for (const n of e.notes) {
        const x = e.left + (n.lane + 0.5) * e.laneWidth, y = e.yAt(n.tick);
        if (x >= Math.min(p.x, end.x) && x <= Math.max(p.x, end.x) &&
            y >= Math.min(p.y, end.y) && y <= Math.max(p.y, end.y)) expected.add(n.id);
      }
      assert.deepEqual([...e.selected], [...expected]);
    }
  }
});
test("editor hit lookup matches exhaustive search at note edges and chords", () => {
  const e = new CF.Editor({ keyCount: 4, bpm: 180, scrollSpeed: 15,
    notes: Array.from({ length: 12000 }, (_, i) => ({
      id: String(i), tick: Math.floor(i / 4) * 48, lane: i % 4,
    })),
  }, () => {});
  e.left = 55;
  e.laneWidth = 100;
  e.line = 600;
  for (const zoom of [0.25, 1, 4]) {
    e.zoom = zoom;
    e.offset = 70000;
    for (let y = -10; y <= 620; y += 4) {
      for (const x of [55, 62, 63, 148, 155, 200, 350, 454]) {
        const expected = e.notes.find((n) =>
          Math.abs(e.yAt(n.tick) - y) < 8 &&
          x > e.left + n.lane * e.laneWidth + 7 &&
          x < e.left + (n.lane + 1) * e.laneWidth - 7);
        assert.equal(e.hit({ x, y }), expected);
      }
    }
  }
});
test("editing prunes deleted selections while undo and redo preserve valid selections", () => {
  const e = editor();
  e.selected = new Set(["a", "b", "missing"]);
  e.commit(e.notes.filter((n) => n.id !== "a"));
  assert.deepEqual([...e.selected], ["b"]);
  e.undo();
  assert.deepEqual([...e.selected], ["b"]);
  e.redo();
  assert.deepEqual([...e.selected], ["b"]);
});
test("editor musical time increases upward and arrow movement follows the screen", () => {
  const e = new CF.Editor(
    {
      keyCount: 4,
      bpm: 180,
      scrollSpeed: 15,
      notes: [{ id: "n", lane: 0, tick: 384 }],
    },
    () => {},
  );
  e.line = 600;
  assert.equal(e.yAt(0), 600);
  assert.equal(e.yAt(384), 500);
  assert.equal(e.tickAt(e.yAt(768)), 768);
  e.selected = new Set(["n"]);
  e.key({ key: "ArrowUp", preventDefault() {} });
  assert.equal(e.notes[0].tick, 432);
  assert.ok(e.yAt(e.notes[0].tick) < 500);
  e.key({ key: "ArrowDown", preventDefault() {} });
  assert.equal(e.notes[0].tick, 384);
});
test("metronome includes the first beat despite key-handler latency", () => {
  const audio = new CF.Audio();
  audio.ctx = { currentTime: 10 };
  const tones = [];
  audio.tone = (frequency, time) => tones.push({ frequency, time });
  audio.metronome({ running: true, time: () => 3 }, 180);
  audio.stop();
  assert.equal(tones.length, 1);
  assert.equal(tones[0].frequency, 1000);
  assert.equal(tones[0].time, 10);
});
test("first chord shares tick zero; same-lane repeats survive in raw and report collisions", () => {
  const raw = [
    { lane: 0, timestampMs: 0 },
    { lane: 2, timestampMs: 12 },
    { lane: 0, timestampMs: 14 },
    { lane: 0, timestampMs: 44 },
  ];
  const before = JSON.stringify(raw),
    result = CF.quantize(raw, 180);
  assert.equal(result.notes.length, 3);
  assert.equal(result.collisions, 1);
  assert.equal(result.notes[0].tick, 0);
  assert.equal(result.notes[1].tick, 0);
  assert.equal(result.notes[2].tick, 48);
  assert.equal(JSON.stringify(raw), before);
});
test("clock excludes both wall-clock pause and resume count-in", () => {
  const c = new CF.Clock();
  c.start(1000);
  assert.equal(c.time(1450), 450);
  c.pause(1500);
  assert.equal(c.time(31500), 500);
  c.start(32833);
  assert.equal(c.time(32933), 600);
  c.pause(33000);
  assert.equal(c.time(999999), 667);
});
function editor() {
  return new CF.Editor(
    {
      keyCount: 4,
      notes: [
        { id: "a", lane: 0, tick: 12 },
        { id: "b", lane: 2, tick: 60 },
      ],
      bpm: 180,
    },
    () => {},
  );
}
test("snap changes leave notes untouched; whole-group movements preserve offsets and reject invalid lanes", () => {
  const e = editor();
  e.selected = new Set(["a", "b"]);
  const before = JSON.stringify(e.notes);
  e.snap = 4;
  assert.equal(JSON.stringify(e.notes), before);
  e.shift(384, 0);
  assert.equal(e.notes[0].tick, 396);
  assert.equal(e.notes[1].tick - e.notes[0].tick, 48);
  e.shift(0, -1);
  assert.equal(e.notes[0].lane, 0);
  assert.equal(e.notes[1].lane, 2);
  assert.equal(e.undoStack.length, 1);
  e.undo();
  assert.equal(JSON.stringify(e.notes), before);
  e.redo();
  assert.equal(e.notes[0].tick, 396);
});
test("paste preserves relative pattern, resnap is explicit, undo restores exact timing", () => {
  const e = editor();
  e.selected = new Set(["a", "b"]);
  e.copy();
  e.cursor = 384;
  e.cursorLane = 1;
  e.paste();
  assert.equal(e.notes.length, 4);
  const pasted = e.notes.filter((n) => e.selected.has(n.id));
  assert.equal(pasted[0].lane, 1);
  assert.equal(pasted[1].lane, 3);
  assert.equal(pasted[1].tick - pasted[0].tick, 48);
  e.snap = 4;
  e.resnap();
  assert.equal(e.notes.filter((n) => e.selected.has(n.id))[1].tick, 384);
  e.undo();
  assert.equal(e.notes.filter((n) => e.selected.has(n.id))[1].tick, 432);
});
test("import rejects invalid notes and overlapping lanes, creates independent IDs", () => {
  const chart = {
    name: "Test",
    keyCount: 4,
    bpm: 180,
    scrollSpeed: 10,
    ppqn: 384,
    notes: [{ id: "a", lane: 1, tick: 48 }],
    rawRecording: [{ lane: 1, timestampMs: 42 }],
  };
  const imported = CF.validate(chart);
  assert.notEqual(imported.notes[0].id, "a");
  assert.equal(imported.notes[0].tick, 48);
  assert.throws(() =>
    CF.validate({ ...chart, notes: [...chart.notes, ...chart.notes] }),
  );
  assert.throws(() => CF.validate({ ...chart, notes: [{ lane: 4, tick: 0 }] }));
  assert.throws(() => CF.validate({ ...chart, bpm: 0 }));
});

test("drag rendering matches exhaustive paint order across separated visible intervals", () => {
  const originalUI = CF.ui, originalApp = CF.app, originalHighway = CF.highway;
  const drawn = [];
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  CF.ui = { fit: () => ({ ctx, w: 900, h: 700 }) };
  CF.app = { settings: { bindings: { 4: ["d", "f", "j", "k"] } } };
  CF.highway = { note: (ctx, x, y, width, selected) => drawn.push([x, y, selected]) };
  scope.devicePixelRatio = 1;
  try {
    const e = new CF.Editor({ keyCount: 4, scrollSpeed: 15,
      notes: Array.from({ length: 20000 }, (_, i) => ({
        id: String(i), tick: Math.floor(i / 4) * 48, lane: i % 4,
      })),
    }, () => {});
    e.canvas = { isConnected: true };
    e.offset = 80000;
    e.selected = new Set(e.notes.filter((_, i) => i % 3 === 0).map(n => n.id));
    for (const dt of [-200000, -30000, -48, 0, 48, 30000, 200000]) {
      e.drag = { type: "notes", dt, dl: 0 };
      e.dirty = true;
      drawn.length = 0;
      e.draw();
      const expected = [];
      for (const n of e.notes) {
        const selected = e.selected.has(n.id), y = e.yAt(n.tick + (selected ? dt : 0));
        if (y >= e.top - 10 && y <= e.line + 9)
          expected.push([e.left + n.lane * e.laneWidth + 10, y, selected]);
      }
      assert.deepEqual(drawn, expected);
    }
  } finally { CF.ui = originalUI; CF.app = originalApp; CF.highway = originalHighway; }
});
