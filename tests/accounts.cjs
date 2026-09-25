const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4173");
    await page.locator('#guide [data-guide="close"]').click();
    await page.waitForSelector(".chart-row");
    await page.locator('.page-heading [data-action="new"]').click();
    await page.locator('[name="name"]').fill("Saved pattern");
    await page.locator('[value="blank"]').click();
    await page.waitForFunction(() => CF.app.state === "editor");
    await page.locator('[data-action="add-note"]').click();
    await page.locator('[data-action="account"]').click();
    await page.waitForSelector("#profile-switch");
    assert.equal(
      await page.evaluate(() => CF.progress.profile.stats.created),
      1,
    );
    assert.ok(
      await page.evaluate(() => CF.progress.profile.unlocked["first-chart"]),
    );
    await page.locator('[data-panel="saves"]').click();
    await page.locator('[data-account="save"]').click();
    await page.locator('#dialog [name="name"]').fill("Checkpoint");
    await page.locator('#dialog [value="confirm"]').click();
    await page.waitForSelector(".save-row");
    const snapshot = await page.evaluate(() => CF.storage.bundle());
    assert.equal(snapshot.charts.length, 4);
    await page.locator('[data-account="new-user"]').click();
    await page.locator('#dialog [name="name"]').fill("Second player");
    await page.locator('#dialog [value="confirm"]').click();
    await page.waitForFunction(
      () => CF.progress.profile.name === "Second player",
    );
    assert.equal(await page.evaluate(() => CF.app.charts.length), 0);
    assert.equal(
      await page.evaluate(() => CF.storage.slots().then((x) => x.length)),
      0,
    );
    await page.locator("#profile-switch").selectOption("local-player");
    await page.waitForFunction(() => CF.app.charts.length === 4);
    await page.evaluate(async () => {
      const c = CF.app.charts.find((c) => c.name === "Saved pattern");
      c.name = "Changed";
      await CF.storage.save(c);
      CF.progress.profile.stats.plays = 99;
      await CF.progress.save();
    });
    await page.locator('[data-panel="saves"]').click();
    await page.locator('[data-account="restore"]').click();
    await page.locator('#dialog [value="confirm"]').click();
    await page.waitForFunction(() =>
      CF.app.charts.some((c) => c.name === "Saved pattern"),
    );
    assert.equal(
      await page.evaluate(() => CF.progress.profile.stats.plays || 0),
      0,
    );
    const beforeInvalid = await page.evaluate(async () => ({
      id: CF.storage.profileId,
      users: (await CF.storage.profiles()).length,
      charts: (await CF.storage.all()).length,
    }));
    await page.locator('[data-account="import"]').click();
    await page.locator("#save-import").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"format":"chartflow-save","version":1,"profile":{},"charts":[]}',
      ),
    });
    await page.waitForFunction(() => !document.querySelector("#save-import"));
    assert.deepEqual(
      await page.evaluate(async () => ({
        id: CF.storage.profileId,
        users: (await CF.storage.profiles()).length,
        charts: (await CF.storage.all()).length,
      })),
      beforeInvalid,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-account="export"]').click();
    const download = await downloadPromise;
    const path = await download.path();
    await page.locator('[data-account="import"]').click();
    await page.locator("#save-import").setInputFiles(path);
    await page.waitForFunction(
      () =>
        CF.storage.profileId !== "local-player" &&
        CF.progress.profile.name === "Player",
    );
    assert.equal(await page.evaluate(() => CF.app.charts.length), 4);
    assert.notEqual(
      await page.evaluate(
        () => CF.app.charts.find((c) => c.name === "Saved pattern").id,
      ),
      snapshot.charts.find((c) => c.name === "Saved pattern").id,
    );
    assert.equal(
      await page.evaluate(() => CF.storage.profiles().then((x) => x.length)),
      3,
    );
    await page.reload();
    await page.waitForSelector(".chart-row");
    assert.equal(await page.evaluate(() => CF.app.charts.length), 4);
    // Use the actual result transition with a completed session, and verify practice exclusion.
    await page.locator('.chart-row [data-action="play"]').first().click();
    await page.evaluate(() => {
      const s = CF.app.session;
      s.phase = "running";
      s.startTick = 0;
      s.notes = Array.from({ length: 100 }, () => ({ ms: 0, judged: true }));
      s.counts = { Perfect: 100, Great: 0, Good: 0, Miss: 0 };
      s.judged = 100;
      s.weight = 100;
      s.maxCombo = 100;
      s.clock.time = () => 1000;
    });
    await page.waitForFunction(() => CF.app.state === "results");
    await page.evaluate(() => CF.progress.flush());
    assert.equal(
      await page.evaluate(() => CF.progress.profile.history.length),
      1,
    );
    assert.ok(await page.evaluate(() => CF.progress.profile.unlocked.perfect));
    await page.locator('[data-action="account"]').click();
    await page.locator('[data-panel="achievements"]').click();
    await page.screenshot({
      path: "artifacts/achievements.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/account-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    // Migrate an existing v1 database without losing notes/settings.
    const legacy = await browser.newPage();
    await legacy.route("**/*", (r) =>
      r.fulfill({ contentType: "text/html", body: "<html></html>" }),
    );
    await legacy.goto("http://127.0.0.1:4173");
    await legacy.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("chartflow", 1);
          r.onupgradeneeded = () => {
            r.result.createObjectStore("charts", { keyPath: "id" }).put({
              id: "legacy",
              name: "Original",
              notes: [],
              rawRecording: [],
              keyCount: 4,
              bpm: 120,
              scrollSpeed: 15,
            });
            r.result
              .createObjectStore("settings")
              .put(
                { initialized: true, sound: false, volume: 0.2 },
                "preferences",
              );
          };
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
          r.onerror = () => reject(r.error);
        }),
    );
    await legacy.unroute("**/*");
    await legacy.reload();
    await legacy.waitForSelector(".chart-row");
    assert.equal(await legacy.evaluate(() => CF.app.charts[0].id), "legacy");
    assert.equal(await legacy.evaluate(() => CF.app.settings.sound), false);
    console.log(
      "PASS: creation achievement, isolated users, named restore, portable export/import, persistence, results achievements, mobile layout, v1 migration",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
