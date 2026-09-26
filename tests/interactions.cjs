const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173");
  await page.locator('#guide [data-guide="close"]').click();
  await page.waitForSelector(".chart-row");
  await page.locator('.chart-row [data-action="menu"]').first().click();
  await page.locator('#chart-menu [data-action="rename"]').click();
  await page.locator('dialog [name="name"]').fill("Menu renamed");
  await page.locator('dialog [value="confirm"]').click();
  await page.waitForFunction(() =>
    CF.app.charts.some((c) => c.name === "Menu renamed"),
  );
  await page.locator('[data-action="settings"]').click();
  await page.locator('[name="key-4-0"]').fill("p");
  await page.locator('dialog [value="confirm"]').click();
  assert.equal(await page.locator("#dialog").evaluate((el) => el.open), true);
  await page.locator('[name="key-4-0"]').fill("f");
  await page.locator('dialog [value="confirm"]').click();
  assert.equal(await page.locator("#dialog").evaluate((el) => el.open), true);
  await page.locator('[name="key-4-0"]').fill("a");
  await page.locator('dialog [value="confirm"]').click();
  await page.waitForFunction(() => CF.app.settings.bindings[4][0] === "a");
  await page.reload();
  await page.waitForSelector(".chart-row");
  assert.equal(await page.evaluate(() => CF.app.settings.bindings[4][0]), "a");
  await page.locator('.page-heading [data-action="new"]').click();
  await page.locator('[data-keys="6"]').click();
  await page.locator("h1").click();
  for (const k of ["s", "d", "f", "j", "k", "l"]) await page.keyboard.down(k);
  assert.equal(await page.locator(".test-key.pressed").count(), 6);
  for (const k of ["s", "d", "f", "j", "k", "l"]) await page.keyboard.up(k);
  await page.locator('[value="record"]').click();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => CF.app.session.phase === "running");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+d");
  assert.equal(await page.evaluate(() => CF.app.session.raw.length), 1);
  await page.keyboard.down("s");
  await page.keyboard.down("s");
  await page.keyboard.up("s");
  assert.equal(await page.evaluate(() => CF.app.session.raw.length), 2);
  await page.waitForTimeout(200);
  const bright = await page.locator("#stage-canvas").evaluate((c) => {
    const data = c
      .getContext("2d")
      .getImageData(0, 0, c.width, Math.floor(c.height * 0.65)).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] > 150 && data[i + 1] > 150 && data[i + 3] > 150) count++;
    return count;
  });
  assert.equal(bright, 0, "recording canvas has no note blocks");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#dialog").evaluate((el) => el.open), true);
  await page.locator('dialog [value="cancel"]').click();
  assert.equal(await page.evaluate(() => CF.app.session.raw.length), 2);
  assert.equal(await page.evaluate(() => CF.app.session.phase), "paused");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => CF.app.state === "detail");
  await page.locator('[data-action="edit"]').click();
  await page.waitForTimeout(100);
  // Actual group drag should commit only once; use two existing notes at distinct times.
  const box = await page.locator("#editor-canvas").boundingBox();
  await page.locator("#snap").selectOption("16");
  await page.mouse.click(box.x + 210, box.y + 143);
  await page.locator("#editor-canvas").focus();
  await page.keyboard.press("Control+a");
  const start = await page.evaluate(() => ({
    notes: structuredClone(CF.app.current.notes),
    history: CF.app.editor.undoStack.length,
    p: {
      x: CF.app.editor.left + CF.app.editor.laneWidth / 2,
      y: CF.app.editor.yAt(CF.app.current.notes[0].tick),
    },
    laneWidth: CF.app.editor.laneWidth,
  }));
  await page.mouse.move(box.x + start.p.x, box.y + start.p.y + 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + start.p.x + start.laneWidth,
    box.y + start.p.y - 52,
    { steps: 12 },
  );
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => CF.app.editor.undoStack.length),
    start.history + 1,
  );
  const after = await page.evaluate(() => CF.app.current.notes);
  assert.equal(after[0].lane, start.notes[0].lane + 1);
  assert.equal(
    after[1].tick - after[0].tick,
    start.notes[1].tick - start.notes[0].tick,
  );
  await page.keyboard.press("Control+z");
  assert.deepEqual(
    await page.evaluate(() => CF.app.current.notes),
    start.notes,
  );
  await page.mouse.move(box.x + 56, box.y + 47);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 25, box.y + box.height - 25, {
    steps: 8,
  });
  await page.mouse.up();
  assert.ok((await page.evaluate(() => CF.app.editor.selected.size)) > 0);
  await page.locator('[data-action="detail"]').click();
  // Import a known chord through the actual file input and judge all lanes independently.
  const fixture = {
    name: "Chord test",
    keyCount: 4,
    bpm: 240,
    scrollSpeed: 10,
    ppqn: 384,
    rawRecording: [],
    notes: [
      { id: "a", lane: 0, tick: 768 },
      { id: "b", lane: 1, tick: 768 },
      { id: "c", lane: 3, tick: 768 },
    ],
  };
  await page.locator("#import-file").setInputFiles({
    name: "chord.chartflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.waitForFunction(() => CF.app.current.name === "Chord test");
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => CF.app.session.phase === "running");
  await page.waitForFunction(
    () => CF.app.session.clock.time() >= 470,
    {},
    { polling: "raf" },
  );
  await page.keyboard.down("a");
  await page.keyboard.down("f");
  await page.keyboard.down("k");
  await page.keyboard.up("a");
  await page.keyboard.up("f");
  await page.keyboard.up("k");
  await page.waitForFunction(() => CF.app.state === "results");
  assert.equal(await page.evaluate(() => CF.app.session.combo), 3);
  assert.equal(await page.evaluate(() => CF.app.session.counts.Miss), 0);
  assert.deepEqual(errors, []);
  const filePage = await context.newPage();
  await filePage.goto(
    pathToFileURL(path.join(__dirname, "../index.html")).href,
  );
  await filePage.waitForSelector(".chart-row");
  assert.equal(await filePage.locator(".chart-row").count(), 3);
  await filePage.reload();
  await filePage.waitForSelector(".chart-row");
  console.log(
    "PASS: overflow dialog transitions, binding validation/persistence, 6K rollover, reserved modifiers, repeat suppression, note-free recording canvas, discard cancellation, group drag transaction, box select, three-lane gameplay chord, direct file launch.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
