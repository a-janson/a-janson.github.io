/* main.js — shared shell: explorer sidebar, tab bar, status bar, theme,
   command palette (⌘K / Ctrl+K / "/"), clipboard + download helpers.
   Edit NAV / PROFILES below to change navigation on every page at once.   */
(function () {
  "use strict";

  const SITE = {
    name: "Andreas Janson",
    orcid: "0000-0003-3149-0340",
    scholarId: "9XM_AuIAAAAJ",
  };

  const NAV = [
    { id: "home", href: "index.html", file: "home", ext: "md", title: "Home" },
    { id: "publications", href: "publications.html", file: "publications", ext: "bib", title: "Publications" },
    { id: "projects", href: "projects.html", file: "projects", ext: "dir", title: "Projects & Grants" },
    { id: "teaching", href: "teaching.html", file: "teaching", ext: "md", title: "Teaching" },
    { id: "awards", href: "awards.html", file: "awards", ext: "log", title: "Awards" },
    { id: "service", href: "service.html", file: "service", ext: "yml", title: "Service" },
    // dotfile: hidden in the explorer until "ls -a" (press "." or use ⌘K); always linked from the status bar
    { id: "legal", href: "legal.html", file: ".legal", ext: "", title: "Imprint & Privacy", hidden: true },
  ];
  const fname = (n) => n.file + (n.ext === "dir" ? "/" : n.ext ? "." + n.ext : "");
  const badge = (n) => (n.ext === "dir" ? "/" : n.ext ? "." + n.ext : "§");

  const PROFILES = [
    { label: "Google Scholar", href: `https://scholar.google.com/citations?user=${SITE.scholarId}` },
    { label: "ORCID", href: `https://orcid.org/${SITE.orcid}` },
    { label: "DBLP", href: "https://dblp.org/pid/144/1213.html" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/andreasjanson/" },
    { label: "ResearchGate", href: "https://www.researchgate.net/profile/Andreas_Janson" },
    { label: "HSG Alexandria", href: "https://alexandria.unisg.ch/entities/person/Andreas_Janson" },
  ];

  /* ---------------- storage (never required) ---------------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* ---------------- theme ---------------- */
  const root = document.documentElement;
  const savedTheme = store.get("theme");
  if (savedTheme === "light" || savedTheme === "dark") root.setAttribute("data-theme", savedTheme);
  function currentTheme() {
    const t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("theme", next);
    toast(`theme → ${next}`);
  }
  // "ls -a": reveal dotfiles (.legal) in the explorer; remembered per browser
  if (store.get("hidden") === "1") root.classList.add("show-hidden");
  function toggleHidden() {
    const on = root.classList.toggle("show-hidden");
    store.set("hidden", on ? "1" : "0");
    toast(on ? "$ ls -a  → hidden files shown" : "$ ls  → hidden files hidden");
  }

  /* ---------------- data (cached) ---------------- */
  const cache = {};
  const Data = {
    bib() {
      return cache.bib || (cache.bib = fetch("data/publications.bib").then((r) => {
        if (!r.ok) throw new Error("publications.bib not found");
        return r.text();
      }).then((t) => window.Bib.parse(t)));
    },
    scholar() {
      return cache.scholar || (cache.scholar = fetch("data/scholar.json").then((r) => r.ok ? r.json() : null).catch(() => null));
    },
  };

  /* ---------------- helpers ---------------- */
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function copy(text, label) {
    const done = () => toast(label || "Copied to clipboard");
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
      ta.remove();
      toast(ok ? (label || "Copied to clipboard") : "Copy failed: select the text and press Ctrl+C");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function download(filename, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || "application/x-bibtex;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast(`Saving ${filename}`);
    } catch (e) { toast("Download blocked: use Copy instead"); }
  }
  // e-mail addresses are assembled at runtime to keep them away from scrapers
  function mail(user, domain) { return `${user}@${domain}`; }

  /* ---------------- shell ---------------- */
  function buildShell() {
    const app = document.getElementById("app");
    if (!app) return;
    const pageId = app.dataset.page;
    const page = NAV.find((n) => n.id === pageId) || NAV[0];
    const content = app.innerHTML;

    const tree = NAV.map((n) => `
      <li${n.hidden ? ' class="dotfile"' : ""}><a href="${n.href}"${n.id === pageId ? ' aria-current="page"' : ""}>
        <span>${n.file}</span><span class="ext ${n.ext || "dot"}">${badge(n)}</span></a></li>`).join("");
    if (page.hidden) root.classList.add("show-hidden");
    const profiles = PROFILES.map((p) => `<li><a href="${p.href}" target="_blank" rel="noopener"><span>${p.label}</span><span aria-hidden="true">↗</span></a></li>`).join("");

    app.outerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar" aria-label="Site navigation">
        <div class="side-head"><span class="side-label">Explorer</span><kbd>⌘K</kbd></div>
        <a class="brand" href="index.html"><b>Andreas Janson</b><span>Information Systems · University of St.Gallen</span></a>
        <ul class="tree">
          <li class="folder"><a href="index.html" title="Back to home">▾ ~/janson</a></li>
          ${tree}
        </ul>
        <div class="side-sec"><span class="side-label">Profiles</span><ul class="side-links">${profiles}</ul></div>
        <div class="side-foot">
          <button class="btn sm" type="button" data-action="theme" id="theme-toggle">◐ toggle theme</button>
          <a class="btn sm ghost" href="data/publications.bib" download="janson.bib">⤓ publications.bib</a>
        </div>
      </aside>
      <div class="main">
        <header class="tabbar">
          <button class="btn sm menu-btn" type="button" id="menu-btn" aria-controls="sidebar" aria-expanded="false" aria-label="Open navigation">☰</button>
          <div class="tab"><span class="ext ${page.ext || "dot"}">${badge(page)}</span>${fname(page)}</div>
          <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html" title="Back to home">janson</a><span>›</span><span style="color:var(--fg)">${page.title}</span></nav>
          <span class="spacer"></span>
          <button class="btn sm palette-btn" type="button" id="palette-btn"><span aria-hidden="true">⌕</span><span class="lbl">Search site</span><kbd>⌘K</kbd></button>
        </header>
        <main class="content" id="content">${content}</main>
      </div>
    </div>
    <footer class="statusbar" aria-label="Status">
      <span>⎇ main</span>
      <span id="sb-scholar">scholar: loading…</span>
      <span class="opt-hide" id="sb-pubs"></span>
      <span class="grow"></span>
      <span class="opt-hide">ORCID ${SITE.orcid}</span>
      <span class="opt-hide">UTF-8 · BibTeX</span>
      <a class="sb-legal" href="legal.html" title="Imprint &amp; privacy">§ .legal</a>
    </footer>`;

    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    const sb = document.getElementById("sidebar"), mb = document.getElementById("menu-btn");
    mb.addEventListener("click", () => { const o = sb.classList.toggle("open"); mb.setAttribute("aria-expanded", String(o)); });
    document.addEventListener("click", (e) => { if (sb.classList.contains("open") && !sb.contains(e.target) && e.target !== mb) { sb.classList.remove("open"); mb.setAttribute("aria-expanded", "false"); } });
    document.getElementById("palette-btn").addEventListener("click", openPalette);

    // obfuscated e-mails: <button class="copy-mail" data-u="andreas.janson" data-d="unisg.ch">
    document.querySelectorAll(".copy-mail").forEach((b) => {
      const addr = mail(b.dataset.u, b.dataset.d);
      b.textContent = `"${addr}"`;
      b.title = "Copy e-mail address";
      b.addEventListener("click", () => copy(addr, `Copied ${addr}`));
    });

    hydrateMedia(document);

    // status bar metrics
    Data.scholar().then((s) => {
      const el = document.getElementById("sb-scholar");
      if (!s) { el.textContent = "scholar: no data"; return; }
      el.textContent = `scholar: ${fmt(s.citations.all)} citations · h-index ${s.h_index.all}${s.sample ? " (sample)" : ""}`;
    });
    Data.bib().then((list) => { document.getElementById("sb-pubs").textContent = `${list.length} bib entries`; }).catch(() => {});
  }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  /* ---------------- media placeholders ----------------
     <figure class="media" data-src="assets/img/x.jpg" data-alt="…" style="--r:4/3">
       <figcaption>…</figcaption></figure>
     • shows a hatched placeholder naming the expected file
     • if the file exists, the real image replaces it (no HTML edit needed)
     • data-yt="VIDEO_ID" [data-start="3923"] [data-poster="local.jpg"] turns it into a click-to-load
       YouTube embed (privacy-friendly youtube-nocookie.com)                  */
  function hydrateMedia(scope) {
    (scope || document).querySelectorAll("figure.media[data-src], figure.media[data-yt]").forEach((fig) => {
      if (fig.dataset.ready) return;
      fig.dataset.ready = "1";
      let frame = fig.querySelector(".frame");
      if (!frame) { frame = document.createElement("div"); frame.className = "frame"; fig.prepend(frame); }
      const yt = fig.dataset.yt;
      const src = fig.dataset.src || "";
      const small = fig.classList.contains("logo");
      const label = src ? (small ? src.split("/").pop() : src) : `youtube.com/watch?v=${yt}`;
      const hint = fig.dataset.hint || (yt ? "video · click to play" : "drop this file in to replace the placeholder");
      const esc = (t) => (window.Bib ? window.Bib.esc(t) : t);
      if (fig.dataset.mono) {
        // monogram tile for projects without a logo; a real file at data-src still replaces it
        const m = fig.dataset.mono;
        fig.classList.add("mono");
        frame.innerHTML = `<div class="mono-tile${m.length > 5 ? " long" : ""}" aria-hidden="true"><b>${esc(m)}</b>${fig.dataset.monoSub ? `<span>${esc(fig.dataset.monoSub)}</span>` : ""}</div>`;
      } else {
        frame.innerHTML = `<div class="ph"><span class="ic" aria-hidden="true">${yt ? "▶" : "▣"}</span><code>${esc(label)}</code>${small ? "" : `<span class="dim">${hint}</span>`}</div>`;
      }
      const addPlay = () => { if (yt && !frame.querySelector(".play")) frame.insertAdjacentHTML("beforeend", `<button class="play" type="button" tabindex="-1">▶ play</button>`); };
      const poster = src || fig.dataset.poster || ""; // local poster only: nothing loads from YouTube before "play"
      if (poster) {
        const img = new Image();
        img.alt = fig.dataset.alt || "";
        img.decoding = "async";
        img.onload = () => { frame.innerHTML = ""; frame.appendChild(img); fig.classList.remove("mono"); fig.classList.add("loaded"); if (yt) addPlay(); };
        img.src = poster;
      }
      if (yt) {
        addPlay();
        frame.setAttribute("role", "button");
        frame.setAttribute("tabindex", "0");
        frame.setAttribute("aria-label", `Play video: ${fig.dataset.alt || yt}`);
        const play = () => {
          const start = fig.dataset.start ? `&start=${fig.dataset.start}` : "";
          frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1${start}" title="${fig.dataset.alt || "Video"}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        };
        frame.addEventListener("click", play, { once: true });
        frame.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); } }, { once: true });
      }
    });
  }

  // placeholder links: <a class="todo-link" href="#" data-todo="what goes here">
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-todo]");
    if (!a) return;
    e.preventDefault();
    toast(`Link not set yet: ${a.dataset.todo}`);
  });

  /* ---------------- command palette ---------------- */
  let pal = null;
  function paletteItems() {
    const items = NAV.map((n) => ({ g: "page", label: `${n.title}  —  ${fname(n)}`, run: () => (location.href = n.href) }));
    items.push(
      { g: "action", label: "Toggle light / dark theme", run: toggleTheme },
      { g: "action", label: "ls -a  —  show hidden files", run: toggleHidden },
      { g: "action", label: "Download all publications (.bib)", run: () => Data.bib().then((l) => download("janson.bib", window.Bib.serializeMany(l, { site: SITE.name }))) },
      { g: "action", label: "Copy e-mail (St.Gallen)", run: () => copy(mail("andreas.janson", "unisg.ch"), "Copied e-mail") },
    );
    PROFILES.forEach((p) => items.push({ g: "link", label: p.label, run: () => window.open(p.href, "_blank", "noopener") }));
    return items;
  }
  function openPalette() {
    if (pal) return;
    const base = paletteItems();
    let items = base.slice(), sel = 0;
    const wrap = document.createElement("div");
    wrap.className = "cmdk-wrap";
    wrap.innerHTML = `
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="cmdk-in"><span class="ps">❯</span><input id="cmdk-input" type="text" placeholder="Jump to a page, paper, or action…" autocomplete="off" spellcheck="false" aria-controls="cmdk-list"></div>
        <ul class="cmdk-list" id="cmdk-list" role="listbox"></ul>
        <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>`;
    document.body.appendChild(wrap);
    pal = wrap;
    const input = wrap.querySelector("input"), list = wrap.querySelector("ul");
    let papers = [];
    Data.bib().then((l) => {
      papers = l.map((e) => ({ g: e.fields.year || "paper", label: window.Bib.latexToText(e.fields.title), key: e.key, run: () => (location.href = `publications.html#${e.key}`) }));
      render();
    }).catch(() => {});
    function render() {
      const q = input.value.trim().toLowerCase();
      const all = base.concat(papers);
      items = q ? all.filter((it) => q.split(/\s+/).every((w) => (it.label + " " + it.g).toLowerCase().includes(w))) : base.concat(papers.slice(0, 6));
      items = items.slice(0, 40);
      sel = Math.min(sel, Math.max(items.length - 1, 0));
      list.innerHTML = items.length ? items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}"><span class="g">${window.Bib.esc(it.g)}</span><span class="x">${window.Bib.esc(it.label)}</span></li>`).join("")
        : `<li aria-disabled="true"><span class="g">—</span><span class="x muted">No matches</span></li>`;
    }
    function close() { wrap.remove(); pal = null; document.removeEventListener("keydown", onKey, true); }
    function run(i) { const it = items[i]; if (!it) return; close(); it.run(); }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(items.length, 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(items.length, 1); render(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    }
    input.addEventListener("input", () => { sel = 0; render(); });
    list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) run(+li.dataset.i); });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey, true);
    render();
    input.focus();
  }
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
    else if (e.key === "/" && !typing && !pal) { e.preventDefault(); openPalette(); }
    else if (e.key === "." && !typing && !pal && !e.metaKey && !e.ctrlKey && !e.altKey) toggleHidden();
  });

  window.Site = { SITE, Data, copy, download, toast, fmt, store, hydrateMedia };
  // main.js is loaded at the end of <body>, so #app already exists: build synchronously
  // so that page scripts loaded after it see the final DOM.
  if (document.getElementById("app")) buildShell();
  else document.addEventListener("DOMContentLoaded", buildShell);
})();
