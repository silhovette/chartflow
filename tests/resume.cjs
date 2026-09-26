const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4173");
    await page.locator('#guide [data-guide="close"]').click();
    await page.waitForSelector(".chart-row");
    await page.locator('.page-heading [data-action="new"]').click();
    await page.locator('[name="name"]').fill("Resume regression");
    await page.locator('[name="bpm"]').fill("180");
    await page.locator('[value="record"]').click();
    const count = await page.evaluate(() => CF.app.charts.length);
    assert.ok(await page.locator('[data-action="finish"]').isDisabled());
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => CF.app.state), "record");
    assert.equal(await page.evaluate(() => CF.app.charts.length), count);
    assert.match(await page.locator("#toast").innerText(), /Press Space/);
    await page.keyboard.press("d");
    assert.equal(await page.evaluate(() => CF.app.session.phase), "ready");
    assert.equal(await page.evaluate(() => CF.app.session.raw.length), 0);
    await page.evaluate(() => {
      window.countTones = [];
      const tone = CF.app.audio.tone.bind(CF.app.audio);
      CF.app.audio.tone = (...args) => {
        if (CF.app.session.phase === "countin") window.countTones.push([args[0], args[2], args[3]]);
        return tone(...args);
      };
    });
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#stage-overlay h2").innerText(), "8");
    const start = await page.evaluate(() => CF.app.session.countStart);
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => CF.app.session.countStart), start);
    assert.ok(Math.abs(await page.evaluate(() => CF.app.session.countUntil - CF.app.session.countStart) - 8 * 60000 / 180) < 0.001);
    await page.keyboard.press("f");
    assert.equal(await page.evaluate(() => CF.app.session.raw.length), 0);
    assert.equal(await page.evaluate(() => CF.app.session.clock.time()), 0);
    await page.waitForFunction(() => CF.app.session.phase === "running");
    assert.deepEqual(await page.evaluate(() => window.countTones),
      [375, 290, 290, 290, 290, 290, 290, 290].map((frequency) => [frequency, 0.045, 0.6]));
    assert.equal(await page.evaluate(() => CF.app.session.raw.length), 0);
    assert.equal(await page.evaluate(() => CF.app.session.clock.anchor === CF.app.session.countUntil), true);
    await page.waitForTimeout(150);
    await page.keyboard.press("d");
    assert.ok(await page.locator('[data-action="finish"]').isEnabled());
    assert.ok(await page.evaluate(() => CF.app.session.raw[0].timestampMs >= 150));
    for (const bpm of [180, 60, 500]) {
      await page.keyboard.press("p");
      await page.evaluate((bpm) => (CF.app.current.bpm = bpm), bpm);
      const frozen = await page.evaluate(() => CF.app.session.clock.time());
      await page.keyboard.press("p");
      const timing = await page.evaluate(() => {
        const s = CF.app.session;
        return {
          beat: s.countBeat,
          duration: s.countUntil - s.countStart,
          wait: s.countStart - performance.now(),
          raw: s.raw.length,
        };
      });
      assert.ok(Math.abs(timing.beat - 60000 / bpm) < 0.001);
      assert.ok(Math.abs(timing.duration - (4 * 60000) / bpm) < 0.001);
      assert.ok(timing.wait <= 0);
      await page.keyboard.press("f");
      assert.equal(
        await page.evaluate(() => CF.app.session.raw.length),
        timing.raw,
      );
      assert.equal(
        await page.evaluate(() => CF.app.session.clock.time()),
        frozen,
      );
      await page.waitForFunction(() => CF.app.session.phase === "running");
    }
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => CF.app.state === "detail");
    await page.locator('[data-action="play"]').first().click();
    assert.equal(await page.evaluate(() => CF.app.session.countBeat), 600);
    await page.keyboard.press("p");
    assert.equal(await page.locator("#stage-overlay").innerText(), "PAUSED");
    await page.keyboard.press("p");
    assert.equal(await page.evaluate(() => CF.app.session.countBeat), 600);
    assert.equal(await page.locator("#stage-overlay p").innerText(), "Get ready");
    assert.ok(
      Math.abs(
        (await page.evaluate(
          () => CF.app.session.countUntil - CF.app.session.countStart,
        )) - 1800,
      ) < 0.001,
    );
    await page.waitForFunction(() => CF.app.session.phase === "running");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Space starts eight BPM-timed metronome beats; recording starts without input on the next downbeat; pre-roll input excluded; 60/180/500 BPM recording resumes; play count-ins unchanged.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
