const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const p = await b.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://127.0.0.1:4173");
    await p.locator("#guide[open]").waitFor();
    assert.equal(
      await p.locator("#guide-title").innerText(),
      "Welcome to ChartFlow",
    );
    assert.equal(await p.locator(".guide-footer").isVisible(), false);
    await p.keyboard.press("ArrowRight");
    assert.equal(await p.evaluate(() => CF.guide.step), -1);
    await p.waitForTimeout(2200);
    await p.screenshot({ path: "artifacts/guide-ribbons.png" });
    await p.waitForFunction(() => CF.guide.intro?.done);
    assert.ok(await p.locator(".guide-footer").isVisible());
    await p.waitForFunction(
      () =>
        +getComputedStyle(document.querySelector(".guide-footer")).opacity >
        0.99,
    );
    await p.screenshot({ path: "artifacts/guide-intro.png" });
    const bounds = await p.locator("#guide").boundingBox();
    assert.deepEqual(bounds, { x: 0, y: 0, width: 1440, height: 1000 });
    const titles = [
      "Welcome to ChartFlow",
      "Create a Chart",
      "Perform Your Rhythm",
      "Finish the Recording",
      "Play Your Chart",
      "Refine It in the Editor",
      "Essential Controls",
    ];
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.guide.step), 0);
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.guide.step), 1);
    await p.keyboard.press("ArrowLeft");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.guide.step), 0);
    assert.equal(await p.locator("#guide-title").innerText(), titles.shift());
    for (const title of titles) {
      await p.locator('[data-guide="next"]').click();
      await p.waitForFunction(() => !CF.guide.busy);
      assert.equal(await p.locator("#guide-title").innerText(), title);
    }
    assert.equal(await p.locator(".guide-controls tbody tr").count(), 9);
    await p.locator('[data-guide="back"]').click();
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(
      await p.locator("#guide-title").innerText(),
      "Refine It in the Editor",
    );
    await p.locator('[data-guide="next"]').click();
    await p.waitForFunction(() => !CF.guide.busy);
    await p.setViewportSize({ width: 390, height: 700 });
    await p.screenshot({ path: "artifacts/guide-mobile.png", fullPage: true });
    assert.ok(
      await p.locator("#guide").evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await p.locator('[data-guide="next"]').click();
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(
      await p.locator("#guide-title").innerText(),
      "Perform. Shape. Play.",
    );
    assert.equal(await p.locator(".guide-finale-mark").count(), 0);
    await p.screenshot({ path: "artifacts/guide-finale.png" });
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.locator("#guide").isVisible(), false);
    await p.reload();
    await p.waitForFunction(() => CF.app.state === "library");
    assert.equal(await p.locator("#guide").isVisible(), false);
    await p
      .getByRole("button", { name: "Open beginner guide", exact: true })
      .click();
    assert.equal(
      await p.locator("#guide-title").innerText(),
      "Welcome to ChartFlow",
    );
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.locator("#guide").isVisible(), false);
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.locator('.page-heading [data-action="new"]').click();
    await p.locator('[value="record"]').click();
    await p.keyboard.press("d");
    await p
      .getByRole("button", { name: "Open beginner guide", exact: true })
      .click();
    assert.equal(await p.evaluate(() => CF.app.session.phase), "paused");
    const raw = await p.evaluate(() => CF.app.session.raw.length);
    await p.keyboard.press("f");
    await p.keyboard.press("Enter");
    assert.equal(await p.evaluate(() => CF.app.session.raw.length), raw);
    assert.equal(await p.evaluate(() => CF.app.state), "record");
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.app.session.phase), "paused");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: automatic guide, cinematic intro and eight pages, controls, back/finish, revisit, Escape, mobile layout and paused gameplay/input isolation.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
