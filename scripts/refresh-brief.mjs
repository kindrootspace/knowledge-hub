/* Optional companion to .github/workflows/refresh-brief.yml.
   Asks Claude, with web search, to research the day and emit a brief.json
   matching the shape the site expects. Validates before writing, so a bad
   response leaves yesterday's brief in place rather than breaking the site. */
import { writeFileSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.log("No ANTHROPIC_API_KEY — skipping."); process.exit(0); }

const today = new Date().toLocaleDateString("en-GB",
  { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"Europe/London" });

const PROMPT = `Today is ${today}. Research the most important news of the last 24-48 hours
across five beats: UK domestic, US, world/geopolitics, economics and markets, and
science/technology. Use web search. Fetch real sources; never invent a story, a figure or a
quotation, and omit anything you cannot verify.

Reply with ONE JSON object and nothing else — no prose, no code fences:

{
 "date": "${today}",
 "updated": "${today}",
 "lede": "one paragraph, 3-4 sentences, on what today adds up to; connective, not a list",
 "threeThings": ["...", "...", "..."],
 "indicators": [{"label":"BoE Bank Rate","value":"3.75%","note":"held 30 Jul"}],
 "items": [{
   "headline": "short factual headline",
   "cat": "uk|us|world|econ|sci",
   "summary": "3-5 sentences of verified fact with names, numbers and dates",
   "why": "2-3 sentences of structural analysis for an informed generalist, not a restatement",
   "source": "outlet name",
   "url": "https://..."
 }],
 "watch": [{"when":"13 August","what":"..."}],
 "sources": [{"name":"Reuters World","url":"https://www.reuters.com/world/"}]
}

18-24 items. British English, no hype, no emoji. Keep fact and analysis separate.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  },
  body: JSON.stringify({
    model: "claude-opus-4-5",
    max_tokens: 16000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
    messages: [{ role: "user", content: PROMPT }]
  })
});

if (!res.ok) { console.error("API error", res.status, (await res.text()).slice(0, 500)); process.exit(1); }

const data = await res.json();
const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
const match = text.match(/\{[\s\S]*\}/);
if (!match) { console.error("No JSON found in the reply."); process.exit(1); }

let brief;
try { brief = JSON.parse(match[0]); }
catch (e) { console.error("Reply was not valid JSON:", e.message); process.exit(1); }

const ok = brief && typeof brief.lede === "string"
  && Array.isArray(brief.items) && brief.items.length >= 8
  && brief.items.every(i => i.headline && i.summary && i.why && i.url
       && ["uk","us","world","econ","sci"].includes(i.cat));
if (!ok) { console.error("Brief failed validation — keeping the existing one."); process.exit(1); }

for (const k of ["threeThings","indicators","watch","sources"]) if (!Array.isArray(brief[k])) brief[k] = [];

writeFileSync("data/brief.json", JSON.stringify(brief, null, 1));
console.log(`Wrote ${brief.items.length} stories.`);
