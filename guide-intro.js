"use strict";
// Three continuous ribbons projected from 3D, then morphed into the brand waves.
CF.GuideIntro = class {
  constructor(root, ready, settled = false) {
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.title = root.querySelector(".guide-intro-title");
    this.ctx = this.canvas.getContext("2d");
    this.ready = ready;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.start = performance.now() - (settled ? 7000 : 0);
    this.frame = requestAnimationFrame((t) => this.draw(t));
  }
  stop() {
    cancelAnimationFrame(this.frame);
  }
  ease(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  draw(now) {
    const t = this.reduced ? 7 : (now - this.start) / 1000;
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
    const morph = this.ease((t - 2.05) / 2.25),
      reveal = this.ease((t - 4.8) / 0.7);
    const alpha = this.ease((t - 0.35) / 0.85);
    const titleWidth = this.title.getBoundingClientRect().width;
    const logoScale = Math.min(1, w / 650, h / 400),
      logoWidth = 72 * logoScale,
      gap = 26 * logoScale;
    const shift = (-(titleWidth + gap) / 2) * reveal;
    // Reveal the complete title only once the moving logo has cleared its left edge.
    const titleLeft = (logoWidth + gap - titleWidth) / 2;
    const logoRight = shift + logoWidth / 2;
    const clearance = this.ease(
      (titleLeft - logoRight - 8 * logoScale) / (12 * logoScale),
    );
    const textReveal = this.ease((t - 5.3) / 0.65) * clearance;
    this.title.style.opacity = String(textReveal);
    this.title.style.transform = `translate(-50%,-50%) translateX(${(logoWidth + gap) / 2 + 8 * (1 - textReveal)}px)`;
    this.title.style.clipPath = "none";
    const flowTime = t * 1.12;
    const segments = [];
    for (let strand = 0; strand < 3; strand++) {
      let previous;
      for (let i = 0; i <= 110; i++) {
        const u = i / 110,
          phase = (strand * Math.PI * 2) / 3,
          a = (u - 0.5) * Math.PI * 2;
        // Keep horizontal travel monotonic so the ribbons cannot fold into knots.
        // Uncoil in 3D before turning toward
        // the camera; sizing and depth settle later than the wave shape.
        const uncoil = this.ease((t - 1.95 - strand * 0.06) / 2.2);
        const face = this.ease((t - 2.15) / 2.1);
        const gather = morph;
        const breath = uncoil * (1 - this.ease((t - 2.6) / 1.65));
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
        const roll = 0.12 * Math.sin(flowTime * 0.6) * (1 - face);
        const pitch = 0.18 * (1 - face);
        const yaw = 0.12 * Math.sin((t - 1.95) * 0.8) * uncoil * (1 - face);
        const xx = x * Math.cos(yaw) + z * Math.sin(yaw);
        const zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const xr = xx * Math.cos(roll) - y * Math.sin(roll);
        const yr = xx * Math.sin(roll) + y * Math.cos(roll);
        const yp = yr * Math.cos(pitch) - zz * Math.sin(pitch);
        const zp = yr * Math.sin(pitch) + zz * Math.cos(pitch);
        const perspective = 720 / (720 - zp);
        // Geometric interpolation keeps the shrinking speed proportional to size.
        const size = scale * Math.pow(logoWidth / (440 * scale), gather);
        const point = {
          x: w / 2 + xr * perspective * size + shift,
          y: h / 2 + yp * perspective * size,
          z: zp,
          u,
        };
        if (previous)
          segments.push({
            a: previous,
            b: point,
            z: (previous.z + point.z) / 2,
            strand,
          });
        previous = point;
      }
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
    const ribbons = [0, 1, 2]
      .map((strand) => {
        const parts = segments
          .filter((s) => s.strand === strand)
          .sort((a, b) => a.b.u - b.b.u);
        return {
          parts,
          z: parts.reduce((sum, s) => sum + s.z, 0) / parts.length,
        };
      })
      .sort((a, b) => a.z - b.z);
    for (const ribbon of ribbons)
      for (const pass of [0, 1, 2]) {
        const points = [ribbon.parts[0].a, ...ribbon.parts.map((s) => s.b)];
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
          gradient.addColorStop(j / 12, `rgba(${color.join(",")},${opacity})`);
        }
        ctx.strokeStyle = gradient;
        const core = 2.4 * (1 - morph) + 3.6 * logoScale * morph;
        ctx.lineWidth = core * (pass === 0 ? 5 : pass === 1 ? 2 : 1);
        ctx.shadowColor = `rgba(${color.join(",")},${alpha * 0.38})`;
        ctx.shadowBlur =
          pass === 0
            ? 14 + flash * 12 + glow * 12 * morph
            : pass === 1
              ? 6 + glow * 4 * morph
              : 1;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    ctx.shadowBlur = 0;
    if (t >= 6.0) {
      if (!this.done) {
        this.done = true;
        this.ready();
      }
      if (this.reduced) return;
    }
    this.frame = requestAnimationFrame((next) => this.draw(next));
  }
  resize() {
    if (this.done && this.reduced) {
      this.frame = requestAnimationFrame(() => this.draw(this.start + 7000));
    }
  }
};
