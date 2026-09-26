const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const artifacts = path.join(__dirname, "../artifacts", `run-${Date.now()}`);
  fs.mkdirSync(artifacts, { recursive: true });
  await page.goto("http://127.0.0.1:4173");
  await page.locator('#guide [data-guide="close"]').click();
  await page.waitForSelector(".chart-row");
  await page.screenshot({
    path: path.join(artifacts, "library.png"),
    fullPage: true,
  });
  assert.equal(await page.locator(".chart-row").count(), 3);
  assert.ok(
    await page.evaluate(() => CF.app.charts.every((c) => c.scrollSpeed === 15)),
  );
  await page.locator('.hero [data-action="new"]').click();
  await page.locator('[name="name"]').fill("Browser verification");
  assert.equal(await page.locator('[name="speed"]').inputValue(), "15.0");
  await page.locator("h1").click();
  await page.keyboard.down("d");
  await page.keyboard.down("j");
  assert.equal(await page.locator(".test-key.pressed").count(), 2);
  await page.keyboard.up("d");
  await page.keyboard.up("j");
  await page.locator('[value="record"]').click();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => CF.app.session.phase === "running");
  assert.equal(await page.evaluate(() => CF.app.session.phase), "running");
  await page.keyboard.down("d");
  await page.keyboard.down("j");
  await page.keyboard.up("d");
  await page.keyboard.up("j");
  assert.ok(await page.evaluate(() => CF.app.session.raw[0].timestampMs > 0));
  await page.waitForTimeout(160);
  await page.keyboard.press("f");
  await page.keyboard.press("p");
  const paused = await page.evaluate(() => CF.app.session.clock.time());
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => CF.app.session.clock.time()), paused);
  await page.keyboard.press("p");
  await page.keyboard.press("k");
  assert.equal(await page.evaluate(() => CF.app.session.raw.length), 3);
  await page.waitForFunction(() => CF.app.session.phase === "running");
  await page.keyboard.press("k");
  const resumed = await page.evaluate(
    () => CF.app.session.raw.at(-1).timestampMs,
  );
  assert.ok(resumed - paused < 150);
  await page.screenshot({
    path: path.join(artifacts, "recording.png"),
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => CF.app.state === "detail");
  let chart = await page.evaluate(() => structuredClone(CF.app.current));
  assert.equal(chart.rawRecording.length, 4);
  assert.equal(chart.notes[0].tick, 0);
  assert.ok(chart.notes.every((n) => n.tick % 48 === 0));
  const chartId = chart.id;
  await page.locator('[data-action="edit"]').click();
  await page.waitForTimeout(100);
  const original = await page.evaluate(() =>
    JSON.stringify(CF.app.current.notes),
  );
  await page.locator("#snap").selectOption("4");
  assert.equal(
    await page.evaluate(() => JSON.stringify(CF.app.current.notes)),
    original,
  );
  await page.locator("#editor-canvas").focus();
  await page.keyboard.press("Control+a");
  assert.equal(
    await page.evaluate(() => CF.app.editor.selected.size),
    chart.notes.length,
  );
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Control+z");
  assert.equal(
    await page.evaluate(() => JSON.stringify(CF.app.current.notes)),
    original,
  );
  await page.keyboard.press("Control+y");
  assert.notEqual(
    await page.evaluate(() => JSON.stringify(CF.app.current.notes)),
    original,
  );
  const canvas = await page.locator("#editor-canvas").boundingBox();
  await page.mouse.click(canvas.x + 90, canvas.y + 350);
  const withAdded = await page.evaluate(() => CF.app.current.notes.length);
  assert.equal(withAdded, chart.notes.length + 1);
  await page.keyboard.press("Control+c");
  await page.keyboard.down("Control");
  await page.mouse.click(canvas.x + 90, canvas.y + 480);
  await page.keyboard.up("Control");
  await page.keyboard.press("Control+v");
  assert.equal(
    await page.evaluate(() => CF.app.current.notes.length),
    withAdded + 1,
  );
  await page.keyboard.press("Delete");
  assert.equal(
    await page.evaluate(() => CF.app.current.notes.length),
    withAdded,
  );
  await page.keyboard.press("Control+z");
  assert.equal(
    await page.evaluate(() => CF.app.current.notes.length),
    withAdded + 1,
  );
  await page.mouse.move(canvas.x + 220, canvas.y + 210);
  const zoomBefore = await page.evaluate(() => CF.app.editor.tickAt(210));
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -180);
  await page.keyboard.up("Control");
  await page.waitForTimeout(100);
  const zoomAfter = await page.evaluate(() => CF.app.editor.tickAt(210));
  assert.ok(Math.abs(zoomBefore - zoomAfter) < 1);
  await page.screenshot({
    path: path.join(artifacts, "editor.png"),
    fullPage: true,
  });
  const editorBefore = await page.evaluate(() => ({
    offset: CF.app.editor.offset,
    zoom: CF.app.editor.zoom,
    cursor: CF.app.editor.cursor,
    selected: [...CF.app.editor.selected],
  }));
  await page.locator('[data-action="test"]').click();
  await page.waitForFunction(() => CF.app.state === "play");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => CF.app.state), "editor");
  assert.deepEqual(
    await page.evaluate(() => ({
      offset: CF.app.editor.offset,
      zoom: CF.app.editor.zoom,
      cursor: CF.app.editor.cursor,
      selected: [...CF.app.editor.selected],
    })),
    editorBefore,
  );
  await page.keyboard.press("p");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => CF.app.editor.playing), true);
  await page.keyboard.press("p");
  assert.equal(await page.evaluate(() => CF.app.editor.playing), false);
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(() => CF.app.pending.size), 0);
  await page.reload();
  await page.waitForSelector(".chart-row");
  assert.equal(await page.locator(".chart-row").count(), 4);
  await page.locator(`[data-chart="${chartId}"] h3`).click();
  await page.locator('[data-action="rename"]').click();
  await page.locator('dialog [name="name"]').fill("Verified pattern");
  await page.locator('dialog [value="confirm"]').click();
  await page.waitForFunction(() => CF.app.current.name === "Verified pattern");
  const exportWait = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await exportWait;
  const exported = path.join(artifacts, "verified.chartflow.json");
  await download.saveAs(exported);
  const data = JSON.parse(fs.readFileSync(exported));
  assert.equal(data.chart.rawRecording.length, 4);
  await page.locator('[data-action="duplicate"]').click();
  await page.waitForFunction(() => CF.app.current.name.endsWith("(Copy)"));
  assert.notEqual(await page.evaluate(() => CF.app.current.id), chartId);
  await page.locator("#import-file").setInputFiles(exported);
  await page.waitForFunction(() => CF.app.current.name === "Verified pattern");
  assert.notEqual(await page.evaluate(() => CF.app.current.id), chartId);
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => CF.app.session.phase === "running");
  await page.keyboard.press("p");
  assert.equal(await page.evaluate(() => CF.app.session.phase), "paused");
  await page.keyboard.press("p");
  assert.equal(await page.evaluate(() => CF.app.session.phase), "countin");
  await page.waitForFunction(
    () => CF.app.state === "results",
    {},
    { timeout: 15000 },
  );
  assert.equal(
    await page
      .locator(".result-grade")
      .evaluate((el) => getComputedStyle(el).animationName),
    "grade-breathe",
  );
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="delete"]').click();
  await page.locator('dialog [value="confirm"]').click();
  await page.waitForFunction(() => CF.app.state === "library");
  assert.equal(await page.locator(".chart-row").count(), 5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(artifacts, "mobile-library.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: library, setup chords, Space count-in and automatic recording clock, paused count-in, quantization, editor, autosave/reload, rename, duplicate, export/import, gameplay pause/results, delete, mobile layout.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
