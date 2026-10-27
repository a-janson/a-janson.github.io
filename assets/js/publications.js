/* publications.js — renders data/publications.bib
   • full-text search, type / year / award filters, sort by year or citations
   • per-entry BibTeX panel (copy · download · copy as text)
   • citation basket: pick entries across filters → export one .bib
   • #tag filter on the research-theme hashtags (bib field "tags"; ?tag= in the URL)
   • per-paper citation counts matched from data/scholar.json
   Also exposes PubUI.mountSelected() for the home page.                    */
(function () {
  "use strict";
  const B = window.Bib, S = window.Site;
  const ME = /^janson$/i;

  // research themes, same order as the hashtag chips on the home page
  const TAGS = ["privacy-by-design", "trust-in-ai", "digital-sovereignty", "digital-services", "value-co-creation",
    "digital-learning", "design-science", "conversational-ai", "gamification", "digital-nudging"];
  const tagsOf = (e) => (e.fields.tags || "").split(";").map((t) => t.trim()).filter(Boolean);

  const norm = (s) => B.latexToText(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Scholar titles often differ slightly from the published ones (subtitle,
  // punctuation, a word). Exact match first, then the best word-overlap match.
  function citeMap(scholar) {
    const exact = new Map();
    const pubs = (scholar && Array.isArray(scholar.publications)) ? scholar.publications : [];
    const toks = pubs.map((p) => { const n = norm(p.title); exact.set(n, p.citations); return { set: new Set(n.split(" ")), c: p.citations }; });
    const memo = new Map();
    return {
      get(n) {
        if (exact.has(n)) return exact.get(n);
        if (memo.has(n)) return memo.get(n);
        const a = new Set(n.split(" "));
        let best = 0, val;
        toks.forEach((t) => {
          let inter = 0; a.forEach((w) => { if (t.set.has(w)) inter++; });
          const j = inter / (a.size + t.set.size - inter);
          if (j > best) { best = j; val = t.c; }
        });
        const res = best >= 0.82 ? val : undefined;
        memo.set(n, res);
        return res;
      },
    };
  }

  function authorsHTML(e) {
    return B.splitAuthors(e.fields.author).map((a) => {
      const n = `${B.esc(a.last)}, ${B.esc(B.initials(a.first))}`;
      return ME.test(a.last) ? `<span class="me">${n}</span>` : n;
    }).join("; ");
  }
  function venueHTML(e) {
    const f = e.fields;
    let v = B.latexToText(f.journal || f.booktitle || f.publisher || f.school || f.institution || "");
    if (f.type && f.institution) v = `${B.latexToText(f.type)}, ${v}`;
    let tail = [];
    if (f.volume) tail.push(`Vol. ${B.esc(f.volume)}${f.number ? ` (${B.esc(f.number)})` : ""}`);
    if (f.pages) tail.push(B.esc(B.latexToText(f.pages)));
    if (f.articleno) tail.push(`Art. ${B.esc(f.articleno)}`);
    return `<i>${B.esc(v)}</i>${tail.length ? ", " + tail.join(", ") : ""}`;
  }
  function linkFor(e) {
    return e.fields.doi ? `https://doi.org/${e.fields.doi}` : e.fields.url || e.fields.pdf || "";
  }

  function entryHTML(e, ctx) {
    const f = e.fields, cat = B.category(e);
    const title = B.esc(B.latexToText(f.title));
    const href = linkFor(e);
    const awards = (f.award || "").split(";").map((x) => x.trim()).filter(Boolean);
    const cites = ctx.cites.get(norm(f.title));
    const picked = ctx.basket && ctx.basket.has(e.key);
    return `
    <li class="pub${ctx.thumbs ? " with-thumb" : ""}" id="${B.esc(e.key)}" data-key="${B.esc(e.key)}">
      <span class="ptype" title="${cat.label}">${cat.code}</span>
      <div class="pub-body">
        <h3 class="pub-title">${href ? `<a href="${B.esc(href)}" target="_blank" rel="noopener">${title}</a>` : title}</h3>
        <div class="pub-authors">${authorsHTML(e)}</div>
        <div class="pub-venue">${venueHTML(e)}</div>
        ${ctx.summaries && f.summary ? `<p class="muted" style="margin:6px 0 0;font-size:.92rem;max-width:70ch">${B.esc(B.latexToText(f.summary))}</p>` : ""}
        <div class="pub-meta">
          ${awards.map((a) => `<span class="tag award">★ ${B.esc(a)}</span>`).join("")}
          ${f.status ? `<span class="tag status">${B.esc(f.status)}</span>` : ""}
          ${cites > 0 ? `<span class="tag cites" title="Google Scholar citations">❝ ${S.fmt(cites)}</span>` : ""}
          <button class="act" type="button" data-act="bib" aria-expanded="false" aria-controls="bib-${B.esc(e.key)}">{ } BibTeX</button>
          ${f.doi ? `<a class="act" href="https://doi.org/${B.esc(f.doi)}" target="_blank" rel="noopener">doi ↗</a>` : ""}
          ${f.pdf ? `<a class="act" href="${B.esc(f.pdf)}" target="_blank" rel="noopener">pdf ↗</a>` : ""}
          ${ctx.basket ? `<label class="pick"><input type="checkbox" data-act="pick" ${picked ? "checked" : ""} aria-label="Add ${title} to citation basket"> basket</label>` : ""}
        </div>
        <div class="bibbox" id="bib-${B.esc(e.key)}" hidden></div>
      </div>
      ${ctx.thumbs ? `<figure class="media thumb" data-src="${B.esc(f.image || `assets/img/pubs/${e.key}.png`)}" data-alt="Figure from ${title}" data-hint="key figure / cover" style="--r:4/3"></figure>` : ""}
    </li>`;
  }

  function openBib(li, e, opts) {
    const box = li.querySelector(".bibbox");
    const btn = li.querySelector('[data-act="bib"]');
    const open = box.hidden;
    box.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const bib = B.serialize(e, opts());
    box.innerHTML = `
      <div class="bibbox-head"><span>${B.esc(e.key)}.bib</span><span class="grow"></span>
        <button class="act" type="button" data-b="copy">copy</button>
        <button class="act" type="button" data-b="dl">download</button>
        <button class="act" type="button" data-b="txt">copy as text</button>
      </div>
      <pre class="code">${B.highlight(bib)}</pre>`;
    box.querySelector('[data-b="copy"]').onclick = () => S.copy(bib, `Copied @${e.key}`);
    box.querySelector('[data-b="dl"]').onclick = () => S.download(`${e.key}.bib`, bib + "\n");
    box.querySelector('[data-b="txt"]').onclick = () => S.copy(B.toText(e), "Copied citation text");
  }

  function wireList(container, byKey, opts, onPick) {
    container.addEventListener("click", (ev) => {
      const li = ev.target.closest(".pub");
      if (!li) return;
      const e = byKey.get(li.dataset.key);
      if (ev.target.closest('[data-act="bib"]')) openBib(li, e, opts);
    });
    container.addEventListener("change", (ev) => {
      if (ev.target.matches('[data-act="pick"]')) onPick && onPick(ev.target.closest(".pub").dataset.key, ev.target.checked);
    });
  }

  /* ======================= Home: selected publications ======================= */
  function mountSelected(el) {
    Promise.all([S.Data.bib(), S.Data.scholar()]).then(([list, scholar]) => {
      const sel = list.filter((e) => /^(true|yes|1)$/i.test(e.fields.selected || ""));
      const byKey = new Map(sel.map((e) => [e.key, e]));
      el.innerHTML = `<ul class="pubs">${sel.map((e) => entryHTML(e, { cites: citeMap(scholar), summaries: true, thumbs: true })).join("")}</ul>`;
      S.hydrateMedia(el);
      wireList(el, byKey, () => ({}));
    }).catch((err) => { el.innerHTML = `<p class="todo-block">Could not load publications.bib (${B.esc(err.message)}). Serve the site over HTTP, e.g. <b>python3 -m http.server</b>.</p>`; });
  }

  /* ======================= Publications page ======================= */
  function mountPage() {
    const root = document.getElementById("pub-root");
    if (!root) return;
    const urlTag = new URLSearchParams(location.search).get("tag");
    const state = { q: "", type: "all", awards: false, sort: "year", from: "", tag: TAGS.includes(urlTag) ? urlTag : "", basket: new Set() };
    try { (JSON.parse(S.store.get("basket") || "[]") || []).forEach((k) => state.basket.add(k)); } catch (e) { /* ignore */ }
    const opts = () => ({ keepSiteFields: document.getElementById("opt-site").checked, latexEscape: document.getElementById("opt-latex").checked, site: S.SITE.name });

    Promise.all([S.Data.bib(), S.Data.scholar()]).then(([list, scholar]) => {
      const cites = citeMap(scholar);
      const byKey = new Map(list.map((e) => [e.key, e]));
      [...state.basket].forEach((k) => { if (!byKey.has(k)) state.basket.delete(k); });
      const years = [...new Set(list.map((e) => e.fields.year).filter(Boolean))].sort((a, b) => b - a);
      const counts = list.reduce((m, e) => { const id = B.category(e).id; m[id] = (m[id] || 0) + 1; return m; }, {});
      const hay = new Map(list.map((e) => [e.key, norm([e.fields.title, e.fields.author, e.fields.journal, e.fields.booktitle, e.fields.institution, e.fields.publisher, e.fields.topic, e.fields.tags, e.fields.project, e.fields.year, e.fields.award, e.fields.status, e.fields.note, e.key].join(" "))]));

      // toolbar
      const types = [["all", "All", list.length], ["journal", "Journal"], ["conference", "Conference"], ["chapter", "Chapter"], ["book", "Book"], ["other", "Other"]]
        .filter((t) => t[0] === "all" || counts[t[0]]);
      document.getElementById("type-seg").innerHTML = types.map(([id, label, n]) =>
        `<button type="button" data-type="${id}" aria-pressed="${id === state.type}">${label}<span class="n">${n != null ? n : counts[id]}</span></button>`).join("");
      document.getElementById("year-from").innerHTML = `<option value="">all years</option>` + years.map((y) => `<option value="${y}">≥ ${y}</option>`).join("");

      const tagCounts = TAGS.map((t) => [t, list.filter((e) => tagsOf(e).includes(t)).length]);
      const tagSeg = document.getElementById("tag-seg");
      tagSeg.innerHTML = `<span class="lbl">themes</span>` + tagCounts.map(([t, n]) =>
        `<button type="button" class="chip" data-tag="${t}" aria-pressed="${t === state.tag}">${t}<span class="n">${n}</span></button>`).join("");

      const listEl = document.getElementById("pub-list");
      wireList(listEl, byKey, opts, (key, on) => { on ? state.basket.add(key) : state.basket.delete(key); saveBasket(); });

      function filtered() {
        const words = norm(state.q).split(" ").filter(Boolean);
        let out = list.filter((e) => {
          if (state.type !== "all" && B.category(e).id !== state.type) return false;
          if (state.awards && !e.fields.award) return false;
          if (state.tag && !tagsOf(e).includes(state.tag)) return false;
          if (state.from && !e.fields.status && +(e.fields.year || 0) < +state.from) return false;
          const h = hay.get(e.key);
          return words.every((w) => h.includes(w));
        });
        if (state.sort === "cites") out.sort((a, b) => (cites.get(norm(b.fields.title)) || 0) - (cites.get(norm(a.fields.title)) || 0));
        else if (state.sort === "title") out.sort((a, b) => B.latexToText(a.fields.title).localeCompare(B.latexToText(b.fields.title)));
        else out.sort((a, b) => (b.fields.status ? 1 : 0) - (a.fields.status ? 1 : 0) || (+b.fields.year || 9999) - (+a.fields.year || 9999) || a.key.localeCompare(b.key));
        return out;
      }
      function render() {
        const out = filtered();
        const ctx = { cites, basket: state.basket, summaries: false };
        if (!out.length) {
          listEl.innerHTML = `<p class="todo-block">No entries match <b>${B.esc(state.q || "these filters")}</b>. Clear the search or pick another type.</p>`;
        } else if (state.sort === "year") {
          const groups = new Map();
          out.forEach((e) => { const y = e.fields.status ? "In press" : (e.fields.year || "n.d."); if (!groups.has(y)) groups.set(y, []); groups.get(y).push(e); });
          listEl.innerHTML = [...groups].map(([y, es]) => `<section class="year-group" aria-label="${y}"><div class="year-label">${y}</div><ul class="pubs">${es.map((e) => entryHTML(e, ctx)).join("")}</ul></section>`).join("");
        } else {
          listEl.innerHTML = `<ul class="pubs">${out.map((e) => entryHTML(e, ctx)).join("")}</ul>`;
        }
        document.getElementById("result-line").textContent = `${out.length} of ${list.length} entries${state.tag ? ` · #${state.tag}` : ""} · ${out.filter((e) => e.fields.award).length} with awards`;
        document.getElementById("export-visible").innerHTML = `⤓ Export ${out.length} shown`;
        state.visible = out;
      }

      // events
      const q = document.getElementById("pub-q");
      q.addEventListener("input", () => { state.q = q.value; render(); });
      document.getElementById("type-seg").addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-type]"); if (!b) return;
        state.type = b.dataset.type;
        document.querySelectorAll("#type-seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        render();
      });
      const aw = document.getElementById("awards-only");
      aw.addEventListener("click", () => { state.awards = !state.awards; aw.setAttribute("aria-pressed", String(state.awards)); render(); });
      tagSeg.addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-tag]"); if (!b) return;
        state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag;
        tagSeg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.tag === state.tag)));
        const u = new URL(location.href);
        state.tag ? u.searchParams.set("tag", state.tag) : u.searchParams.delete("tag");
        history.replaceState(null, "", u);
        render();
      });
      document.getElementById("year-from").addEventListener("change", (ev) => { state.from = ev.target.value; render(); });
      document.getElementById("sort").addEventListener("change", (ev) => { state.sort = ev.target.value; render(); });
      document.getElementById("export-visible").addEventListener("click", () => openDrawer(state.visible, "Shown entries"));
      document.getElementById("export-all").addEventListener("click", () => openDrawer(list, "All entries"));

      // basket + drawer
      const fab = document.getElementById("basket-fab");
      const drawer = document.getElementById("drawer");
      const scrim = document.getElementById("scrim");
      let drawerList = [];
      function saveBasket() {
        S.store.set("basket", JSON.stringify([...state.basket]));
        fab.querySelector(".n").textContent = state.basket.size;
        fab.hidden = state.basket.size === 0;
      }
      function openDrawer(entries, label) {
        drawerList = entries.slice();
        document.getElementById("drawer-title").textContent = label;
        renderDrawer();
        drawer.classList.add("open"); scrim.hidden = false;
        drawer.querySelector("button").focus();
      }
      function closeDrawer() { drawer.classList.remove("open"); scrim.hidden = true; }
      function renderDrawer() {
        const isBasket = document.getElementById("drawer-title").textContent === "Citation basket";
        document.getElementById("drawer-count").textContent = `${drawerList.length} entr${drawerList.length === 1 ? "y" : "ies"}`;
        document.getElementById("drawer-body").innerHTML = drawerList.length ? drawerList.map((e) => `
          <div class="drawer-item"><div><code>@${B.esc(e.type)}{${B.esc(e.key)}}</code>${B.esc(B.latexToText(e.fields.title))}</div>
          ${isBasket ? `<button class="act" type="button" data-rm="${B.esc(e.key)}" aria-label="Remove">✕</button>` : ""}</div>`).join("")
          : `<p class="muted">The basket is empty. Tick <b>basket</b> on any entry to collect citations here.</p>`;
        document.getElementById("drawer-preview").innerHTML = B.highlight(drawerList.slice(0, 3).map((e) => B.serialize(e, opts())).join("\n\n") + (drawerList.length > 3 ? `\n\n% … ${drawerList.length - 3} more` : ""));
      }
      fab.addEventListener("click", () => openDrawer([...state.basket].map((k) => byKey.get(k)).filter(Boolean), "Citation basket"));
      document.getElementById("drawer-close").addEventListener("click", closeDrawer);
      scrim.addEventListener("click", closeDrawer);
      document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });
      document.getElementById("drawer-body").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-rm]"); if (!b) return;
        state.basket.delete(b.dataset.rm); saveBasket();
        drawerList = drawerList.filter((e) => e.key !== b.dataset.rm); renderDrawer(); render();
      });
      ["opt-site", "opt-latex"].forEach((id) => document.getElementById(id).addEventListener("change", () => drawer.classList.contains("open") && renderDrawer()));
      document.getElementById("d-copy").addEventListener("click", () => S.copy(B.serializeMany(drawerList, opts()), `Copied ${drawerList.length} entries`));
      document.getElementById("d-dl").addEventListener("click", () => S.download("janson-references.bib", B.serializeMany(drawerList, opts())));
      document.getElementById("d-txt").addEventListener("click", () => S.copy(drawerList.map(B.toText).join("\n\n"), "Copied reference list"));
      document.getElementById("d-clear").addEventListener("click", () => { state.basket.clear(); saveBasket(); if (document.getElementById("drawer-title").textContent === "Citation basket") drawerList = []; renderDrawer(); render(); });

      saveBasket();
      render();

      // deep link: publications.html#key → scroll, flash, open BibTeX
      const go = () => {
        const k = decodeURIComponent(location.hash.slice(1));
        const li = k && document.getElementById(k);
        if (li && li.classList.contains("pub")) {
          li.scrollIntoView({ block: "center" });
          li.classList.add("flash");
          const box = li.querySelector(".bibbox"); if (box.hidden) openBib(li, byKey.get(k), opts);
        }
      };
      window.addEventListener("hashchange", go); go();
    }).catch((err) => {
      document.getElementById("pub-list").innerHTML = `<p class="todo-block">Could not load <b>data/publications.bib</b>: ${B.esc(err.message)}. Open the site through a web server (GitHub Pages, or <b>python3 -m http.server</b> locally); browsers block fetch() from file://.</p>`;
    });
  }

  window.PubUI = { mountSelected, mountPage };
  mountPage();
  const sel = document.getElementById("selected-pubs");
  if (sel) mountSelected(sel);
})();
