/* bib.js — tiny dependency-free BibTeX toolkit
   parse()      : BibTeX source  -> [{type, key, fields, raw}]
   serialize()  : entry          -> clean BibTeX string (custom site fields stripped)
   toText()     : entry          -> plain-text citation (APA-like)
   helpers for display (LaTeX -> Unicode, author formatting)                       */
(function (global) {
  "use strict";

  // Fields used only by the website; removed on export unless "keep site fields" is on.
  const SITE_FIELDS = ["award", "selected", "pdf", "status", "summary", "slides", "code", "project", "topic", "image", "language", "tags"];
  const FIELD_ORDER = ["author", "editor", "title", "journal", "booktitle", "series", "year", "month",
    "volume", "number", "pages", "articleno", "publisher", "address", "school", "institution",
    "edition", "doi", "url", "isbn", "issn", "note", "keywords", "abstract"];

  /* ---------------- parsing ---------------- */
  function parse(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const at = src.indexOf("@", i);
      if (at < 0) break;
      let j = at + 1, type = "";
      while (j < n && /[A-Za-z]/.test(src[j])) type += src[j++];
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] !== "{" && src[j] !== "(") { i = j; continue; }
      const closeCh = src[j] === "{" ? "}" : ")";
      const openCh = src[j];
      let depth = 0, k = j;
      for (; k < n; k++) {
        const c = src[k];
        if (c === "\\") { k++; continue; }
        if (c === openCh || (openCh === "(" && c === "{")) depth++;
        else if (c === closeCh || (openCh === "(" && c === "}")) { depth--; if (depth === 0) break; }
      }
      const raw = src.slice(at, k + 1);
      const body = src.slice(j + 1, k);
      i = k + 1;
      type = type.toLowerCase();
      if (["comment", "string", "preamble"].includes(type)) continue;
      const comma = body.indexOf(",");
      if (comma < 0) continue;
      const key = body.slice(0, comma).trim();
      const fields = parseFields(body.slice(comma + 1));
      out.push({ type, key, fields, raw });
    }
    return out;
  }

  function parseFields(s) {
    const fields = {};
    let i = 0;
    const n = s.length;
    while (i < n) {
      while (i < n && /[\s,]/.test(s[i])) i++;
      let name = "";
      while (i < n && /[A-Za-z0-9_\-:]/.test(s[i])) name += s[i++];
      if (!name) { i++; continue; }
      while (i < n && /\s/.test(s[i])) i++;
      if (s[i] !== "=") continue;
      i++;
      let value = "";
      // value may be concatenated with '#'
      while (i < n) {
        while (i < n && /\s/.test(s[i])) i++;
        if (s[i] === "{") {
          let depth = 0, start = i;
          for (; i < n; i++) {
            if (s[i] === "\\") { i++; continue; }
            if (s[i] === "{") depth++;
            else if (s[i] === "}") { depth--; if (depth === 0) break; }
          }
          value += s.slice(start + 1, i);
          i++;
        } else if (s[i] === '"') {
          let start = ++i, depth = 0;
          for (; i < n; i++) {
            if (s[i] === "\\") { i++; continue; }
            if (s[i] === "{") depth++;
            else if (s[i] === "}") depth--;
            else if (s[i] === '"' && depth === 0) break;
          }
          value += s.slice(start, i);
          i++;
        } else {
          let start = i;
          while (i < n && /[^,#\s}]/.test(s[i])) i++;
          value += s.slice(start, i);
        }
        while (i < n && /\s/.test(s[i])) i++;
        if (s[i] === "#") { i++; continue; }
        break;
      }
      fields[name.toLowerCase()] = value.replace(/\s+/g, " ").trim();
    }
    return fields;
  }

  /* ---------------- LaTeX <-> Unicode ---------------- */
  const ACCENTS = { '"': "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", "c": "̧", "v": "̌", "=": "̄", "u": "̆", ".": "̇", "H": "̋", "k": "̨" };
  function latexToText(s) {
    if (!s) return "";
    return s
      .replace(/\\([`'^"~=.uvHck])\s*\{?\\?([A-Za-z])\}?/g, (m, a, ch) => (ch + (ACCENTS[a] || "")).normalize("NFC"))
      .replace(/\\ss\b\s*/g, "ß").replace(/\\o\b\s*/g, "ø").replace(/\\O\b\s*/g, "Ø").replace(/\\l\b\s*/g, "ł").replace(/\\aa\b\s*/g, "å")
      .replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\_/g, "_").replace(/\\\$/g, "$").replace(/\\#/g, "#")
      .replace(/\\(textit|emph|textbf|textsc|mbox)\{([^}]*)\}/g, "$2")
      .replace(/---/g, "—").replace(/--/g, "–")
      .replace(/~/g, " ")
      .replace(/[{}]/g, "")
      .trim();
  }
  const TO_LATEX = { "ä": '{\\"a}', "ö": '{\\"o}', "ü": '{\\"u}', "Ä": '{\\"A}', "Ö": '{\\"O}', "Ü": '{\\"U}', "ß": "{\\ss}",
    "é": "{\\'e}", "è": "{\\`e}", "ê": "{\\^e}", "á": "{\\'a}", "à": "{\\`a}", "â": "{\\^a}", "í": "{\\'i}", "ó": "{\\'o}", "ú": "{\\'u}",
    "ç": "{\\c{c}}", "ñ": "{\\~n}", "ł": "{\\l}", "ø": "{\\o}", "å": "{\\aa}", "ș": "{\\c{s}}", "ț": "{\\c{t}}", "ă": "{\\u{a}}",
    "–": "--", "—": "---", "’": "'", "‘": "`", "“": "``", "”": "''", "„": ",,", "…": "\\ldots{}" };
  function unicodeToLatex(s) {
    return s.replace(/[äöüÄÖÜßéèêáàâíóúçñłøåșță–—‘’“”„…]/g, (c) => TO_LATEX[c] || c)
            .replace(/(^|[^\\])&/g, "$1\\&")
            .replace(/(^|[^\\])%/g, "$1\\%");
  }

  /* ---------------- authors ---------------- */
  function splitAuthors(s) {
    if (!s) return [];
    return s.split(/\s+and\s+/i).map((a) => {
      a = latexToText(a);
      let last, first;
      if (a.includes(",")) { [last, first] = a.split(",").map((x) => x.trim()); }
      else { const p = a.split(/\s+/); last = p.pop(); first = p.join(" "); }
      return { last, first: first || "" };
    });
  }
  function initials(first) {
    return first.split(/[\s]+/).filter(Boolean).map((w) => w.split("-").map((x) => x[0] + ".").join("-")).join(" ");
  }

  /* ---------------- categories ---------------- */
  const CATEGORIES = {
    article: { id: "journal", label: "Journal", code: "J" },
    inproceedings: { id: "conference", label: "Conference", code: "C" },
    conference: { id: "conference", label: "Conference", code: "C" },
    incollection: { id: "chapter", label: "Book chapter", code: "B" },
    inbook: { id: "chapter", label: "Book chapter", code: "B" },
    book: { id: "book", label: "Book / Thesis", code: "M" },
    phdthesis: { id: "book", label: "Book / Thesis", code: "M" },
    techreport: { id: "other", label: "Other", code: "R" },
    misc: { id: "other", label: "Other", code: "O" },
  };
  function category(e) { return CATEGORIES[e.type] || { id: "other", label: "Other", code: "O" }; }

  /* ---------------- serialize ---------------- */
  function serialize(e, opts) {
    opts = Object.assign({ keepSiteFields: false, latexEscape: false }, opts || {});
    const keys = Object.keys(e.fields).filter((k) => opts.keepSiteFields || !SITE_FIELDS.includes(k));
    keys.sort((a, b) => {
      const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const w = Math.max(...keys.map((k) => k.length), 0);
    const lines = keys.map((k) => {
      let v = e.fields[k];
      if (opts.latexEscape && !["url", "doi", "pdf"].includes(k)) v = unicodeToLatex(v);
      return `  ${k.padEnd(w)} = {${v}}`;
    });
    return `@${e.type}{${e.key},\n${lines.join(",\n")}\n}`;
  }
  function serializeMany(list, opts) {
    const head = `% Exported from ${(opts && opts.site) || location.host || "website"} on ${new Date().toISOString().slice(0, 10)}\n% ${list.length} entr${list.length === 1 ? "y" : "ies"}\n\n`;
    return head + list.map((e) => serialize(e, opts)).join("\n\n") + "\n";
  }

  /* ---------------- plain-text citation ---------------- */
  function toText(e) {
    const f = e.fields;
    const au = splitAuthors(f.author);
    const names = au.map((a) => `${a.last}, ${initials(a.first)}`);
    const authors = names.length > 1 ? names.slice(0, -1).join(", ") + ", & " + names[names.length - 1] : names[0] || "";
    const year = f.status ? (f.status === "forthcoming" ? "forthcoming" : `${f.year ? f.year + ", " : ""}${f.status}`) : (f.year || "n.d.");
    const title = latexToText(f.title);
    let venue = latexToText(f.journal || f.booktitle || f.publisher || f.school || f.institution || "");
    if (f.volume) venue += `, ${f.volume}`;
    if (f.number) venue += `(${f.number})`;
    if (f.pages) venue += `, ${latexToText(f.pages)}`;
    const doi = f.doi ? ` https://doi.org/${f.doi}` : f.url ? ` ${f.url}` : "";
    const t = /[?!.]$/.test(title) ? title : title + ".";
    return `${authors} (${year}). ${t} ${venue}.${doi}`.replace(/\.\./g, ".");
  }

  /* ---------------- syntax-highlighted HTML ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function highlight(bib) {
    return bib.split("\n").map((line) => {
      let m;
      if ((m = line.match(/^@(\w+)\{([^,]+),$/))) return `<span class="t-at">@${esc(m[1])}</span><span class="t-p">{</span><span class="t-key">${esc(m[2])}</span><span class="t-p">,</span>`;
      if ((m = line.match(/^(\s+)(\S+)(\s*)= \{(.*)\}(,?)$/))) return `${m[1]}<span class="t-f">${esc(m[2])}</span>${m[3]}<span class="t-p">= {</span><span class="t-v">${esc(m[4])}</span><span class="t-p">}${m[5]}</span>`;
      if (line === "}") return `<span class="t-p">}</span>`;
      return esc(line);
    }).join("\n");
  }

  global.Bib = { parse, serialize, serializeMany, toText, latexToText, splitAuthors, initials, category, highlight, esc, SITE_FIELDS };
})(window);
