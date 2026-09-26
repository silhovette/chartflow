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
    await p.mouse.move(720, 500);
    await p.mouse.wheel(0, 120);
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
    await p.mouse.wheel(0, 120);
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
    assert.equal(await p.locator(".guide-controls tbody tr").count(), 10);
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
    await p.locator("#guide[open]").waitFor();
    assert.equal(await p.evaluate(() => CF.guide.introOnly), true);
    assert.equal(await p.locator("#save-status").isVisible(), false);
    await p.evaluate(() => {
      const close = CF.guide.close;
      CF.guide.close = function () {
        window.introHoldMs = performance.now() - this.intro.settledAt;
        this.close = close;
        return close.call(this);
      };
    });
    await p.waitForFunction(() => CF.guide.intro?.done);
    const settledIntro = await p.locator(".guide-intro-scene canvas").evaluate((canvas) => canvas.toDataURL());
    const settledTitle = await p.locator(".guide-intro-title").evaluate((title) => title.style.transform);
    assert.equal(await p.locator(".guide-footer").isVisible(), false);
    await p.keyboard.press("ArrowRight");
    assert.equal(await p.evaluate(() => CF.guide.step), -1);
    await p.waitForTimeout(650);
    assert.equal(await p.evaluate(() => CF.guide.closing), false);
    assert.equal(await p.locator(".guide-intro-scene canvas").evaluate((canvas) => canvas.toDataURL()), settledIntro);
    assert.equal(await p.locator(".guide-intro-title").evaluate((title) => title.style.transform), settledTitle);
    await p.waitForFunction(() => CF.guide.closing);
    await p.waitForTimeout(350);
    const fade = await p.locator("#guide").evaluate((guide) => ({
      scene: +getComputedStyle(guide).opacity,
      backdrop: +getComputedStyle(guide, "::backdrop").opacity,
      title: +guide.querySelector(".guide-intro-title").style.opacity,
      cover: !!document.querySelector(".guide-exit"),
    }));
    assert.ok(fade.scene > 0 && fade.scene < 1, JSON.stringify(fade));
    assert.ok(fade.backdrop > 0 && fade.backdrop < 1, JSON.stringify(fade));
    assert.ok(Math.abs(fade.scene - fade.backdrop) < 0.15, JSON.stringify(fade));
    assert.ok(fade.title > 0.99 && !fade.cover, JSON.stringify(fade));
    await p.waitForFunction(() => !CF.guide.dialog.open && !CF.guide.busy);
    const holdMs = await p.evaluate(() => window.introHoldMs);
    assert.ok(holdMs >= 940, `Opening held for ${holdMs} ms`);
    console.log(`Opening held still for ${Math.round(holdMs)} ms before fading out.`);
    assert.equal(await p.locator("#guide").isVisible(), false);
    assert.equal(await p.evaluate(() => CF.app.state), "library");
    await p
      .getByRole("button", { name: "Open beginner guide", exact: true })
      .click();
    assert.equal(
      await p.locator("#guide-title").innerText(),
      "Welcome to ChartFlow",
    );
    assert.equal(await p.evaluate(() => CF.guide.step), 0);
    assert.equal(await p.locator(".guide-intro-scene").count(), 0);
    assert.equal(await p.evaluate(() => CF.guide.introMusic), null);
    assert.ok(await p.locator('[data-guide="back"]').isDisabled());
    await p.mouse.move(190, 350);
    await p.mouse.wheel(0, -120);
    await p.keyboard.press("ArrowLeft");
    assert.equal(await p.evaluate(() => CF.guide.step), 0);
    await p.waitForTimeout(200);
    await p.mouse.wheel(0, 120);
    await p.waitForFunction(() => CF.guide.step === 1 && !CF.guide.busy);
    await p.mouse.wheel(0, -120);
    await p.waitForFunction(() => CF.guide.step === 0 && !CF.guide.busy);
    // A trackpad burst must advance one page, not skip the whole guide.
    await p.evaluate(() => {
      for (let i = 0; i < 20; i++) CF.guide.dialog.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 20, bubbles: true, cancelable: true }),
      );
    });
    await p.waitForFunction(() => !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.guide.step), 1);
    await p.evaluate(() => CF.guide.go(100));
    await p.mouse.wheel(0, 120);
    await p.waitForFunction(() => !CF.guide.dialog.open && !CF.guide.busy);
    assert.equal(await p.locator("#guide").isVisible(), false);
    assert.equal(await p.evaluate(() => CF.app.state), "library");
    assert.equal(await p.evaluate(() => CF.guide.introMusic), null);
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.locator('.page-heading [data-action="new"]').click();
    await p.locator('[value="record"]').click();
    await p.keyboard.press("Space");
    await p.waitForFunction(() => CF.app.session.phase === "running");
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
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.reload();
    await p.locator("#guide[open]").waitFor();
    await p.waitForFunction(() => !CF.guide.dialog.open && !CF.guide.busy);
    assert.equal(await p.evaluate(() => CF.app.state), "library");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: first-visit guide, repeat-visit intro with hold and automatic exit, reduced motion, eight pages, controls, revisit, Escape, mobile layout and paused gameplay/input isolation.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
