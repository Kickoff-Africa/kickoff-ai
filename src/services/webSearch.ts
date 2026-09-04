// src/services/webSearch.ts
import * as cheerio from "cheerio";
import { logger } from "../config/logger";
import { getCachedResults, setCachedResults } from "./searchCache";

// No API key/account needed: we crawl public search engine result pages
// directly instead of calling a paid search API. This is inherently fragile —
// any of these sites can change their markup or start challenging requests
// from datacenter IPs at any time — so every failure mode here fails open
// (returns []) rather than breaking the chat request. We alternate between
// sources and fall back from one to the other so a single site being
// rate-limited/blocked doesn't take search down entirely.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_RESULTS = 5;

// Small local models can't reliably self-report "I don't know this, search
// for it" — a 1B/4B model will often just hallucinate an answer instead.
// So the decision to search is made deterministically in code, based on
// whether the message looks time-sensitive, rather than left to the model.
const SEARCH_TRIGGER_PATTERN =
  /\b(today|current(ly)?|latest|recent(ly)?|breaking|news|update[sd]?|score|weather|forecast|price|stock|exchange rate|who\s+is\s+the\s+(current|new)|what(?:'s|\s+is)\s+the\s+(current|latest))\b/i;
const RECENT_YEAR_PATTERN = /\b20(2[4-9]|[3-9]\d)\b/;

export function shouldSearch(message: string): boolean {
  return SEARCH_TRIGGER_PATTERN.test(message) || RECENT_YEAR_PATTERN.test(message);
}

export type WebSearchResult = { title: string; url: string; snippet: string };

// ---------- source: DuckDuckGo HTML ----------
async function crawlDuckDuckGo(searchQuery: string): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
  );
  if (!res.ok) throw new Error(`DuckDuckGo crawl failed: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const results: WebSearchResult[] = [];

  $(".result").each((_, el) => {
    if (results.length >= MAX_RESULTS) return false;

    const linkEl = $(el).find(".result__a").first();
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");
    const snippet = $(el).find(".result__snippet").text().trim();
    if (!title || !href) return;

    // DDG wraps result links in a redirect: "//duckduckgo.com/l/?uddg=<encoded-url>"
    const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
    let url = href;
    if (uddgMatch) {
      try {
        url = decodeURIComponent(uddgMatch[1]);
      } catch {
        url = href;
      }
    }

    results.push({ title, url, snippet });
  });

  return results;
}

// ---------- source: Bing HTML ----------
function resolveBingUrl(rawHref: string): string {
  try {
    const parsed = new URL(rawHref, "https://www.bing.com");
    const u = parsed.searchParams.get("u");
    if (u && u.startsWith("a1")) {
      const base64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(padded, "base64").toString("utf-8");
    }
  } catch {
    // fall through
  }
  return rawHref;
}

async function crawlBing(searchQuery: string): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
  );
  if (!res.ok) throw new Error(`Bing crawl failed: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const results: WebSearchResult[] = [];

  $("li.b_algo").each((_, el) => {
    if (results.length >= MAX_RESULTS) return false;

    const linkEl = $(el).find("h2 a").first();
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");
    const snippet = $(el).find(".b_caption p").first().text().trim();
    if (!title || !href) return;

    results.push({ title, url: resolveBingUrl(href), snippet });
  });

  return results;
}

const SOURCES: Array<{ name: string; crawl: (q: string) => Promise<WebSearchResult[]> }> = [
  { name: "duckduckgo", crawl: crawlDuckDuckGo },
  { name: "bing", crawl: crawlBing },
];

// Alternates which source is tried first on each call, so load is spread
// across both rather than hammering one every time.
let nextSourceIndex = 0;

async function crawlWithFallback(
  searchQuery: string,
): Promise<{ results: WebSearchResult[]; source: string }> {
  const startIndex = nextSourceIndex;
  nextSourceIndex = (nextSourceIndex + 1) % SOURCES.length;

  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[(startIndex + i) % SOURCES.length];
    try {
      const results = await source.crawl(searchQuery);
      if (results.length > 0) return { results, source: source.name };
    } catch (err) {
      logger.error(
        { source: source.name, err: (err as Error).message },
        "Web crawl source failed",
      );
    }
  }

  return { results: [], source: "none" };
}

// Used by the daily digest job, which wants a fresh crawl on its own schedule
// rather than the per-user-query semantic cache used by `webSearch()` below.
export async function crawlForDigest(searchQuery: string): Promise<WebSearchResult[]> {
  const { results } = await crawlWithFallback(searchQuery);
  return results;
}

// ---------- public entry point ----------
export async function webSearch(searchQuery: string): Promise<WebSearchResult[]> {
  try {
    const cached = await getCachedResults(searchQuery);
    if (cached) return cached;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Web search cache lookup failed");
  }

  const { results, source } = await crawlWithFallback(searchQuery);

  if (results.length > 0) {
    try {
      await setCachedResults(searchQuery, source, results);
    } catch (err) {
      logger.error({ err: (err as Error).message }, "Web search cache write failed");
    }
  }

  return results;
}

export function formatSearchResults(results: WebSearchResult[]): string {
  return results
    .map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`)
    .join("\n");
}
