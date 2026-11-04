#!/usr/bin/env python3
"""
build_seo.py — make the site readable for search engines and AI crawlers.

The pages render their publication lists with JavaScript. Google can run that,
but slowly, and most AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) never do.
This script writes everything a crawler needs as plain HTML / text:

  • <head> block per page (between <!-- seo:start --> and <!-- seo:end -->):
    title, description, canonical URL, Open Graph / Twitter tags, JSON-LD
    (Person + ProfilePage on the home page, ScholarlyArticle list on the
    publications page, breadcrumbs everywhere)
  • static publication lists inside #pub-list and #selected-pubs
    (between <!-- prerender:start --> and <!-- prerender:end -->);
    the JavaScript replaces them on load, so visitors see no difference
  • sitemap.xml, robots.txt and llms.txt

Runs automatically via .github/workflows/build-seo.yml whenever pages or
data/publications.bib change.  Locally:  python scripts/build_seo.py
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://a-janson.github.io/"
NAME = "Andreas Janson"
PORTRAIT = BASE + "assets/img/portrait.jpg"
ORCID = "0000-0003-3149-0340"
SAME_AS = [
    f"https://orcid.org/{ORCID}",
    "https://scholar.google.com/citations?user=9XM_AuIAAAAJ",
    "https://dblp.org/pid/144/1213.html",
    "https://www.linkedin.com/in/andreasjanson/",
    "https://www.researchgate.net/profile/Andreas_Janson",
    "https://alexandria.unisg.ch/entities/person/Andreas_Janson",
]
TOPICS = ["Information Systems", "Privacy by Design", "Trust in AI", "Digital Sovereignty", "Digital Services",
          "Value Co-Creation", "Digital Learning", "Design Science Research", "Conversational AI",
          "Gamification", "Digital Nudging"]
SUMMARY = ("Dr. Andreas Janson is a research group lead at the Institute of Information Systems and Digital "
           "Business (IWI-HSG), University of St.Gallen, Switzerland. He studies how digital services are "
           "understood and designed: privacy by design, trust in AI, digital sovereignty, conversational AI, "
           "digital learning, gamification and digital nudging, mostly with design science research.")

# page -> (title, description, breadcrumb name); None = not indexed
PAGES = {
    "index.html": ("Dr. Andreas Janson · Research in Information Systems, University of St.Gallen",
                   "Dr. Andreas Janson, research group lead at IWI-HSG, University of St.Gallen. Research on privacy by "
                   "design, trust in AI, digital sovereignty, conversational AI, digital learning and design science.",
                   "Home"),
    "publications.html": ("Research Publications · Dr. Andreas Janson",
                          "All publications of Andreas Janson (University of St.Gallen) in ISR, JAIS, EJIS, ISJ, JIT, "
                          "AMLE and at ICIS, ECIS, HICSS, WI: searchable, filterable, with BibTeX export.",
                          "Publications"),
    "projects.html": ("Research Projects & Grants · Dr. Andreas Janson",
                      "Research projects and grants of Andreas Janson: Innosuisse flagship SCESC (HSG Impact Award "
                      "2026), SNSF, DFG and BMBF projects on AI, privacy, nudging and digital learning.",
                      "Projects"),
    "teaching.html": ("Teaching · Dr. Andreas Janson",
                      "Teaching of Andreas Janson at St.Gallen, Hamburg and Kassel: flipped classroom, courses, "
                      "AOM management education workshops and supervised theses.",
                      "Teaching"),
    "awards.html": ("Research Awards · Dr. Andreas Janson",
                    "Awards of Andreas Janson: AIS Best Conference Paper on Education 2024, DESRIST and HICSS best "
                    "papers, ICIS best theory paper runner-up, HSG Impact Award 2026.",
                    "Awards"),
    "service.html": ("Academic Service · Dr. Andreas Janson",
                     "Academic service of Andreas Janson: track chair at ICIS, ECIS, WI and DESRIST, associate "
                     "editor, AIS Associate Vice President Education Curations, reviewing.",
                     "Service"),
}

# ---------------------------------------------------------------- bibtex
ACC = {'"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", "c": "\u0327", "v": "\u030c"}


def tex(s: str) -> str:
    s = re.sub(r"\\([\"'`^~cv])\s*\{?\\?([A-Za-z])\}?", lambda m: (m.group(2) + ACC[m.group(1)]), s or "")
    s = s.replace("\\ss", "ß").replace("\\&", "&").replace("\\%", "%").replace("\\_", "_")
    s = re.sub(r"\\(textit|emph|textbf|textsc|mbox)\{([^}]*)\}", r"\2", s)
    s = s.replace("---", "—").replace("--", "–").replace("~", " ")
    import unicodedata
    return unicodedata.normalize("NFC", re.sub(r"[{}]", "", s)).strip()


def parse_bib(text: str) -> list[dict]:
    out, i = [], 0
    for m in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,", text):
        if m.start() < i or m.group(1).lower() in ("string", "comment", "preamble"):
            continue
        depth, j = 0, text.index("{", m.start())
        while True:
            c = text[j]
            depth += c == "{"
            depth -= c == "}"
            if depth == 0:
                break
            j += 1
        body, fields, k = text[m.end():j], {}, 0
        for fm in re.finditer(r"(\w+)\s*=\s*\{", body):
            if fm.start() < k:
                continue
            d, p = 1, fm.end()
            while d:
                d += {"{": 1, "}": -1}.get(body[p], 0)
                p += 1
            fields[fm.group(1).lower()] = re.sub(r"\s+", " ", body[fm.end():p - 1]).strip()
            k = p
        out.append({"type": m.group(1).lower(), "key": m.group(2), "f": fields})
        i = j
    return out


CODES = {"article": "J", "inproceedings": "C", "conference": "C", "incollection": "B", "inbook": "B",
         "book": "M", "phdthesis": "M", "techreport": "R"}


def authors(f: dict) -> list[str]:
    res = []
    for a in re.split(r"\s+and\s+", tex(f.get("author", ""))):
        last, _, first = a.partition(",")
        res.append(f"{last.strip()}, {first.strip()}".strip(", "))
    return [a for a in res if a]


def venue(f: dict) -> str:
    return tex(f.get("journal") or f.get("booktitle") or f.get("publisher") or f.get("school") or f.get("institution") or "")


def link(f: dict) -> str:
    return f"https://doi.org/{f['doi']}" if f.get("doi") else f.get("url") or f.get("pdf") or ""


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def entry_html(e: dict, summary: bool = False) -> str:
    f = e["f"]
    t, href = esc(tex(f.get("title", ""))), link(f)
    au = "; ".join(f"<span class=\"me\">{esc(a)}</span>" if a.startswith("Janson,") else esc(a) for a in authors(f))
    tail = []
    if f.get("volume"):
        tail.append(f"Vol. {esc(f['volume'])}" + (f" ({esc(f['number'])})" if f.get("number") else ""))
    if f.get("pages"):
        tail.append(esc(tex(f["pages"])))
    meta = [f'<span class="tag award">★ {esc(a.strip())}</span>' for a in f.get("award", "").split(";") if a.strip()]
    if f.get("status"):
        meta.append(f'<span class="tag status">{esc(f["status"])}</span>')
    if f.get("doi"):
        meta.append(f'<a class="act" href="https://doi.org/{esc(f["doi"])}">doi ↗</a>')
    if f.get("pdf"):
        meta.append(f'<a class="act" href="{esc(f["pdf"])}">pdf ↗</a>')
    s = f'<p class="muted">{esc(tex(f["summary"]))}</p>' if summary and f.get("summary") else ""
    return (f'<li class="pub" id="{esc(e["key"])}"><span class="ptype">{CODES.get(e["type"], "O")}</span>'
            f'<div class="pub-body"><h3 class="pub-title">{f"<a href={chr(34)}{esc(href)}{chr(34)}>{t}</a>" if href else t}</h3>'
            f'<div class="pub-authors">{au}</div><div class="pub-venue"><i>{esc(venue(f))}</i>'
            f'{", " + ", ".join(tail) if tail else ""}{", " + esc(f["year"]) if f.get("year") else ""}</div>{s}'
            f'<div class="pub-meta">{"".join(meta)}</div></div></li>')


def sort_key(e: dict):
    return (0 if e["f"].get("status") else 1, -int(e["f"].get("year") or 9999), e["key"])


def scholarly(e: dict) -> dict:
    f = e["f"]
    d = {"@type": "ScholarlyArticle" if e["type"] in ("article", "inproceedings", "conference") else "CreativeWork",
         "name": tex(f.get("title", "")),
         "author": [{"@type": "Person", "name": " ".join(reversed([p.strip() for p in a.split(",", 1)]))}
                    for a in authors(f)]}
    if f.get("year"):
        d["datePublished"] = f["year"]
    if venue(f):
        d["isPartOf"] = {"@type": "Periodical" if e["type"] == "article" else "PublicationEvent", "name": venue(f)}
    if link(f):
        d["url"] = link(f)
    if f.get("doi"):
        d["identifier"] = {"@type": "PropertyValue", "propertyID": "DOI", "value": f["doi"]}
    if f.get("tags"):
        d["keywords"] = ", ".join(t.strip() for t in f["tags"].split(";"))
    return d


# ---------------------------------------------------------------- pages
def person() -> dict:
    return {
        "@type": "Person", "@id": BASE + "#person", "name": NAME, "honorificPrefix": "Dr.",
        "alternateName": ["Dr. Andreas Janson", "Dr. Janson", "A. Janson"],
        "givenName": "Andreas", "familyName": "Janson", "url": BASE, "image": PORTRAIT,
        "jobTitle": "Research Group Lead", "description": SUMMARY,
        "worksFor": {"@type": "CollegeOrUniversity", "name": "University of St.Gallen", "url": "https://www.unisg.ch/",
                     "department": {"@type": "Organization", "url": "https://iwi.unisg.ch/",
                                    "name": "Institute of Information Systems and Digital Business (IWI-HSG)"}},
        "alumniOf": {"@type": "CollegeOrUniversity", "name": "University of Kassel", "url": "https://www.uni-kassel.de/"},
        "knowsAbout": TOPICS, "sameAs": SAME_AS,
        "identifier": {"@type": "PropertyValue", "propertyID": "ORCID", "value": ORCID},
    }


def head_block(page: str, pubs: list[dict]) -> str:
    title, desc, crumb = PAGES[page]
    url = BASE if page == "index.html" else BASE + page
    graph = [{"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": NAME, "item": BASE}] + (
        [] if page == "index.html" else [{"@type": "ListItem", "position": 2, "name": crumb, "item": url}])}]
    if page == "index.html":
        graph += [{"@type": "ProfilePage", "url": url, "name": title, "mainEntity": person()},
                  {"@type": "WebSite", "url": BASE, "name": NAME, "alternateName": ["Dr. Andreas Janson", "Andreas Janson Research"]}]
    else:
        graph.append({"@type": "WebPage", "url": url, "name": title, "description": desc,
                      "about": {"@id": BASE + "#person"}, "isPartOf": {"@type": "WebSite", "url": BASE}})
    if page == "publications.html":
        graph.append({"@type": "ItemList", "name": f"Publications of {NAME}", "numberOfItems": len(pubs),
                      "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": scholarly(e)}
                                          for i, e in enumerate(pubs)]})
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    return "\n".join([
        "<!-- seo:start · generated by scripts/build_seo.py, edit there -->",
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{esc(desc)}">',
        '<meta name="author" content="Andreas Janson">',
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{"profile" if page == "index.html" else "website"}">',
        f'<meta property="og:site_name" content="{NAME}">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{PORTRAIT}">',
        '<meta name="twitter:card" content="summary">',
        f'<link rel="alternate" type="text/plain" title="llms.txt" href="{BASE}llms.txt">',
        f'<script type="application/ld+json">{ld}</script>',
        "<!-- seo:end -->",
    ])


def set_head(src: str, block: str) -> str:
    src = re.sub(r"<!-- seo:start.*?<!-- seo:end -->\n?", "", src, flags=re.S)
    for rx in (r"<title>.*?</title>\n?", r'<meta name="description"[^>]*>\n?', r'<meta property="og:[^"]*"[^>]*>\n?',
               r'<link rel="canonical"[^>]*>\n?', r'<script type="application/ld\+json">.*?</script>\n?'):
        src = re.sub(rx, "", src, flags=re.S)
    return re.sub(r'(<meta name="viewport"[^>]*>\n)', lambda m: m.group(1) + block + "\n", src, count=1)


def set_prerender(src: str, el_id: str, inner: str) -> str:
    rx = re.compile(r'(<div id="' + el_id + r'">).*?(</div>\n)', re.S)
    m = rx.search(src)
    if not m:
        raise SystemExit(f"#{el_id} not found")
    start = src.index('<div id="' + el_id + '">')
    if "<!-- prerender:start -->" in src[start:start + 200]:
        end = src.index("<!-- prerender:end -->", start) + len("<!-- prerender:end -->")
        return src[:start] + f'<div id="{el_id}"><!-- prerender:start -->{inner}<!-- prerender:end -->' + src[end:]
    return rx.sub(lambda mm: f"{mm.group(1)}<!-- prerender:start -->{inner}<!-- prerender:end -->{mm.group(2)}", src, count=1)


def lastmod(path: Path) -> str:
    try:
        d = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path.name], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.strip()
        return d or dt.date.today().isoformat()
    except Exception:
        return dt.date.today().isoformat()


def main() -> None:
    pubs = sorted(parse_bib((ROOT / "data/publications.bib").read_text(encoding="utf-8")), key=sort_key)
    selected = [e for e in pubs if e["f"].get("selected", "").lower() in ("true", "yes", "1")]

    for page in PAGES:
        p = ROOT / page
        src = set_head(p.read_text(encoding="utf-8"), head_block(page, pubs))
        if page == "publications.html":
            groups, cur = [], None
            for e in pubs:
                y = "In press" if e["f"].get("status") else e["f"].get("year", "n.d.")
                if y != cur:
                    groups.append((y, []))
                    cur = y
                groups[-1][1].append(entry_html(e))
            inner = "".join(f'<section class="year-group"><div class="year-label">{y}</div><ul class="pubs">{"".join(items)}</ul></section>'
                            for y, items in groups)
            src = set_prerender(src, "pub-list", inner)
        if page == "index.html":
            src = set_prerender(src, "selected-pubs", '<ul class="pubs">' + "".join(entry_html(e, True) for e in selected) + "</ul>")
        p.write_text(src, encoding="utf-8")

    for page in ("404.html", "legal.html"):  # reachable, but not search results
        p = ROOT / page
        s = p.read_text(encoding="utf-8")
        if '<meta name="robots"' not in s:
            s = re.sub(r'(<meta name="viewport"[^>]*>\n)', r'\1<meta name="robots" content="noindex">\n', s, count=1)
            p.write_text(s, encoding="utf-8")

    urls = "".join(f"  <url><loc>{BASE if pg == 'index.html' else BASE + pg}</loc><lastmod>{lastmod(ROOT / pg)}</lastmod></url>\n"
                   for pg in PAGES)
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
                                      encoding="utf-8")

    (ROOT / "robots.txt").write_text(
        "# Search engines and AI assistants are welcome to read and cite this site.\n"
        "User-agent: *\nAllow: /\n\n"
        f"Sitemap: {BASE}sitemap.xml\n", encoding="utf-8")

    lines = [f"# {NAME}", "", f"> {SUMMARY}", "",
             "ORCID: " + ORCID + " · Contact: see " + BASE + " (e-mail on the home page)", "", "## Pages", ""]
    lines += [f"- [{PAGES[pg][2]}]({BASE if pg == 'index.html' else BASE + pg}): {PAGES[pg][1]}" for pg in PAGES]
    lines += ["", "## Profiles", ""] + [f"- {u}" for u in SAME_AS]
    lines += ["", f"## Publications ({len(pubs)})", "",
              "Full list with BibTeX: " + BASE + "publications.html · raw: " + BASE + "data/publications.bib", ""]
    for e in pubs:
        f = e["f"]
        when = f.get("status") or f.get("year", "n.d.")
        lines.append(f"- {'; '.join(authors(f))} ({when}). {tex(f.get('title', ''))}. *{venue(f)}*."
                     + (f" {link(f)}" if link(f) else "") + (f" — award: {tex(f['award'])}" if f.get("award") else ""))
    (ROOT / "llms.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"seo: {len(PAGES)} pages, {len(pubs)} publications, {len(selected)} selected")


if __name__ == "__main__":
    main()
