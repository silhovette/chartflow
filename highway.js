"use strict";
// Shared geometry and rendering for gameplay and editor preview.
CF.highway = {
  reducedMotion:
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  note(ctx, x, y, width, selected = false) {
    const height = 12;
    ctx.save();
    // A low, wide halo adds depth without washing out the timing edge.
    ctx.translate(x + width / 2, y);
    ctx.scale((width + 24) / 2, 17);
    const halo = ctx.createRadialGradient(0, 0, 0.12, 0, 0, 1);
    halo.addColorStop(
      0,
      selected ? "rgba(111,231,210,.22)" : "rgba(133,222,209,.14)",
    );
    halo.addColorStop(1, "rgba(111,231,210,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.save();
    const fill = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
    fill.addColorStop(0, selected ? "#c1fff0" : "#e1f7f2");
    fill.addColorStop(0.22, selected ? "#85edda" : "#bbddd5");
    fill.addColorStop(0.55, selected ? "#59cdb7" : "#7faea6");
    fill.addColorStop(1, selected ? "#368f83" : "#46766f");
    ctx.beginPath();
    ctx.roundRect(x, y - height / 2, width, height, 2.5);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = selected ? "#a9f7eac0" : "#c6fff05c";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#f1fffaad";
    ctx.fillRect(x + 3, y - height / 2 + 1, width - 6, 1);
    ctx.fillStyle = "#d7fff51b";
    ctx.fillRect(x + 3, y - 2, width - 6, 2);
    ctx.restore();
  },
  hitGlow(ctx, x, y, width, age) {
    const duration = this.reducedMotion ? 220 : 520;
    if (age < 0 || age >= duration) return;
    const t = age / duration,
      attack = Math.min(1, age / 35);
    const opacity = attack * Math.pow(1 - t, 2);
    const spread = this.reducedMotion ? 0 : 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.translate(x + width / 2, y);
    ctx.scale(width * 0.65 + spread * 12, 14 + spread * 26);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, `rgba(200,255,241,${opacity * 0.48})`);
    glow.addColorStop(0.3, `rgba(111,231,210,${opacity * 0.22})`);
    glow.addColorStop(1, "rgba(111,231,210,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = opacity * 0.55;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#86efd5";
    ctx.fillStyle = "#d6fff2";
    ctx.beginPath();
    ctx.roundRect(x, y - 3, width, 6, 2);
    ctx.fill();
    ctx.restore();
  },
  geometry(height, speed) {
    const line = Math.max(40, height - 77);
    const pixelsPerMs = speed * 0.045;
    return { line, pixelsPerMs, travelMs: line / pixelsPerMs };
  },
  noteY(ms, time, height, speed) {
    const { line, pixelsPerMs } = this.geometry(height, speed);
    return line - (ms - time) * pixelsPerMs;
  },
  draw(
    canvas,
    chart,
    {
      time = 0,
      notes = [],
      flashes = [],
      hits = [],
      showBindings = false,
      pressed = new Set(),
      bindings,
      now = performance.now(),
    } = {},
  ) {
    const { ctx, w, h } = CF.ui.fit(canvas),
      lw = w / chart.keyCount;
    const { line, pixelsPerMs } = this.geometry(h, chart.scrollSpeed);
    ctx.clearRect(0, 0, w, h);
    for (let lane = 0; lane < chart.keyCount; lane++) {
      const flash = Math.max(0, 1 - (now - (flashes[lane] ?? -1000)) / 160);
      const held = pressed.has(bindings[lane]);
      ctx.fillStyle = `rgba(111,231,210,${held ? 0.07 : flash * 0.065 + 0.006})`;
      ctx.fillRect(lane * lw, 0, lw, h);
      ctx.strokeStyle = "#ffffff0b";
      ctx.beginPath();
      ctx.moveTo(lane * lw, 0);
      ctx.lineTo(lane * lw, h);
      ctx.stroke();
      ctx.fillStyle = held || flash > 0 ? "#6fe7d2" : "#455763";
      ctx.fillRect(lane * lw + 11, line - 2, lw - 22, 3);
      ctx.fillStyle = held ? "#b8fff0" : "#8d9ba7";
      ctx.font = "13px Consolas,monospace";
      ctx.textAlign = "center";
      if (showBindings)
        ctx.fillText(bindings[lane].toUpperCase(), (lane + 0.5) * lw, h - 29);
    }
    ctx.strokeStyle = "#90c9c645";
    ctx.beginPath();
    ctx.moveTo(0, line);
    ctx.lineTo(w, line);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, line + 20);
    ctx.clip();
    // Notes are time-sorted; only visit the interval visible on the canvas.
    let low = 0, high = notes.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (line - (notes[mid].ms - time) * pixelsPerMs > line + 20)
        low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < notes.length; i++) {
      const note = notes[i];
      const y = line - (note.ms - time) * pixelsPerMs;
      if (y < 0) break;
      if (note.judged) continue;
      this.note(ctx, note.lane * lw + 11, y, lw - 22);
    }
    ctx.restore();
    for (const hit of hits)
      this.hitGlow(ctx, hit.lane * lw + 11, line, lw - 22, now - hit.at);
    return { ctx, w, h, lw, line };
  },
};
