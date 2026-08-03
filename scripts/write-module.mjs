/* Adds one new module to the hub each week. Runs on a GitHub runner with only an
   ANTHROPIC_API_KEY secret — no browser, no Cowork session.

   Picks the track with the fewest modules so the eleven subjects stay level, asks
   for one module in the hub's exact shape, validates it hard, and appends it.
   Anything short of a clean pass leaves the repo untouched. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.log("No ANTHROPIC_API_KEY — skipping."); process.exit(0); }

const dir = "data/tracks";
const files = readdirSync(dir).filter(f => f.endsWith(".json"));
const tracks = files.map(f => ({file: dir + "/" + f, t: JSON.parse(readFileSync(dir + "/" + f, "utf8"))}));

/* fewest modules first, then alphabetical, so it is deterministic and stays balanced */
tracks.sort((a, b) => a.t.modules.length - b.t.modules.length || a.t.name.localeCompare(b.t.name));
const target = tracks[0];
const T = target.t;

const prefix = T.modules[0].id.split("-")[0];
const nextNum = Math.max(...T.modules.map(m => parseInt(m.id.split("-")[1], 10))) + 1;
const newId = prefix + "-" + nextNum;
const existingTitles = tracks.flatMap(x => x.t.modules.map(m => m.title));
const allIds = new Set(tracks.flatMap(x => x.t.modules.map(m => m.id)));

const PROMPT = `You are adding one module to an existing learning hub, to the track "${T.name}"
(${T.tagline}). It currently has ${T.modules.length} modules:

${T.modules.map((m, i) => (i + 1) + ". " + m.title + " — " + m.oneLine).join("\n")}

Write module ${nextNum}: a level 2 module that assumes the reader has done the ones above and
goes further — more technical, more contested, into the parts the introductory treatment had to
skip. Title it "Level 2: ..." only if that reads naturally; otherwise a plain title is better.
Do not duplicate any of these titles from elsewhere in the hub:
${existingTitles.join(" | ")}

Audience: informed generalist. They follow the news and know the basics. Give mechanisms,
evidence, named studies, live scholarly disagreement, and correct the specific misconceptions an
intelligent non-specialist actually holds. British English. Concrete specifics — names, dates,
numbers. No hype, no emoji. Every position stated in its strongest form, including ones you
think are weak. Use web search to verify every factual claim, figure and quotation; leave out
anything you cannot verify.

Reply with ONE JSON object and nothing else — no prose, no markdown fences:

{
 "id": "${newId}",
 "title": "...",
 "oneLine": "one sentence on what this module gives the reader",
 "minutes": 10,
 "body": [
   {"h": "Section heading", "p": ["Paragraph.", "Paragraph."]},
   {"h": "Section heading", "p": ["Paragraph.", "Paragraph."]},
   {"h": "Section heading", "p": ["Paragraph.", "Paragraph."]}
 ],
 "concepts": [{"term": "...", "def": "one-sentence definition"}],
 "thinkers": [{"name": "Name (dates)", "note": "what they contributed, with a sharp detail"}],
 "debate": {"title": "A genuinely open question?", "sides": [
   {"label": "Short label", "text": "2-3 sentences making the strongest case"},
   {"label": "Short label", "text": "2-3 sentences making the strongest opposing case"}
 ]},
 "reading": [{"title": "Work", "who": "Author — one clause on why"}],
 "quiz": [{"q": "Question?", "a": "An answer of 2-3 sentences that teaches something"}]
}

Exactly 3 body sections of 2 paragraphs each, 450-600 words of body in total.
5-7 concepts. Exactly 4 thinkers. Exactly 3 readings. Exactly 2 quiz items.
In body paragraphs you may use <em> and <strong> and nothing else. Everywhere else, plain text.`;

async function ask(){
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 12000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
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

function validate(m){
  if (!m || typeof m !== "object") return "not an object";
  if (m.id !== newId) return "wrong id: " + m.id;
  if (allIds.has(m.id)) return "id already exists";
  if (!m.title || !m.oneLine) return "missing title or oneLine";
  if (typeof m.minutes !== "number") return "minutes must be a number";
  if (!Array.isArray(m.body) || m.body.length !== 3) return "body must have 3 sections";
  for (const s of m.body) {
    if (!s.h || !Array.isArray(s.p) || s.p.length < 2) return "a section is malformed";
    for (const p of s.p) if (/<(?!\/?(em|strong)\b)[a-z]/i.test(p)) return "disallowed HTML in body";
  }
  const words = m.body.flatMap(s => s.p).join(" ").split(/\s+/).length;
  if (words < 380 || words > 780) return "body length " + words + " words is out of range";
  if (!Array.isArray(m.concepts) || m.concepts.length < 5 || m.concepts.length > 7) return "need 5-7 concepts";
  if (m.concepts.some(c => !c.term || !c.def)) return "a concept is malformed";
  if (!Array.isArray(m.thinkers) || m.thinkers.length !== 4) return "need exactly 4 thinkers";
  if (m.thinkers.some(t => !t.name || !t.note)) return "a thinker is malformed";
  if (!m.debate || !m.debate.title || !Array.isArray(m.debate.sides) || m.debate.sides.length !== 2) return "debate malformed";
  if (m.debate.sides.some(s => !s.label || !s.text)) return "a debate side is malformed";
  if (!Array.isArray(m.reading) || m.reading.length !== 3) return "need exactly 3 readings";
  if (!Array.isArray(m.quiz) || m.quiz.length !== 2) return "need exactly 2 quiz items";
  if (m.quiz.some(q => !q.q || !q.a || q.a.length < 60)) return "a quiz answer is too thin";
  if (existingTitles.some(t => t.toLowerCase() === String(m.title).toLowerCase())) return "duplicate title";
  return null;
}

let mod = null, err = null;
for (let attempt = 1; attempt <= 2 && !mod; attempt++) {
  try {
    const m = await ask();
    const bad = validate(m);
    if (bad) { err = bad; console.log(`Attempt ${attempt} failed validation: ${bad}`); continue; }
    mod = m;
  } catch (e) { err = e.message; console.log(`Attempt ${attempt} errored: ${e.message}`); }
}

if (!mod) { console.error("Giving up; repo untouched. Last problem: " + err); process.exit(1); }

const before = T.modules.length;
T.modules.push(mod);
if (T.modules.length !== before + 1) { console.error("Sanity check failed"); process.exit(1); }

writeFileSync(target.file, JSON.stringify(T, null, 1));
console.log(`Added ${mod.id} "${mod.title}" to ${T.name} (${before} -> ${T.modules.length}).`);
