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
