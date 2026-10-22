#!/usr/bin/env python3
"""
fetch_scholar.py — refresh data/scholar.json for the website.

Google Scholar has no official API and blocks most datacenter IPs (including
GitHub Actions runners), so this script tries sources in order of reliability:

  1. SerpAPI   (env SERPAPI_KEY)      reliable; free plan = 250 searches/month,
                                       weekly sync uses ~8-10 (2 calls per run)
  2. scholarly (pip package)          free; may be blocked on CI. Set
                                       SCRAPERAPI_KEY to route via ScraperAPI
  3. OpenAlex  (by ORCID, no key)     always works; different citation counts
                                       than Scholar, used as fallback / cross-check

If every Scholar source fails, the existing scholar.json is kept and only the
OpenAlex block is refreshed, so the site never shows empty numbers.

Usage:  python scripts/fetch_scholar.py [--out data/scholar.json]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

AUTHOR_ID = os.environ.get("SCHOLAR_ID", "9XM_AuIAAAAJ")
ORCID = os.environ.get("ORCID", "0000-0003-3149-0340")
UA = "janson-site-bot/1.0 (+https://github.com)"


def log(msg: str) -> None:
    print(f"[scholar] {msg}", file=sys.stderr)


def http_json(url: str, timeout: int = 40) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------- #
# 1. SerpAPI — https://serpapi.com/google-scholar-author-api
# --------------------------------------------------------------------------- #
def from_serpapi(key: str) -> dict:
    base = "https://serpapi.com/search.json"
    params = {"engine": "google_scholar_author", "author_id": AUTHOR_ID, "hl": "en", "num": 100, "api_key": key}
    first = http_json(f"{base}?{urllib.parse.urlencode(params)}")
    if "error" in first:
        raise RuntimeError(first["error"])
    table = first.get("cited_by", {}).get("table", [])

    # Rows come in a fixed order (citations, h-index, i10-index); their key names
    # are localised ("h_index" / "indice_h", "since_2021" / "depuis_2021"), so read
    # them by position and take the year from whatever the "since" key is called.
    def row(i: int) -> tuple[int, int, int]:
        if i >= len(table):
            raise RuntimeError("SerpAPI response has no cited_by table — check the author_id")
        vals = next(iter(table[i].values()))
        since_key = next(k for k in vals if k != "all")
        year = int("".join(ch for ch in since_key if ch.isdigit()) or dt.date.today().year - 5)
        return int(vals["all"]), int(vals[since_key]), year

    c_all, c_since, since = row(0)
    h_all, h_since, _ = row(1)
    i_all, i_since, _ = row(2)
    graph = {str(g["year"]): int(g["citations"]) for g in first.get("cited_by", {}).get("graph", [])}

    pubs, start, page = [], 0, first
    while True:
        for a in page.get("articles", []):
            pubs.append({
                "title": a.get("title", ""),
                "year": int(a["year"]) if str(a.get("year", "")).isdigit() else None,
                "citations": int((a.get("cited_by") or {}).get("value") or 0),
            })
        if len(page.get("articles", [])) < 100 or start >= 900:
            break
        start += 100
        params["start"] = start
        page = http_json(f"{base}?{urllib.parse.urlencode(params)}")

    return {
        "source": "google_scholar (serpapi)",
        "since_year": since,
        "citations": {"all": c_all, "since": c_since},
        "h_index": {"all": h_all, "since": h_since},
        "i10_index": {"all": i_all, "since": i_since},
        "cites_per_year": graph,
        "publications": pubs,
    }


# --------------------------------------------------------------------------- #
# 2. scholarly — https://github.com/scholarly-python-package/scholarly
# --------------------------------------------------------------------------- #
def from_scholarly() -> dict:
    from scholarly import scholarly, ProxyGenerator  # type: ignore

    sk = os.environ.get("SCRAPERAPI_KEY")
    if sk:
        pg = ProxyGenerator()
        if pg.ScraperAPI(sk):
            scholarly.use_proxy(pg)
            log("scholarly: using ScraperAPI proxy")

    author = scholarly.search_author_id(AUTHOR_ID)
    author = scholarly.fill(author, sections=["basics", "indices", "counts", "publications"])
    since = dt.date.today().year - 5
    pubs = []
    for p in author.get("publications", []):
        bib = p.get("bib", {})
        y = bib.get("pub_year")
        pubs.append({"title": bib.get("title", ""), "year": int(y) if str(y).isdigit() else None,
                     "citations": int(p.get("num_citations") or 0)})
    return {
        "source": "google_scholar (scholarly)",
        "since_year": since,
        "citations": {"all": int(author.get("citedby", 0)), "since": int(author.get("citedby5y", 0))},
        "h_index": {"all": int(author.get("hindex", 0)), "since": int(author.get("hindex5y", 0))},
        "i10_index": {"all": int(author.get("i10index", 0)), "since": int(author.get("i10index5y", 0))},
        "cites_per_year": {str(k): int(v) for k, v in sorted(author.get("cites_per_year", {}).items())},
        "publications": pubs,
    }


# --------------------------------------------------------------------------- #
# 3. OpenAlex — https://docs.openalex.org (no key; polite pool via mailto)
# --------------------------------------------------------------------------- #
def from_openalex() -> dict:
    mailto = os.environ.get("OPENALEX_MAILTO", "")
    q = f"?mailto={urllib.parse.quote(mailto)}" if mailto else ""
    a = http_json(f"https://api.openalex.org/authors/orcid:{ORCID}{q}")
    stats = a.get("summary_stats", {}) or {}
    return {
        "id": a.get("id"),
        "cited_by_count": a.get("cited_by_count"),
        "works_count": a.get("works_count"),
        "h_index": stats.get("h_index"),
        "i10_index": stats.get("i10_index"),
        "counts_by_year": {str(c["year"]): c["cited_by_count"] for c in sorted(a.get("counts_by_year", []), key=lambda c: c["year"])},
        "fetched": now_iso(),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/scholar.json")
    args = ap.parse_args()
    out = Path(args.out)
    old = json.loads(out.read_text("utf-8")) if out.exists() else {}

    data = None
    if os.environ.get("SERPAPI_KEY"):
        try:
            data = from_serpapi(os.environ["SERPAPI_KEY"])
            log("fetched via SerpAPI")
        except Exception as e:  # noqa: BLE001
            log(f"SerpAPI failed: {e}")
    if data is None:
        try:
            data = from_scholarly()
            log("fetched via scholarly")
        except Exception as e:  # noqa: BLE001
            log(f"scholarly failed: {e}")

    try:
        openalex = from_openalex()
        log("fetched OpenAlex")
    except Exception as e:  # noqa: BLE001
        log(f"OpenAlex failed: {e}")
        openalex = old.get("openalex")

    if data is None:
        if old and not old.get("sample"):
            log("all Scholar sources failed — keeping previous Scholar numbers")
            old["openalex"] = openalex
            out.write_text(json.dumps(old, indent=2, ensure_ascii=False) + "\n", "utf-8")
            return 0
        if openalex:
            log("no Scholar data at all — falling back to OpenAlex numbers")
            data = {
                "source": "openalex",
                "since_year": dt.date.today().year - 5,
                "citations": {"all": openalex["cited_by_count"],
                              "since": sum(v for k, v in openalex["counts_by_year"].items() if int(k) >= dt.date.today().year - 5)},
                "h_index": {"all": openalex["h_index"], "since": openalex["h_index"]},
                "i10_index": {"all": openalex["i10_index"], "since": openalex["i10_index"]},
                "cites_per_year": openalex["counts_by_year"],
                "publications": [],
            }
        else:
            log("nothing fetched; leaving file untouched")
            return 1

    data.update({
        "author_id": AUTHOR_ID,
        "profile_url": f"https://scholar.google.com/citations?user={AUTHOR_ID}",
        "updated": now_iso(),
        "openalex": openalex,
    })
    # sanity check: refuse to overwrite good data with an obviously broken scrape
    if old and not old.get("sample") and data["citations"]["all"] < 0.5 * old.get("citations", {}).get("all", 0):
        log("new citation count dropped by >50% — looks like a bad scrape, not writing")
        return 1

    ordered = {k: data[k] for k in ["source", "author_id", "profile_url", "updated", "since_year", "citations",
                                    "h_index", "i10_index", "cites_per_year", "publications", "openalex"]}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", "utf-8")
    log(f"wrote {out} — {data['citations']['all']} citations, h={data['h_index']['all']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
