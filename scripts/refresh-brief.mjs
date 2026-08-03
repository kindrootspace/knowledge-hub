/* Writes data/brief.json. Runs on a GitHub runner, so it needs no browser and
   no Cowork session — only an ANTHROPIC_API_KEY repository secret.
   Validates hard before writing: a bad response leaves yesterday's brief alone. */
import { writeFileSync, readFileSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.log("No ANTHROPIC_API_KEY — skipping."); process.exit(0); }

const today = new Date().toLocaleDateString("en-GB",
  { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"Europe/London" });

let previous = null;
try { previous = JSON.parse(readFileSync("data/brief.json", "utf8")); } catch {}
const carry = previous && previous.indicators
  ? "\n\nYesterday's indicator values, to carry forward where nothing has moved:\n" +
    JSON.stringify(previous.indicators)
  : "";

const PROMPT = `Today is ${today}. Research the most important news of the last 24-48 hours and
return it as a single JSON object. Use web search properly — open actual articles, do not work
from search-result snippets.

Five beats, in this order of effort:
1. UK domestic — politics, the economy, public services. This beat matters most; the reader is
   in London. Search specifically and separately for: UK politics, the Prime Minister, the
   Treasury and Bank of England, the NHS, and any by-election or vote this week. Use BBC News,
   the Guardian, Sky News, the FT, the Times, Politico Europe, the Independent, plus gov.uk,
   ONS and Bank of England releases. Do not fill this beat with departmental press notices if
   real reporting exists; date-check everything and prefer the last 48 hours.
2. US — politics, courts, policy.
3. World and geopolitics.
4. Economics and markets — central banks, inflation and jobs data, major moves, trade.
5. Science and technology — research findings, health, climate, space, AI.

NEVER invent a story, a quotation or a figure. Omit anything you cannot verify against a real
source you actually opened. A shorter honest brief beats a padded one.${carry}

Reply with ONE JSON object and nothing else — no prose, no markdown fences:

{
 "date": "${today}",
 "updated": "${today}",
 "lede": "one paragraph, 3-4 sentences, on what today adds up to; connective, not a list",
 "threeThings": ["...", "...", "..."],
 "indicators": [{"label":"BoE Bank Rate","value":"3.75%","note":"held 30 Jul"}],
 "items": [{
   "headline": "short factual headline",
   "cat": "uk",
   "summary": "3-5 sentences of verified fact with names, numbers and dates",
   "why": "2-3 sentences of structural analysis for an informed generalist, never a restatement",
   "source": "outlet name",
   "url": "https://..."
 }],
 "watch": [{"when":"13 August","what":"..."}],
 "sources": [{"name":"Reuters World","url":"https://www.reuters.com/world/"}]
}

18-24 items, of which at least 6 must be UK. "cat" is one of uk, us, world, econ, sci.
British English, no hype, no emoji, fact and analysis kept strictly separate.`;

async function ask(){
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 20000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 40 }],
      messages: [{ role: "user", content: PROMPT }]
    })
  });
  if (!res.ok) throw new Error("API " + res.status + " " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in reply");
  return JSON.parse(m[0]);
}

function validate(b){
  const cats = ["uk","us","world","econ","sci"];
  if (!b || typeof b.lede !== "string" || b.lede.length < 60) return "lede missing or too short";
  if (!Array.isArray(b.items) || b.items.length < 12) return "fewer than 12 items";
  for (const i of b.items) {
    if (!i.headline || !i.summary || !i.why || !i.url) return "an item is missing fields";
    if (!cats.includes(i.cat)) return "bad cat: " + i.cat;
    if (!/^https?:\/\//.test(i.url)) return "bad url: " + i.url;
    if (i.summary.length < 80) return "a summary is too thin";
  }
  if (b.items.filter(i => i.cat === "uk").length < 3) return "fewer than 3 UK items";
  if (!Array.isArray(b.threeThings) || b.threeThings.length !== 3) return "threeThings must be 3";
  return null;
}

let brief = null, err = null;
for (let attempt = 1; attempt <= 2 && !brief; attempt++) {
  try {
    const b = await ask();
    const bad = validate(b);
    if (bad) { err = bad; console.log(`Attempt ${attempt} failed validation: ${bad}`); continue; }
    brief = b;
  } catch (e) { err = e.message; console.log(`Attempt ${attempt} errored: ${e.message}`); }
}

if (!brief) { console.error("Giving up; keeping the existing brief. Last problem: " + err); process.exit(1); }

for (const k of ["indicators","watch","sources"]) if (!Array.isArray(brief[k])) brief[k] = [];
if (!brief.indicators.length && previous) brief.indicators = previous.indicators || [];
if (!brief.sources.length && previous) brief.sources = previous.sources || [];

writeFileSync("data/brief.json", JSON.stringify(brief, null, 1));
const n = brief.items.length, uk = brief.items.filter(i => i.cat === "uk").length;
console.log(`Wrote ${n} stories (${uk} UK).`);
