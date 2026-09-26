const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function progress() {
  let saved;
  const scope = {
    structuredClone,
    document: { querySelector: () => ({
      querySelector: () => null,
      classList: { toggle() {} },
    }) },
    CF: {
      id: () => crypto.randomUUID(),
      ui: { toast() {}, escape: (value) => String(value) },
      storage: {
        async saveProfile(p) {
          saved = p;
        },
      },
    },
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../progress.js"),
      "utf8",
    ),
    scope,
  );
  const p = scope.CF.progress;
  p.use({ id: "user", name: "Test", stats: {}, unlocked: {}, history: [] });
  return { p, saved: () => saved };
}
function session(n = 20) {
  return {
    startTick: 0,
    notes: Array(n).fill({}),
    counts: { Perfect: n, Great: 0, Good: 0, Miss: 0 },
    maxCombo: n,
    weight: n,
  };
}
const chart = { id: "c", name: "Chart", keyCount: 8 };
test("practice, partial starts and empty charts never award gameplay progress", async () => {
  const { p } = progress();
  p.complete(chart, session(), 100, "S", true);
  p.complete(chart, { ...session(), startTick: 384 }, 100, "S", false);
  p.complete(chart, session(0), 0, "D", false);
  assert.equal(p.profile.history.length, 0);
  assert.equal(Object.keys(p.profile.unlocked).length, 0);
});
test("quality achievements require 100 notes, completed results are counted once and persisted", async () => {
  const { p, saved } = progress();
  p.complete(chart, session(99), 100, "S", false);
  assert.ok(p.profile.unlocked["first-play"]);
  assert.equal(p.profile.unlocked.perfect, undefined);
  const s = session(100);
  p.complete(chart, s, 100, "S", false);
  p.complete(chart, s, 100, "S", false);
  await p.flush();
  assert.equal(p.profile.stats.plays, 2);
  for (const id of ["precision", "full-combo", "perfect", "eight-lanes"])
    assert.ok(p.profile.unlocked[id]);
  assert.equal(saved().history.length, 2);
  assert.equal(saved().stats.hits, 199);
});
test("misses prevent full combo and perfect; low accuracy prevents precision and 8K awards", async () => {
  const { p } = progress();
  const s = session(100);
  s.counts = { Perfect: 75, Great: 0, Good: 0, Miss: 25 };
  s.weight = 75;
  s.maxCombo = 75;
  p.complete(chart, s, 75, "C", false);
  await p.flush();
  for (const id of ["precision", "full-combo", "perfect", "eight-lanes"])
    assert.equal(p.profile.unlocked[id], undefined);
  assert.equal(p.profile.stats.hits, 75);
});

test("combo milestones unlock at 100 and 500, and precision still starts at 20 notes", async () => {
  const { p } = progress();
  p.complete(chart, session(20), 100, "S", false);
  assert.ok(p.profile.unlocked.precision);
  for (const id of [
    "full-combo",
    "perfect",
    "eight-lanes",
    "combo-25",
    "combo-100",
  ])
    assert.equal(p.profile.unlocked[id], undefined);
  p.complete(chart, session(99), 100, "S", false);
  assert.equal(p.profile.unlocked["combo-25"], undefined);
  p.complete(chart, session(100), 100, "S", false);
  assert.ok(p.profile.unlocked["combo-25"]);
  p.complete(chart, session(499), 100, "S", false);
  assert.equal(p.profile.unlocked["combo-100"], undefined);
  p.complete(chart, session(500), 100, "S", false);
  assert.ok(p.profile.unlocked["combo-100"]);
  await p.flush();
});
