const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173");
    await page.locator('#guide [data-guide="close"]').click();
    await page.waitForFunction(() => !CF.guide.busy);
    assert.equal(await page.locator("#guide canvas").count(), 0);

    // Searching keeps unchanged rows, with the same visible order and content.
    const firstName = await page.locator(".chart-row h3").first().textContent();
    await page.evaluate(() => { window.firstRow = document.querySelector(".chart-row"); });
    await page.locator("#search").fill(firstName);
    assert.equal(await page.evaluate(() => document.querySelector(".chart-row") === firstRow), true);
    await page.locator("#search").fill("");
    assert.equal(await page.locator(".chart-row").count(), 3);
    await page.locator("#sort").selectOption("name");
    const names = await page.locator(".chart-row h3").allTextContents();
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));

    await page.locator('.chart-row [data-action="edit"]').first().click();
    await page.evaluate(() => {
      window.fits = 0;
      const fit = CF.ui.fit;
      CF.ui.fit = (...args) => { fits++; return fit.apply(CF.ui, args); };
    });
    await page.waitForTimeout(400);
    const idleFits = await page.evaluate(() => fits);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => fits), idleFits);
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.waitForFunction((before) => fits > before, idleFits);
    const snapFits = await page.evaluate(() => fits);
    await page.locator("#snap").selectOption("16");
    await page.waitForFunction((before) => fits > before, snapFits);

    // A completed older save must not clear a newer revision waiting to save.
    await page.evaluate(async () => {
      const editor = CF.app.editor;
      window.movedId = editor.notes[0].id;
      editor.selected = new Set([editor.notes[0].id]);
      window.saveChart = CF.storage.save;
      window.writes = [];
      let release;
      window.heldWrite = new Promise((resolve) => { release = resolve; });
      window.releaseWrite = release;
      CF.storage.save = async (chart) => {
        writes.push(structuredClone(chart));
        await saveChart.call(CF.storage, chart);
        if (writes.length === 1) await heldWrite;
      };
      editor.shift(48, 0);
    });
    await page.waitForFunction(() => writes.length === 1);
    await page.evaluate(async () => {
      CF.app.editor.shift(48, 0);
      releaseWrite();
      await Promise.resolve();
    });
    await page.waitForFunction(() => writes.length === 2 && !CF.app.pending.size);
    assert.equal(await page.evaluate(() => writes[1].notes.find(n => n.id === movedId).tick - writes[0].notes.find(n => n.id === movedId).tick), 48);
    await page.evaluate(() => { CF.storage.save = saveChart; });
    await page.locator('[data-action="detail"]').click();
    assert.equal(await page.evaluate(() => CF.app.editor), null);
    await page.locator('[data-action="play"]').click();
    await page.keyboard.press("p");
    await page.waitForTimeout(650);
    const pausedFits = await page.evaluate(() => fits);
    const beforeKey = await page.locator("#stage-canvas").evaluate(c => c.toDataURL());
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => fits), pausedFits);
    await page.keyboard.down("d");
    await page.waitForFunction((before) => fits > before, pausedFits);
    assert.notEqual(await page.locator("#stage-canvas").evaluate(c => c.toDataURL()), beforeKey);
    await page.keyboard.up("d");
    await page.waitForTimeout(650);
    assert.equal(await page.locator("#stage-canvas").evaluate(c => c.toDataURL()), beforeKey);

    const slotCheck = await page.evaluate(async () => {
      const ownerId = CF.storage.profileId;
      await CF.storage.saveSlot({ id: "summary-check", ownerId, name: "Summary", createdAt: 123,
        bundle: { charts: CF.app.charts, profile: { stats: { plays: 7 } } } });
      const summaries = await CF.storage.slotSummaries();
      const slot = await CF.storage.slot("summary-check");
      CF.storage.profileId = "other-user";
      const foreign = await CF.storage.slot("summary-check");
      CF.storage.profileId = ownerId;
      return { summaries, charts: slot.bundle.charts.length, foreign: !!foreign };
    });
    assert.deepEqual(slotCheck, { summaries: [{ id: "summary-check", name: "Summary", createdAt: 123,
      charts: 3, plays: 7 }], charts: 3, foreign: false });
    await page.evaluate(() => {
      CF.storage.slots = () => { throw Error("Full snapshot list should not be loaded"); };
      CF.storage.slotSummaries = () => { throw Error("Achievements do not need snapshots"); };
    });
    await page.locator('.sidebar [data-action="account"]').click();
    await page.waitForSelector(".achievement-grid");
    await page.locator('[data-panel="overview"]').click();
    await page.waitForSelector("#recent-sessions");
    assert.deepEqual(errors, []);
    console.log("PASS: idle rendering, resize/snap wakeup, paused key feedback, save revisions, list reuse, editor/guide cleanup and account reads.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
