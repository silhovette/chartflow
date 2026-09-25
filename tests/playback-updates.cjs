const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4173");
    await page.waitForSelector(".chart-row");
    assert.ok((await page.locator(".topbar").boundingBox()).height <= 40);
    // Older saved settings acquire the new modes without resetting custom keys.
    await page.evaluate(async () => {
      const s = await CF.storage.settings();
      delete s.bindings[7];
      delete s.bindings[8];
      s.bindings[4][0] = "a";
      await CF.storage.saveSettings(s);
    });
    await page.reload();
    await page.waitForSelector(".chart-row");
    assert.equal(
      await page.evaluate(() => CF.app.settings.bindings[8].length),
      8,
    );
    assert.equal(
      await page.evaluate(() => CF.app.settings.bindings[4][0]),
      "a",
    );
    await page.locator('.page-heading [data-action="new"]').click();
    await page.locator('[data-keys="8"]').click();
    await page.locator("h1").click();
    const keys = ["a", "s", "d", "f", "j", "k", "l", ";"];
    for (const k of keys) await page.keyboard.down(k);
    assert.equal(await page.locator(".test-key.pressed").count(), 8);
    for (const k of keys) await page.keyboard.up(k);
    await page.locator('[value="record"]').click();
    for (const k of keys) await page.keyboard.down(k);
    assert.equal(await page.evaluate(() => CF.app.session.raw.length), 8);
    assert.equal(await page.evaluate(() => CF.app.pressed.size), 8);
    for (const k of keys) await page.keyboard.up(k);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => CF.app.state === "detail");
    assert.equal(await page.evaluate(() => CF.app.current.keyCount), 8);
    const fixture = {
      name: "Eight-key flow",
      keyCount: 8,
      bpm: 180,
      scrollSpeed: 10,
      ppqn: 384,
      rawRecording: [],
      notes: [
        ...keys.map((_, lane) => ({ id: String(lane), lane, tick: 0 })),
        { id: "later", lane: 3, tick: 3072 },
      ],
    };
    await page.locator("#import-file").setInputFiles({
      name: "eight.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page.waitForFunction(() => CF.app.current.name === "Eight-key flow");
    await page.locator('[data-action="play"]').click();
    assert.equal(await page.locator(".topbar").isVisible(), false);
    assert.ok((await page.locator(".page-heading").boundingBox()).y < 30);
    const schedule = await page.evaluate(() => ({
      start: CF.app.session.countStart,
      end: CF.app.session.countUntil,
      now: performance.now(),
    }));
    assert.equal(schedule.end - schedule.start, 2100);
    assert.ok(schedule.start - schedule.now > 800);
    await page.locator("#scroll-speed").fill("12");
    await page.locator("#scroll-speed").press("Tab");
    assert.equal(await page.evaluate(() => CF.app.current.scrollSpeed), 12);
    assert.equal(await page.locator("#stage-overlay").textContent(), "");
    await page.waitForFunction(
      () => performance.now() >= CF.app.session.countStart + 80,
    );
    assert.equal(await page.locator("#stage-overlay h2").textContent(), "3");
    await page.waitForFunction(
      () => performance.now() >= CF.app.session.countStart + 780,
    );
    assert.equal(await page.locator("#stage-overlay h2").textContent(), "2");
    await page.waitForFunction(
      () => performance.now() >= CF.app.session.countStart + 1480,
    );
    assert.equal(await page.locator("#stage-overlay h2").textContent(), "1");
    const noteRows = () =>
      page.locator("#stage-canvas").evaluate((c) => {
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        const rows = [];
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            let i = (y * c.width + x) * 4;
            if (
              d[i] > 70 &&
              d[i + 1] > 145 &&
              d[i + 1] > d[i] + 5 &&
              d[i + 3] === 255
            ) {
              rows.push(y);
              break;
            }
          }
        }
        return rows;
      });
    assert.equal(
      (await noteRows()).length,
      0,
      "countdown lanes must stay empty",
    );
    await page.waitForFunction(() => CF.app.session.phase === "running");
    await page.waitForTimeout(70);
    const early = await noteRows();
    assert.ok(early.length && early[0] < 100, "first notes enter at top");
    await page.waitForTimeout(160);
    const later = await noteRows();
    assert.ok(later[0] > early[0] + 40, "notes fall downward");
    await page.screenshot({
      path: path.join(__dirname, "../artifacts/play-updated.png"),
      fullPage: true,
    });
    await page.waitForFunction(() => CF.app.session.clock.time() >= -25, null, {
      polling: "raf",
    });
    for (const k of keys) await page.keyboard.down(k);
    assert.equal(await page.evaluate(() => CF.app.session.combo), 8);
    assert.equal(
      await page.evaluate(() => CF.app.session.hitEffects.length),
      8,
    );
    await page.waitForTimeout(50);
    await page.screenshot({
      path: path.join(__dirname, "../artifacts/hit-glow.png"),
      fullPage: true,
    });
    for (const k of keys) await page.keyboard.up(k);
    await page.keyboard.press("Escape");
    await page.locator('[data-action="edit"]').click();
    assert.equal(await page.locator(".topbar").isVisible(), false);
    assert.ok((await page.locator(".page-heading").boundingBox()).y < 30);
    assert.equal(await page.locator("#scroll-speed").inputValue(), "12");
    await page.locator("#scroll-speed").fill("10");
    await page.locator("#scroll-speed").press("Tab");
    const origin = await page.evaluate(() => ({
      cursor: CF.app.editor.cursor,
      offset: CF.app.editor.offset,
    }));
    await page.evaluate(() => {
      const e = CF.app.editor,
        ctx = e.canvas.getContext("2d");
      window.previewLabels = new Set();
      const fill = ctx.fillText;
      ctx.fillText = function (text, ...args) {
        window.previewLabels.add(String(text));
        return fill.call(this, text, ...args);
      };
    });
    await page.locator('[data-action="timeline-play"]').click();
    assert.equal(await page.evaluate(() => CF.app.editor.preview), true);
    await page.waitForTimeout(100);
    const sample = () =>
      page.evaluate(() => {
        const e = CF.app.editor;
        return { line: e.line, y: e.yAt(e.previewNotes.at(-1).tick) };
      });
    const a = await sample();
    await page.waitForTimeout(180);
    const b = await sample();
    assert.equal(a.line, b.line);
    assert.ok(
      await page.evaluate(
        () =>
          previewLabels.has("BAR") &&
          [...previewLabels].some((s) => /^\d+\.\d+$/.test(s)),
      ),
    );
    assert.ok(
      await page.evaluate(() =>
        CF.app.editor.previewNotes
          .filter((n) => n.tick === 0)
          .every((n) => n.judged),
      ),
    );
    assert.ok(b.y > a.y + 20);
    await page.locator('[data-action="timeline-play"]').click();
    const paused = await page.evaluate(() => CF.app.editor.clock.time());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => CF.app.editor.clock.time()), paused);
    await page.screenshot({
      path: path.join(__dirname, "../artifacts/preview-updated.png"),
      fullPage: true,
    });
    await page.locator('[data-action="timeline-play"]').click();
    await page.waitForTimeout(120);
    assert.ok((await page.evaluate(() => CF.app.editor.clock.time())) > paused);
    await page.locator('[data-action="stop-preview"]').click();
    assert.equal(await page.evaluate(() => CF.app.editor.preview), false);
    assert.deepEqual(
      await page.evaluate(() => ({
        cursor: CF.app.editor.cursor,
        offset: CF.app.editor.offset,
      })),
      origin,
    );
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForSelector(".chart-row");
    assert.equal(
      await page.evaluate(
        () =>
          CF.app.charts.find((c) => c.name === "Eight-key flow").scrollSpeed,
      ),
      10,
    );
    await page.locator('[data-action="settings"]').click();
    assert.equal(await page.locator('[name^="key-8-"]').count(), 8);
    await page.locator('dialog [value="confirm"]').click();
    assert.equal(await page.locator("dialog").evaluate((d) => d.open), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: compact header, title-first modes, 8-key recording/judgement, legacy settings, exact delayed 0.7-second countdown steps, empty countdown lanes, top entry, falling preview, pause/resume, viewport restore, speed persistence.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
