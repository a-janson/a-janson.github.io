/* scholar.js — renders the citation panel on the home page.
   Source: data/scholar.json (refreshed weekly by GitHub Actions)            */
(function () {
  "use strict";
  const S = window.Site;
  const el = document.getElementById("scholar-panel");
  if (!el) return;

  function chart(perYear) {
    const years = Object.keys(perYear).map(Number).sort((a, b) => a - b);
    if (!years.length) return "";
    const vals = years.map((y) => +perYear[y] || 0);
    const max = Math.max(...vals);
    const step = niceStep(max / 4);
    const top = Math.ceil(max / step) * step || 1;
    const W = 560, H = 200, L = 40, R = 6, T = 12, Bm = 26;
    const iw = W - L - R, ih = H - T - Bm;
    const bw = iw / years.length;
    const y = (v) => T + ih - (v / top) * ih;
    const thisYear = new Date().getFullYear();
    let grid = "";
    for (let v = 0; v <= top + 0.001; v += step) {
      grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`
        + `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="var(--muted)" font-size="10" font-family="var(--font-mono)">${v}</text>`;
    }
    const bars = years.map((yr, i) => {
      const v = vals[i], x = L + i * bw + bw * 0.18, w = bw * 0.64, partial = yr === thisYear;
      return `<g><title>${yr}: ${v} citations${partial ? " (year to date)" : ""}</title>
        <rect x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, T + ih - y(v))}" rx="2"
          fill="${partial ? "none" : "var(--num)"}" stroke="var(--num)" stroke-width="${partial ? 1.5 : 0}" stroke-dasharray="${partial ? "3 2" : "0"}" opacity="${partial ? 1 : 0.85}"/>
        ${(i % Math.ceil(years.length / 7) === 0 || i === years.length - 1) ? `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="var(--font-mono)">${yr}</text>` : ""}</g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Citations per year">${grid}${bars}</svg>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  S.Data.scholar().then((s) => {
    if (!s) { el.innerHTML = `<p class="todo-block">data/scholar.json missing: run the <b>Update Scholar stats</b> workflow.</p>`; return; }
    const since = s.since_year || new Date().getFullYear() - 5;
    const upd = s.updated ? new Date(s.updated).toISOString().slice(0, 10) : "unknown";
    el.innerHTML = `
      <div class="scholar-metrics">
        <table class="metric-table">
          <thead><tr><th>metric</th><th>all</th><th>since ${since}</th></tr></thead>
          <tbody>
            <tr><td>citations</td><td class="big">${S.fmt(s.citations.all)}</td><td>${S.fmt(s.citations.since)}</td></tr>
            <tr><td>h-index</td><td class="big">${s.h_index.all}</td><td>${s.h_index.since}</td></tr>
            <tr><td>i10-index</td><td class="big">${s.i10_index.all}</td><td>${s.i10_index.since}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="scholar-chart">
        <div class="mono muted" style="font-size:.74rem;margin-bottom:6px">citations / year <span style="opacity:.7">(dashed = year to date)</span></div>
        ${chart(s.cites_per_year || {})}
      </div>
      <div class="scholar-foot">
        ${s.sample ? `<span class="badge sample">sample data</span>` : `<span class="badge live">synced</span>`}
        <span>source: Google Scholar</span>
        <span>updated ${upd}</span>
        <a href="${s.profile_url}" target="_blank" rel="noopener" style="margin-left:auto">open profile ↗</a>
      </div>`;
  });
})();
