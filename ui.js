"use strict";
CF.ui = {
  chartSummaries: new WeakMap(),
  invalidateChart(chart) {
    this.chartSummaries.delete(chart);
  },
  summary(chart) {
    let cached = this.chartSummaries.get(chart);
    if (!cached || cached.notes !== chart.notes || cached.length !== chart.notes.length) {
      cached = { notes: chart.notes, length: chart.notes.length,
        end: CF.endTick(chart.notes), densities: [] };
      this.chartSummaries.set(chart, cached);
    }
    return cached;
  },
  chartDuration(chart) {
    return chart.notes.length ? CF.toMs(this.summary(chart).end + CF.PPQN, chart.bpm) : 0;
  },
  renderRows(container, rows, emptyHTML) {
    if (!rows.length) {
      container.innerHTML = emptyHTML;
      return;
    }
    const existing = new Map([...container.children].map((row) => [row.dataset.chart, row]));
    let cursor = container.firstElementChild;
    for (const [id, html] of rows) {
      let row = existing.get(id);
      if (row?.renderedHTML !== html) {
        const template = document.createElement("template");
        template.innerHTML = html;
        row = template.content.firstElementChild;
        row.renderedHTML = html;
      }
      if (row !== cursor) container.insertBefore(row, cursor);
      cursor = row.nextElementSibling;
    }
    // Unchanged rows stay attached; discard only rows removed by filtering or
    // replaced with updated content, without retaining an off-screen DOM cache.
    while (cursor) {
      const next = cursor.nextElementSibling;
      cursor.remove();
      cursor = next;
    }
  },
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
    const summary = this.summary(chart), index = large ? 1 : 0;
    if (summary.densities[index]) return summary.densities[index];
    const bins = Array(large ? 80 : 38).fill(0),
      end = Math.max(1, summary.end);
    chart.notes.forEach(
      (n) =>
        bins[
          Math.min(bins.length - 1, Math.floor((n.tick / end) * bins.length))
        ]++,
    );
    const max = Math.max(1, ...bins);
    return summary.densities[index] = `<div class="density ${large ? "large" : ""}" aria-label="Note density overview">${bins.map((n) => `<i style="--h:${Math.max(5, (n / max) * 100)}%"></i>`).join("")}</div>`;
  },
  async dialog({
    title,
    body,
    confirm = "Confirm",
    danger = false,
    animated = false,
    dismissOnBackdrop = false,
    className = "",
    onOpen,
  }) {
    const el = document.querySelector("#dialog");
    el.className = className;
    el.innerHTML = `<form method="dialog"><div class="dialog-eyebrow">CHARTFLOW / WORKSPACE</div><h2>${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"><button value="cancel" class="button" formnovalidate>Cancel</button><button value="confirm" class="button ${danger ? "danger" : "primary"}">${confirm}</button></div></form>`;
    el.returnValue = "cancel";
    el.dataset.animated = animated;
    el.dataset.state = "opening";
    el.showModal();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 240;
    const enter = animated
      ? el.animate(
          [
            { opacity: 0, transform: "translateY(12px) scale(.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration, easing: "cubic-bezier(.22,1,.36,1)" },
        )
      : null;
    let closing = false;
    const dismiss = async (value = "cancel") => {
      if (closing || !el.open) return;
      closing = true;
      enter?.cancel();
      if (animated) {
        el.dataset.state = "closing";
        await el.animate(
          [
            { opacity: 1, transform: "translateY(0) scale(1)" },
            { opacity: 0, transform: "translateY(8px) scale(.98)" },
          ],
          { duration, easing: "cubic-bezier(.4,0,.2,1)" },
        ).finished.catch(() => {});
      }
      el.close(value);
    };
    el.dismiss = dismiss;
    el.oncancel = (event) => {
      event.preventDefault();
      dismiss();
    };
    el.onclick = (event) => {
      if (!dismissOnBackdrop || event.target !== el) return;
      const rect = el.getBoundingClientRect();
      if (
        event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom
      )
        dismiss();
    };
    onOpen?.(el);
    el.querySelector("form").addEventListener("submit", (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      dismiss(event.submitter?.value || "confirm");
    });
    return new Promise((resolve) => {
      el.onclose = () => {
        const values = Object.fromEntries(
          new FormData(el.querySelector("form")),
        );
        el.onclick = null;
        el.oncancel = null;
        el.dismiss = null;
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
