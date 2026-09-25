const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4173");
    await page.locator('#guide [data-guide="close"]').click();
    await page.waitForSelector(".chart-row");
    await page.locator('.page-heading [data-action="new"]').click();
    await page.locator('[name="name"]').fill("Built by hand");
    await page.locator('[name="bpm"]').fill("120");
    await page.locator('[data-keys="8"]').click();
    await page.screenshot({
      path: "artifacts/create-two-paths.png",
      fullPage: true,
    });
    await page.locator('[value="blank"]').click();
    await page.waitForFunction(
      () => CF.app.state === "editor" && CF.app.editor.line > 0,
    );
    const id = await page.evaluate(() => CF.app.current.id);
    assert.equal(await page.evaluate(() => CF.app.current.bpm), 120);
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 0);
    assert.equal(
      await page.evaluate(() => CF.app.current.rawRecording.length),
      0,
    );
    assert.equal(
      await page.evaluate(
        async () =>
          (await CF.storage.all()).find((c) => c.id === CF.app.current.id).notes
            .length,
      ),
      0,
    );
    await page.locator("#snap").selectOption("16");
    const point = (lane, tick) =>
      page.evaluate(
        ({ lane, tick }) => {
          const e = CF.app.editor,
            r = e.canvas.getBoundingClientRect();
          return {
            x: r.x + e.left + (lane + 0.5) * e.laneWidth,
            y: r.y + e.yAt(tick),
          };
        },
        { lane, tick },
      );
    const click = async (lane, tick, options) => {
      const p = await point(lane, tick);
      await page.mouse.click(p.x, p.y, options);
    };
    await click(0, 390);
    await click(2, 580);
    assert.deepEqual(
      await page.evaluate(() =>
        CF.app.current.notes.map((n) => [n.lane, n.tick]),
      ),
      [
        [0, 384],
        [2, 576],
      ],
    );
    await page.keyboard.down("Control");
    await click(0, 384);
    await page.keyboard.up("Control");
    assert.equal(await page.evaluate(() => CF.app.editor.selected.size), 2);
    const history = await page.evaluate(() => CF.app.editor.undoStack.length);
    const from = await point(0, 384),
      to = await point(1, 576);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    assert.deepEqual(
      await page.evaluate(() =>
        CF.app.current.notes.map((n) => [n.lane, n.tick]),
      ),
      [
        [1, 576],
        [3, 768],
      ],
    );
    assert.equal(
      await page.evaluate(() => CF.app.editor.undoStack.length),
      history + 1,
    );
    await click(1, 576, { button: "right" });
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 1);
    assert.equal(await page.evaluate(() => CF.app.current.notes[0].lane), 3);
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 2);
    // A marquee gesture creates a selection, not an extra note.
    const p1 = await point(0, 1000),
      p2 = await point(4, 400);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 10 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 2);
    assert.equal(await page.evaluate(() => CF.app.editor.selected.size), 2);
    // Ctrl-click empty space still provides a cursor-only gesture for paste/test.
    await page.keyboard.press("Control+c");
    await page.keyboard.down("Control");
    await click(0, 1152);
    await page.keyboard.up("Control");
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 2);
    await page.keyboard.press("Control+v");
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 4);
    await page.screenshot({
      path: "artifacts/hand-built-chart.png",
      fullPage: true,
    });
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForSelector(".chart-row");
    await page.locator(`[data-chart="${id}"] [data-action="edit"]`).click();
    assert.equal(await page.evaluate(() => CF.app.current.notes.length), 4);
    assert.equal(await page.evaluate(() => CF.app.current.bpm), 120);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: blank creation, BPM/grid snapping, single-click add, Ctrl multi-select, group drag, right-click single delete, undo, marquee, paste and persistence.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
