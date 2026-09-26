const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const scope = vm.createContext({ performance, crypto,
  document: { querySelector: () => null } });
scope.window = scope;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../rhythm.js'), 'utf8'), scope);
scope.CF.ui = { toast() {} };
vm.runInContext(fs.readFileSync(path.join(__dirname, '../editor.js'), 'utf8'), scope);
const make = (notes) => new scope.CF.Editor({ keyCount: 8, notes }, () => {});
const serialize = (value) => JSON.stringify(value);

test('mixed edits, reordering chords, rejected overlaps and history branching restore exactly', () => {
  const e = make(Array.from({ length: 128 }, (_, i) => ({
    id: String(i), tick: Math.floor(i / 8) * 48, lane: 7 - i % 8,
  })));
  const states = [serialize(e.notes)];
  let seed = 37;
  const random = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let step = 0; step < 240; step++) {
    let next;
    const index = random(e.notes.length);
    switch (step % 6) {
      case 0: next = e.notes.map((n, i) => i === index ? { ...n, tick: n.tick + 97 } : n); break;
      case 1: next = e.notes.filter((_, i) => i !== index); break;
      case 2: next = [...e.notes, { id: `new-${step}`, tick: 10000 + step, lane: random(8) }]; break;
      case 3: next = e.notes.map(n => ({ ...n, tick: n.tick + 48 })); break;
      case 4: next = [...e.notes, e.notes[index]]; break;
      case 5: next = e.notes.map(n => ({ ...n })); break;
    }
    const before = serialize(e.notes), depth = e.undoStack.length;
    if (e.commit(next)) states.push(serialize(e.notes));
    else {
      assert.equal(serialize(e.notes), before);
      assert.equal(e.undoStack.length, depth);
    }
  }
  for (let i = states.length - 2; i >= 0; i--) {
    e.undo(); assert.equal(serialize(e.notes), states[i]);
  }
  for (let i = 1; i < states.length; i++) {
    e.redo(); assert.equal(serialize(e.notes), states[i]);
  }
  e.undo(); e.undo();
  e.commit([]);
  assert.equal(e.redoStack.length, 0);
  e.undo(); assert.equal(serialize(e.notes), states[states.length - 3]);
  e.redo(); assert.equal(e.notes.length, 0);
});

test('large-chart edits preserve pending save arrays, raw recording, and unlimited undo/redo', () => {
  const notes = Array.from({ length: 100000 }, (_, i) => ({ id: String(i), tick: i * 48, lane: i % 8 }));
  const e = make(notes), saved = [];
  e.chart.rawRecording = Array.from({ length: 200000 }, (_, i) => ({ lane: i % 8, timestampMs: i * 10 }));
  const raw = e.chart.rawRecording;
  e.onChange = (chart) => saved.push({ ...chart });
  e.selected.add('50000');
  for (let i = 0; i < 100; i++) e.shift(1, 0);
  assert.equal(e.undoStack.length, 100);
  assert.equal(saved[0].notes.find(n => n.id === '50000').tick, 2400001);
  assert.equal(notes[50000].tick, 2400000);
  for (let i = 0; i < 100; i++) e.undo();
  assert.equal(serialize(e.notes), serialize(notes));
  for (let i = 0; i < 100; i++) e.redo();
  assert.equal(e.notes.find(n => n.id === '50000').tick, 2400100);
  assert.ok(saved.every(c => c.rawRecording === raw));
  assert.equal(saved[0].notes.find(n => n.id === '50000').tick, 2400001);
});
