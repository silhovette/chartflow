"use strict";
// Three continuous ribbons projected from 3D, then morphed into the brand waves.
CF.GuideIntro = class {
  constructor(root, ready, settled = false, hold = false) {
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.title = root.querySelector(".guide-intro-title");
    this.ctx = this.canvas.getContext("2d");
    this.ready = ready;
    this.hold = hold;
    this.ribbons = Array.from({ length: 3 }, (_, strand) => ({
      strand,
      z: 0,
      points: Array.from({ length: 111 }, (_, i) => ({
        x: 0, y: 0, z: 0, u: i / 110,
      })),
    }));
    this.depthOrder = [...this.ribbons];
    this.tick = (t) => this.draw(t);
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.start = performance.now() - (settled ? 7000 : 0);
    this.frame = requestAnimationFrame(this.tick);
  }
  stop() {
    cancelAnimationFrame(this.frame);
  }
  ease(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  draw(now) {
    if (this.hold && this.done) now = this.settledAt;
    const elapsed = this.reduced ? 8 : (now - this.start) / 1000;
    const originalSpeed = 1.18;
    const openingSpeed = originalSpeed * 1.5;
    const laterSpeed = originalSpeed * 1.2;
    const openingEnd = 2.05 / openingSpeed;
    const t = elapsed < openingEnd
      ? elapsed * openingSpeed
      : 2.05 + (elapsed - openingEnd) * laterSpeed;
    const revealStart = openingEnd + (4.8 - 2.05) / laterSpeed;
    const reveal = this.ease((elapsed - revealStart) / 1.15);
    const titleTravel = this.ease((elapsed - revealStart) / 1.3);
    const w = this.root.clientWidth,
      h = this.root.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(w * dpr) ||
      this.canvas.height !== Math.round(h * dpr)
    ) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w / 900, h / 650, 1.15);
    const morph = this.ease((t - 2.05) / 2.25);
    const alpha = this.ease((t - 0.35) / 0.85);
    const titleWidth = this.title.getBoundingClientRect().width;
    const logoScale = Math.min(1, w / 650, h / 400),
      logoWidth = 72 * logoScale,
      gap = 42 * logoScale;
    const shift = (-(titleWidth + gap) / 2) * reveal;
    // Both start together; the title takes longer to settle, opening up the gap.
    const titleShift = (-(titleWidth + gap) / 2) * titleTravel;
    const opacityText = String(reveal);
    const transform = `translate(-50%,-50%) translateX(${titleShift + logoWidth / 2 + gap + titleWidth / 2}px)`;
    if (this.title.style.opacity !== opacityText) this.title.style.opacity = opacityText;
    if (this.titleTransform !== transform) {
      this.title.style.transform = transform;
      this.titleTransform = transform;
    }
    if (this.title.style.clipPath !== "none") this.title.style.clipPath = "none";
    const flowTime = t * 1.12;
    const face = this.ease((t - 2.15) / 2.1);
    const roll = 0.12 * Math.sin(flowTime * 0.6) * (1 - face);
    const pitch = 0.18 * (1 - face);
    const size = scale * Math.pow(logoWidth / (440 * scale), morph);
    const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    const geometryKey = `${w}:${h}:${titleWidth}`;
    const settledGeometry = t >= 5.8 && reveal === 1 && titleTravel === 1;
    if (!settledGeometry || this.geometryKey !== geometryKey) {
      for (let strand = 0; strand < 3; strand++) {
        const ribbon = this.ribbons[strand];
        ribbon.z = 0;
        let previous;
        const phase = (strand * Math.PI * 2) / 3;
        const uncoil = this.ease((t - 1.95 - strand * 0.06) / 2.2);
        const breath = uncoil * (1 - this.ease((t - 2.6) / 1.65));
        const yaw = 0.12 * Math.sin((t - 1.95) * 0.8) * uncoil * (1 - face);
        const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
        for (let i = 0; i <= 110; i++) {
          const u = i / 110,
            a = (u - 0.5) * Math.PI * 2;
          // Keep horizontal travel monotonic so the ribbons cannot fold into knots.
          // Uncoil in 3D before turning toward
          // the camera; sizing and depth settle later than the wave shape.
          const xDance = (u - 0.5) * 440;
          const yDance =
            (strand - 1) * 38 +
            82 * Math.sin(a * 0.72 - flowTime * 0.8 + phase * 0.7);
          const xWave = (u - 0.5) * 440;
          const yWave =
            (((strand - 1) * 17 - 8 * Math.sin(a) - 10 * (u - 0.5)) * 440) / 72;
          const x = xDance * (1 - uncoil) + xWave * uncoil;
          const y =
            yDance * (1 - uncoil) +
            yWave * uncoil +
            9 * Math.sin(a * 0.65 - flowTime * 1.1 + phase) * breath;
          const z = 72 * Math.cos(a * 0.65 + flowTime * 0.6 + phase) * (1 - face);
          const xx = x * cosYaw + z * sinYaw;
          const zz = -x * sinYaw + z * cosYaw;
          const xr = xx * cosRoll - y * sinRoll;
          const yr = xx * sinRoll + y * cosRoll;
          const yp = yr * cosPitch - zz * sinPitch;
          const zp = yr * sinPitch + zz * cosPitch;
          const perspective = 720 / (720 - zp);
          // Geometric interpolation keeps the shrinking speed proportional to size.
          const point = ribbon.points[i];
          point.x = w / 2 + xr * perspective * size + shift;
          point.y = h / 2 + yp * perspective * size;
          point.z = zp;
          if (previous) ribbon.z += (previous.z + point.z) / 2;
          previous = point;
        }
        ribbon.z /= 110;
        // All three light passes use precisely the same path.
        const path = new Path2D();
        path.moveTo(ribbon.points[0].x, ribbon.points[0].y);
        for (let i = 1; i < ribbon.points.length; i++)
          path.lineTo(ribbon.points[i].x, ribbon.points[i].y);
        ribbon.path = path;
      }
      this.geometryKey = settledGeometry ? geometryKey : null;
    }
    const flash = this.reduced ? 0 : Math.exp(-Math.pow((t - 4.47) / 0.16, 2));
    const blue = this.ease((t - 4.55) / 0.45);
    const color = [
      Math.round((105 + 6 * blue) * (1 - flash) + 255 * flash),
      Math.round((229 + 2 * blue) * (1 - flash) + 255 * flash),
      Math.round((219 - 9 * blue) * (1 - flash) + 255 * flash),
    ];
    const glow = this.reduced
      ? 0.5
      : 0.5 - 0.5 * Math.cos((Math.max(0, t - 5.8) * Math.PI * 2) / 4.8);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Wide low-opacity light and a narrow core give depth without hard halo rings.
    const ribbons = this.depthOrder;
    ribbons.sort((a, b) => a.z - b.z || a.strand - b.strand);
    const colorText = color.join(",");
    for (const ribbon of ribbons)
      for (const pass of [0, 1, 2]) {
        const points = ribbon.points;
        const first = points[0],
          last = points.at(-1);
        const gradient = ctx.createLinearGradient(
          first.x,
          first.y,
          last.x + 0.01,
          last.y + 0.01,
        );
        for (let j = 0; j <= 12; j++) {
          const point = points[Math.round((j / 12) * (points.length - 1))],
            depth = (point.z + 230) / 460;
          const taper =
            (0.2 + 0.8 * Math.pow(Math.sin((j / 12) * Math.PI), 0.5)) *
              (1 - morph) +
            morph;
          const opacity =
            alpha *
            (0.4 + 0.6 * depth) *
            (pass === 0
              ? 0.07 + glow * 0.045 * morph
              : pass === 1
                ? 0.16 + glow * 0.08 * morph
                : 1) *
            taper;
          gradient.addColorStop(j / 12, `rgba(${colorText},${opacity})`);
        }
        ctx.strokeStyle = gradient;
        const core = 2.4 * (1 - morph) + 3.6 * logoScale * morph;
        ctx.lineWidth = core * (pass === 0 ? 5 : pass === 1 ? 2 : 1);
        ctx.shadowColor = `rgba(${colorText},${alpha * 0.38})`;
        ctx.shadowBlur =
          pass === 0
            ? 14 + flash * 12 + glow * 12 * morph
            : pass === 1
              ? 6 + glow * 4 * morph
              : 1;
        ctx.stroke(ribbon.path);
      }
    ctx.shadowBlur = 0;
    if (elapsed >= revealStart + 1.3) {
      if (!this.done) {
        this.done = true;
        this.settledAt = now;
        this.ready();
      }
      if (this.reduced || this.hold) return;
    }
    this.frame = requestAnimationFrame(this.tick);
  }
  resize() {
    if (this.done && (this.reduced || this.hold)) {
      this.frame = requestAnimationFrame(() => this.draw(this.settledAt));
    }
  }
};
