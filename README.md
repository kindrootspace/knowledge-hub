# Knowledge Hub

A daily general-knowledge app: eleven learning tracks, thirty-nine thinker profiles,
sixteen big questions, a news brief, and live feeds. Plain HTML, CSS and JavaScript —
no framework, no build step, no dependencies.

**Live site:** `https://<your-username>.github.io/knowledge-hub/`

---

## Deploy in about three minutes

1. On GitHub, create a new **empty** repository called `knowledge-hub`. Public — GitHub
   Pages is free on public repos. Don't add a README or .gitignore.
2. From this folder:

   ```bash
   git init -b main
   git add .
   git commit -m "Knowledge Hub"
   git remote add origin https://github.com/<your-username>/knowledge-hub.git
   git push -u origin main
   ```

   No terminal? On the empty repo page click **uploading an existing file**, drag
   everything in this folder in, and commit. Hidden folders (`.github`) don't survive
   drag-and-drop, so add `.github/workflows/refresh-headlines.yml` afterwards via
   **Add file → Create new file**.
3. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
   Save. First deploy takes a minute or two.
4. **Settings → Actions → General → Workflow permissions**: set **Read and write
   permissions**. The headlines job needs this to commit.
5. Open the site. On your phone, Share → **Add to Home Screen**. On desktop Chrome, the
   install icon in the address bar. It then opens full-screen, with its own icon, and
   works offline.

---

## What updates itself

| What | How | Needs |
|---|---|---|
| Headlines panel | `.github/workflows/refresh-headlines.yml` — hourly, fetches six public RSS feeds server-side and commits `data/headlines.json` | nothing |
| On this day, FX rates, HN front page | fetched in the browser each time you open the app | a connection |
| Today's module, daily concepts, thinker and question of the day | worked out from the date in the browser | nothing — works offline |
| The analysed news brief | a Claude session writes `data/brief.json`, or turn on the optional workflow below | see below |
| New modules and tracks | a Claude session edits `data/tracks/*.json` or `data/extra-tracks.json` | — |

### Fully hands-off brief (optional)
`.github/workflows/refresh-brief.yml.example` runs Claude with web search each morning and
commits a fresh `data/brief.json`. Add an `ANTHROPIC_API_KEY` repository secret and rename
the file to switch it on. It validates the response and refuses to write a malformed brief,
so a bad run leaves yesterday's in place.

---

## Layout

```
index.html                  app shell — markup only, no content
assets/app.js               all behaviour: routing, rotation, filters, live fetches
assets/style.css
data/index.json             hub start date, track order, manual progress overrides
data/tracks/*.json          one file per subject — this is where the teaching lives
data/extra-tracks.json      mini-tracks added later; appear everywhere automatically
data/thinkers.json          curated profiles
data/questions.json         big questions
data/brief.json             the analysed news brief
data/headlines.json         written hourly by the Action
scripts/                    the two jobs above
sw.js                       offline caching
manifest.webmanifest        makes it installable
```

## Editing content

Everything is JSON — no rebuild, no compile. Edit a file, commit, and the site serves it on
the next load. Adding modules or whole tracks needs no code change.

**A module** (in `data/tracks/<subject>.json`, inside `modules`):

```json
{
  "id": "pol-9",
  "title": "Level 2: Federalism and Multi-Level Government",
  "oneLine": "One sentence on what this gives the reader.",
  "minutes": 10,
  "body": [{ "h": "Section heading", "p": ["Paragraph.", "Paragraph."] }],
  "concepts": [{ "term": "Subsidiarity", "def": "One-sentence definition." }],
  "thinkers": [{ "name": "Name (dates)", "note": "What they contributed." }],
  "debate": { "title": "A real open question?",
              "sides": [{ "label": "For", "text": "..." }, { "label": "Against", "text": "..." }] },
  "reading": [{ "title": "Work", "who": "Author — why." }],
  "quiz": [{ "q": "Question?", "a": "An answer that teaches." }]
}
```

Only `<em>` and `<strong>` are allowed in `body` paragraphs; everything else is plain text.

**A whole new track** — push an object with `id`, `name`, `tagline`, `accent` (an unused hex
colour), `blurb` and `modules` into the array in `data/extra-tracks.json`. It joins the
sidebar, the daily rotation, the glossary, the thinker index and the sources page on its own.

Module ids must stay unique across the whole hub; the daily rotation and all cross-links use them.

## The daily rotation

`data/index.json` sets `hubStart`. The app counts whole days from it and steps through an
interleaved order — politics 1, philosophy 1, economics 1 … then politics 2 — so every
subject advances together. Everything earlier in that order counts as covered, which is what
fills the sidebar counters. Put ids in `progress` to mark modules done out of sequence.

Change `hubStart` to restart the cycle.

## Offline

The service worker caches the shell on first visit and serves data network-first with the
cache as fallback. After one visit the whole library works on a plane. Bump `CACHE` in
`sw.js` when you change `index.html`, `app.js` or `style.css`.

## Editorial standards

Kept deliberately, and worth keeping if you extend it:

- Fact and analysis stay separate — summary, then "why it matters".
- Every story carries a source and a working link.
- Anything unverifiable is left out rather than softened.
- Debates get the strongest version of each side, and no preferred answer.
- Every thinker profile ends with a real objection.
- Health & Medicine is general education, not medical advice.
- Quotations must be genuinely attested. Where none survive, the entry says so.
