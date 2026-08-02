/* Fetches a handful of public RSS feeds and writes data/headlines.json.
   No dependencies, no API keys. Runs on Node 20+ (built-in fetch).
   Any feed that fails is skipped rather than failing the run. */
import { writeFileSync, readFileSync } from "node:fs";

const FEEDS = [
  { name: "BBC News",        url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "BBC Business",    url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "Guardian World",  url: "https://www.theguardian.com/world/rss" },
  { name: "NPR",             url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "Al Jazeera",      url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Nature",          url: "https://www.nature.com/nature.rss" }
];

const strip = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

const tag = (block, name) => {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">"));
  return m ? strip(m[1]) : "";
};

async function pull(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "knowledge-hub-headlines/1.0 (+github actions)" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    const blocks = xml.split(/<item[\s>]/).slice(1, 12);
    const items = blocks.map(b => ({
      title: tag(b, "title"),
      link:  tag(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "",
      date:  tag(b, "pubDate")
    })).filter(i => i.title && i.link).slice(0, 8);
    if (!items.length) throw new Error("no items parsed");
    console.log(`ok   ${feed.name}: ${items.length}`);
    return { name: feed.name, items };
  } catch (err) {
    console.log(`skip ${feed.name}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sources = (await Promise.all(FEEDS.map(pull))).filter(Boolean);

if (!sources.length) {
  console.log("Every feed failed — leaving the existing file alone.");
  process.exit(0);
}

const out = {
  updated: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
  sources
};

// don't churn a commit when only the timestamp moved
try {
  const prev = JSON.parse(readFileSync("data/headlines.json", "utf8"));
  const same = JSON.stringify(prev.sources) === JSON.stringify(out.sources);
  if (same) { console.log("Headlines unchanged."); process.exit(0); }
} catch {}

writeFileSync("data/headlines.json", JSON.stringify(out, null, 1));
console.log(`Wrote ${sources.length} sources.`);
