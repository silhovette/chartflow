"use strict";
CF.ui = {
  escape(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  },
  time(ms, precise = false) {
    const n = Math.max(0, ms);
    return `${String(Math.floor(n / 60000)).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")}${precise ? "." + String(Math.floor(n) % 1000).padStart(3, "0") : ""}`;
  },
  ago(value) {
    const h = Math.floor((Date.now() - value) / 3600000);
    return h < 1
      ? "Just now"
      : h < 24
        ? `${h}h ago`
        : `${Math.floor(h / 24)}d ago`;
  },
  toast(message) {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  },
  density(chart, large = false) {
    const bins = Array(large ? 80 : 38).fill(0),
      end = Math.max(1, CF.endTick(chart.notes));
    chart.notes.forEach(
      (n) =>
        bins[
          Math.min(bins.length - 1, Math.floor((n.tick / end) * bins.length))
        ]++,
    );
    const max = Math.max(1, ...bins);
    return `<div class="density ${large ? "large" : ""}" aria-label="Note density overview">${bins.map((n) => `<i style="--h:${Math.max(5, (n / max) * 100)}%"></i>`).join("")}</div>`;
  },
  async dialog({ title, body, confirm = "Confirm", danger = false, onOpen }) {
    const el = document.querySelector("#dialog");
    el.innerHTML = `<form method="dialog"><div class="dialog-eyebrow">CHARTFLOW / WORKSPACE</div><h2>${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"><button value="cancel" class="button" formnovalidate>Cancel</button><button value="confirm" class="button ${danger ? "danger" : "primary"}">${confirm}</button></div></form>`;
    el.returnValue = "cancel";
    el.showModal();
    onOpen?.(el);
    return new Promise((resolve) => {
      el.onclose = () => {
        const values = Object.fromEntries(
          new FormData(el.querySelector("form")),
        );
        resolve(el.returnValue === "confirm" ? values : null);
      };
    });
  },
  fit(canvas) {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(r.width * dpr) ||
      canvas.height !== Math.round(r.height * dpr)
    ) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  },
};
