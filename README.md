# andreas-janson.github.io — draft

Static academic website for **Dr. Andreas Janson**, replacing
`sites.google.com/view/jansonandreas`. No build step, no framework:
plain HTML/CSS/JS that runs on GitHub Pages as-is.

> **Status: draft content.** All 174 publications from the Google Site are imported;
> remaining gaps are marked with a yellow `TODO` tag or a dashed placeholder on the page.

## Structure

```
.
├── index.html            home.md          hero, affiliations, about, Scholar panel, selected pubs, git-log CV
├── publications.html     publications.bib search · filters · BibTeX per entry · citation basket · export
├── projects.html         projects/        funding summary, project cards, media coverage
├── teaching.html         teaching.md      philosophy, courses, AOM PDWs, key papers, awarded theses
├── awards.html           awards.log       filterable log (paper / service / teaching / impact)
├── service.html          service.yml      AIS role, organizing, track chairs, AE, reviewing, memberships
├── 404.html
├── legal.html          .legal           imprint + privacy; hidden dotfile (press "." for ls -a), linked in the status bar
├── assets/
│   ├── fonts/            self-hosted web fonts (no requests to Google)
│   ├── css/style.css     design tokens (dark + light), all components
│   ├── js/main.js        shell: explorer sidebar, tab bar, status bar, theme, ⌘K palette  ← edit NAV/PROFILES here
│   ├── js/bib.js         dependency-free BibTeX parser / serializer / highlighter
│   ├── js/publications.js publication list + export UI (also renders "selected" on home)
│   ├── js/scholar.js     citation panel
│   └── img/              portrait.jpg etc. (add yourself)
├── data/
│   ├── publications.bib  ← single source of truth for all publications
│   └── scholar.json      ← written by the workflow, never edit by hand
├── scripts/fetch_scholar.py
└── .github/workflows/update-scholar.yml
```

The page shell (sidebar, tabs, status bar) is injected by `main.js`, so navigation
lives in one place. Each page only contains its own content inside
`<div id="app" data-page="…">`.

## Deploy on GitHub Pages

1. Create a repo — `<username>.github.io` for a root site, or any name for `/<repo>/`.
   All links are relative, so both work.
2. Push these files to `main`.
3. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root.**
4. Optional custom domain: Settings → Pages → Custom domain (adds a `CNAME` file).

Local preview (needed because pages `fetch()` the data files):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Publications → BibTeX

`data/publications.bib` drives the list, the filters, the home-page selection,
the command palette and every export. Website-only fields are stripped from exports:

| field              | effect on the site                                  |
| ------------------ | --------------------------------------------------- |
| `selected = {true}`| appears under "selected publications" on home       |
| `award = {A; B}`   | ★ badge(s); powers the "awards" filter              |
| `status = {...}`   | `forthcoming` / `online first` tag                  |
| `pdf = {url}`      | author-version link                                 |
| `summary = {...}`  | one-line teaser on home                             |
| `topic = {a; b}`   | searchable facets                                   |

Entry type sets the category: `@article` → Journal, `@inproceedings` → Conference,
`@incollection`/`@inbook` → Chapter, `@book`/`@phdthesis` → Book, else Other.

Export features: per-entry `{ } BibTeX` (copy, download, copy as plain text),
a **citation basket** that persists across visits, "Export shown" for the current
filter, an ASCII-safe option (`ö` → `{\"o}` for classic bibtex) and a toggle to keep
website fields. Deep links open an entry directly: `publications.html#janson2020ladders`.

### Importing the full list (next step)

Fastest route: export BibTeX from Google Scholar ("My profile → select all → Export → BibTeX")
or from ORCID / Zotero, then merge with the award/selected fields here. The Google Site list
can also be converted entry by entry; ask Claude to convert it.

## Google Scholar stats

Google Scholar has no API and blocks most cloud IPs, so the pipeline is layered:

1. **GitHub Action** (`update-scholar.yml`) runs every Monday and on demand
   (Actions → *Update Scholar stats* → *Run workflow*).
2. `fetch_scholar.py` tries, in order:
   - **SerpAPI** if the secret `SERPAPI_KEY` is set — reliable; free plan is 250 searches/month,
     a weekly sync needs ~8–10 (2 calls per run for ~150 papers).
   - **scholarly** (free scraper). Often blocked on GitHub runners; set `SCRAPERAPI_KEY`
     to route it through ScraperAPI's free tier.
   - **OpenAlex** by ORCID — always fetched as a cross-check, and used as fallback numbers.
3. A guard keeps the previous numbers if a scrape fails or looks broken (>50 % drop).

Result: `data/scholar.json` (totals, h-index, i10, citations per year, per-paper counts).
Per-paper counts are matched to `.bib` entries by normalised title and shown as ❝ badges;
"sort: citations" uses them.

Secrets: **Settings → Secrets and variables → Actions → New repository secret.**

## Images, videos and placeholder links

Every picture from the Google Site has a placeholder that names its target file
(e.g. `assets/img/service/icis-2019-review-coordinators.jpg`). Save the image at that
path and it replaces the placeholder automatically; no HTML edit needed.

- `<figure class="media" data-src="…" style="--r:4/3">` image (ratio via `--r`; add `contain` for logos/badges)
- `<figure class="media video" data-yt="VIDEO_ID">` click-to-play YouTube (youtube-nocookie)
- `<a class="todo-link" href="#" data-todo="what goes here">` marked placeholder link; clicking shows what is missing
- Home-page paper thumbnails: `assets/img/pubs/<bibkey>.png`, or `image = {path}` in the .bib

**Uploading pictures.** Either send them to Claude (any filenames; they get matched, resized and pushed),
or upload them yourself on github.com: open the target folder, e.g. `assets/img/service/`, then
**Add file → Upload files**, using the exact filename from MEDIA.md. The *Optimize images* workflow then
resizes them and strips camera/GPS metadata automatically (`scripts/optimize_images.py`).

`python scripts/check_media.py --write` regenerates **MEDIA.md**, a checklist of every
missing file (with the Google Site page it comes from) and every placeholder link.

## Keyboard

`⌘K` / `Ctrl+K` / `/` — command palette (pages, papers, actions) · `Esc` closes.
