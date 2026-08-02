/* ============ app ============ */
let TRACKS, DONE, GREAT_THINKERS, BIG_QUESTIONS, BRIEF, PROGRESS, HEADLINES;
let ROTATION, DAY, HUB_START;
let state = {view:"today", track:null, mod:null, person:null, filter:"all",
             era:"all", field:"all", pq:"", thTab:"curated", qTheme:"all"};
const CATS = {uk:"UK", us:"US", world:"World", econ:"Economics", sci:"Science"};
const CATCOL = {uk:"#e0a458", us:"#f472b6", world:"#38bdf8", econ:"#4ade80", sci:"#a78bfa"};
let pick;

async function loadData(){
  const j = async p => (await fetch(p + "?v=" + Date.now())).json();
  const idx = await j("data/index.json");
  const core = await Promise.all(idx.tracks.map(t => j("data/tracks/" + t + ".json")));
  const [extra, th, bq, br] = await Promise.all([
    j("data/extra-tracks.json"), j("data/thinkers.json"),
    j("data/questions.json"), j("data/brief.json")
  ]);
  try { HEADLINES = await j("data/headlines.json"); } catch(e) { HEADLINES = null; }
  TRACKS = core.concat(extra);
  GREAT_THINKERS = th; BIG_QUESTIONS = bq; BRIEF = br;
  PROGRESS = idx.progress || [];
  HUB_START = idx.hubStart;

  ROTATION = (function(){
    const out = [], depth = Math.max(...TRACKS.map(t => t.modules.length));
    for (let i = 0; i < depth; i++) TRACKS.forEach(t => { if (t.modules[i]) out.push(t.modules[i].id); });
    return out;
  })();
  DAY = (function(){
    const now = new Date(), start = new Date(HUB_START + "T00:00:00");
    const d0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const s0 = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.max(0, Math.round((d0 - s0) / 86400000));
  })();
  pick = (arr, offset) => arr[(DAY + (offset || 0)) % arr.length];
  DONE = new Set([...PROGRESS, ...ROTATION.slice(0, DAY % (ROTATION.length + 1))]);
  TRACKS.forEach(t => t.modules.forEach(m => { MODMAP[m.id] = {t: t, m: m}; }));
}

/* ============ app ============ */
/* ---------- daily rotation ----------
   Interleaves the eleven tracks so every day moves one step through a different
   subject: pol-1, phi-1, eco-1 … soc-1, pol-2, phi-2 … Everything below is derived
   from today's date, so the hub advances on its own between refreshes. */

/* auto-advance: everything earlier in the rotation counts as covered */


const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/&(?![a-z#]+;)/g,"&amp;").replace(/</g,"&lt;");
const trackById = id => TRACKS.find(t => t.id === id);
const doneCount = t => t.modules.filter(m => DONE.has(m.id)).length;

/* module lookup across all tracks */
const MODMAP = {};

const accentOf = id => (MODMAP[id] ? MODMAP[id].t.accent : "#94a3b8");

/* ---------- nav ---------- */
function buildNav(){
  $("#trackNav").innerHTML = TRACKS.map(t =>
    `<button class="navitem" data-go="track" data-track="${t.id}" style="--ac:${t.accent}">
      <span class="dot"></span>${esc(t.name)}<span class="navmeta" id="nm-${t.id}">${doneCount(t)}/${t.modules.length}</span>
    </button>`).join("");
  $("#newsCount").textContent = BRIEF.items.length;
  $("#dayNo").textContent = "Day " + (DAY + 1);
  $("#thCount").textContent = GREAT_THINKERS.people.length;
  $("#bqCount").textContent = BIG_QUESTIONS.questions.length;
  $("#brandDate").textContent = new Date().toLocaleDateString("en-GB", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  document.querySelectorAll(".navitem").forEach(b => {
    b.onclick = () => {
      const go = b.dataset.go;
      if (go === "track") go_track(b.dataset.track);
      else { state = {...state, view: go, mod: null, track: null, person: null}; render(); window.scrollTo(0,0); }
    };
  });
}
function markNav(){
  document.querySelectorAll(".navitem").forEach(b => {
    const isTrack = b.dataset.go === "track";
    const active = isTrack
      ? ((state.view === "track" || state.view === "lesson") && state.track === b.dataset.track)
      : (b.dataset.go === state.view || (b.dataset.go === "thinkers" && state.view === "person"));
    b.classList.toggle("on", active);
  });
  TRACKS.forEach(t => { const el = $("#nm-" + t.id); if (el) el.textContent = doneCount(t) + "/" + t.modules.length; });
}
function go(view){ state = {...state, view: view, mod: null, person: null}; render(); window.scrollTo(0,0); }
function go_track(id){ state = {...state, view:"track", track:id, mod:null, person:null}; render(); window.scrollTo(0,0); }
function go_mod(tid, mid){ state = {...state, view:"lesson", track:tid, mod:mid, person:null}; render(); window.scrollTo(0,0); }
function go_person(pid){ state = {...state, view:"person", person:pid}; render(); window.scrollTo(0,0); }

/* ---------- live data ----------
   The page pulls from a few public, key-free, CORS-open APIs. This works when the
   file is opened in a normal browser tab. Inside a sandboxed artifact panel the
   request may be blocked, so every panel degrades to a plain explanation rather
   than an error. Nothing here is required for the hub to work. */
const LIVE = {
  otd: {
    title: "On this day",
    tie: "History",
    note: "Selected events for today's date, from Wikimedia.",
    url: function(){
      const d = new Date();
      return "https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/" +
             String(d.getMonth()+1).padStart(2,"0") + "/" + String(d.getDate()).padStart(2,"0");
    },
    render: function(j){
      const rows = (j.selected || []).slice(0,5);
      if (!rows.length) return null;
      return rows.map(function(e){
        const p = (e.pages && e.pages[0] && e.pages[0].content_urls) ? e.pages[0].content_urls.desktop.page : null;
        return '<li><b>' + esc(e.year) + '</b><span>' + esc(e.text) +
               (p ? ' <a href="' + p + '" target="_blank" rel="noopener">read &nearr;</a>' : '') + '</span></li>';
      }).join("");
    }
  },
  fx: {
    title: "Sterling, right now",
    tie: "Economics",
    note: "Live reference rates from the Frankfurter API, sourced from the ECB.",
    url: function(){ return "https://api.frankfurter.dev/v1/latest?base=GBP&symbols=USD,EUR,JPY,CHF"; },
    render: function(j){
      if (!j.rates) return null;
      return Object.keys(j.rates).map(function(k){
        return '<li><b>' + k + '</b><span>' + j.rates[k].toFixed(k === "JPY" ? 2 : 4) +
               ' per &pound;1</span></li>';
      }).join("") + '<li><b>as of</b><span>' + esc(j.date) + '</span></li>';
    }
  },
  hn: {
    title: "What the technical world is reading",
    tie: "Technology",
    note: "Hacker News front page — a decent early signal on technology and science.",
    url: function(){ return "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=6"; },
    render: function(j){
      if (!j.hits || !j.hits.length) return null;
      return j.hits.slice(0,6).map(function(h){
        const u = h.url || ("https://news.ycombinator.com/item?id=" + h.objectID);
        return '<li><b>' + (h.points || 0) + '</b><span><a href="' + u +
               '" target="_blank" rel="noopener">' + esc(h.title) + '</a></span></li>';
      }).join("");
    }
  }
};

function liveFetch(url, ms){
  const ctrl = new AbortController();
  const t = setTimeout(function(){ ctrl.abort(); }, ms || 7000);
  return fetch(url, {signal: ctrl.signal, headers: {"Accept":"application/json"}})
    .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(j){ clearTimeout(t); return j; })
    .catch(function(e){ clearTimeout(t); throw e; });
}

function loadLive(){
  Object.keys(LIVE).forEach(function(key){
    const box = document.getElementById("live-" + key);
    if (!box) return;
    const spec = LIVE[key];
    liveFetch(spec.url()).then(function(j){
      const html = spec.render(j);
      if (!html) throw new Error("empty");
      box.innerHTML = '<ul class="livelist">' + html + '</ul>' +
        '<p class="livestat ok">Live &middot; fetched just now</p>';
    }).catch(function(){
      box.innerHTML = '<p class="livefail">Could not reach this source. Live panels need a normal browser tab and a connection &mdash; if you are viewing this inside the app\'s preview panel, its sandbox may block outside requests. Everything else in the hub works offline.</p>';
    });
  });
}

/* Wikipedia lookup for any concept term */
function wikiLookup(term, box){
  box.innerHTML = '<p class="livestat">Looking up ' + esc(term) + '&hellip;</p>';
  liveFetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(term.replace(/ /g,"_")))
    .then(function(j){
      if (!j.extract) throw new Error("none");
      const link = j.content_urls ? j.content_urls.desktop.page : "https://en.wikipedia.org/wiki/" + encodeURIComponent(term);
      box.innerHTML = '<p class="wikitxt">' + esc(j.extract) + '</p>' +
        '<p class="livestat ok">Wikipedia &middot; <a href="' + link + '" target="_blank" rel="noopener">full article &nearr;</a></p>';
    })
    .catch(function(){
      box.innerHTML = '<p class="livefail">No Wikipedia summary reachable for &ldquo;' + esc(term) +
        '&rdquo;. Either the term has no article under that exact name, or this view is blocking outside requests. ' +
        '<a href="https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(term) +
        '" target="_blank" rel="noopener">Search Wikipedia &nearr;</a></p>';
    });
}

function headlineSection(){
  if (!HEADLINES || !HEADLINES.sources || !HEADLINES.sources.length) return "";
  return '<h3 class="sec">Headlines, refreshed hourly</h3>' +
    '<p class="sub" style="font-size:14.5px">Pulled straight from the wires by a scheduled job in this site\'s own repository \u2014 no analysis, just what is moving. Last run ' + esc(HEADLINES.updated) + '.</p>' +
    '<div class="livegrid">' + HEADLINES.sources.map(function(s){
      return '<div class="livecard" style="--ac:#f472b6"><span class="tk">' + esc(s.name) + '</span>' +
        '<ul class="livelist" style="margin-top:8px">' + s.items.slice(0,5).map(function(i){
          return '<li><b>&bull;</b><span><a href="' + i.link + '" target="_blank" rel="noopener">' + esc(i.title) + '</a></span></li>';
        }).join("") + '</ul></div>';
    }).join("") + '</div>';
}
function liveSection(){
  return headlineSection() + '<h3 class="sec">Live from the internet</h3>' +
    '<p class="sub" style="font-size:14.5px">Pulled fresh each time you open this page, from public sources. If a panel says it cannot connect, the rest of the hub is unaffected.</p>' +
    '<div class="livegrid">' +
      Object.keys(LIVE).map(function(k){
        const s = LIVE[k];
        const t = TRACKS.find(function(x){ return x.name.indexOf(s.tie) === 0; });
        const ac = t ? t.accent : "#94a3b8";
        return '<div class="livecard" style="--ac:' + ac + '">' +
          '<span class="tk">' + esc(s.tie) + '</span>' +
          '<h4>' + esc(s.title) + '</h4>' +
          '<p class="nt">' + esc(s.note) + '</p>' +
          '<div id="live-' + k + '"><p class="livestat">Loading&hellip;</p></div>' +
        '</div>';
      }).join("") +
    '</div>';
}

/* ---------- today ---------- */
function viewToday(){
  const todayId = ROTATION[DAY % ROTATION.length];
  const tm = MODMAP[todayId];
  const cycle = Math.floor(DAY / ROTATION.length);
  const covered = Math.min(DAY, ROTATION.length);
  const person = pick(GREAT_THINKERS.people);
  const q = pick(BIG_QUESTIONS.questions);
  const pAc = (TRACKS.find(t => t.name === person.fields[0]) || {accent:"#e8e0c8"}).accent;
  const dstr = new Date().toLocaleDateString("en-GB", {weekday:"long", day:"numeric", month:"long", year:"numeric"});

  /* one concept from every track, rotating daily — a bit of each subject each day */
  const hits = TRACKS.map((t, ti) => {
    const pool = [];
    t.modules.forEach(m => m.concepts.forEach(c => pool.push({c: c, m: m})));
    const h = pool[(DAY * 7 + ti * 3) % pool.length];
    return {t: t, c: h.c, m: h.m};
  });

  return `
  <div class="dayhead">
    <span class="daynum">Day ${DAY + 1}</span>
    <span class="streak">${esc(dstr)} &middot; ${covered} of ${ROTATION.length} modules covered${cycle > 0 ? " &middot; round " + (cycle + 1) : ""}</span>
  </div>
  <p class="sub">A bit of every subject, every day, plus one module in full. Nothing to decide — it advances on its own.</p>

  <div class="lesson-card" style="--ac:${tm.t.accent}">
    <p class="lbl">Today's module &middot; ${esc(tm.t.name)}</p>
    <h3>${esc(tm.m.title)}</h3>
    <p>${esc(tm.m.oneLine)}</p>
    <button class="go" data-goto="${tm.t.id}|${tm.m.id}">Read it now</button>
    <span class="meta">${tm.m.minutes} min &middot; module ${tm.t.modules.findIndex(x => x.id === tm.m.id) + 1} of ${tm.t.modules.length}</span>
  </div>

  <h3 class="sec">One idea from every subject</h3>
  <p class="sub" style="font-size:14.5px">Eleven concepts, one per track, different every day. Click any of them to open the module it comes from.</p>
  <div class="hits">
    ${hits.map(h => `<button class="hit" data-goto="${h.t.id}|${h.m.id}" style="--ac:${h.t.accent}">
      <span class="tk">${esc(h.t.name)}</span>
      <span class="tm">${esc(h.c.term)}</span>
      <p class="df">${esc(h.c.def)}</p>
    </button>`).join("")}
  </div>

  <h3 class="sec">Also today</h3>
  <div class="spot">
    <button data-person="${person.id}" style="border-left:2px solid ${pAc}">
      <span class="lbl">Thinker of the day</span>
      <h4 style="color:${pAc}">${esc(person.name)}</h4>
      <span class="sm">${esc(person.dates)} &middot; ${esc(person.fields.join(", "))}</span>
      <p>${esc(person.oneLine)}</p>
    </button>
    <button data-jump="questions" style="border-left:2px solid #94e2d5">
      <span class="lbl">Question of the day</span>
      <h4 style="color:#94e2d5">${esc(q.question)}</h4>
      <p>${esc(q.hook)}</p>
    </button>
  </div>

  ${liveSection()}

  <h3 class="sec">And in the news</h3>
  <p class="lede" style="font-size:17px">${BRIEF.lede}</p>
  <ol class="three">${BRIEF.threeThings.map(t => `<li>${t}</li>`).join("")}</ol>
  <p style="margin-top:16px"><button class="pill" data-jump="news" style="cursor:pointer">Read the full brief &rarr;</button></p>

  <div class="note">Today's selections are worked out from the date, so the hub moves on by itself overnight — and the news brief is rebuilt each morning at 7am. If you fall behind or want to jump around, every module is still there under the tracks in the sidebar.</div>`;
}

/* ---------- home ---------- */
function viewHome(){
  const total = TRACKS.reduce((a,t) => a + t.modules.length, 0);
  const done = TRACKS.reduce((a,t) => a + doneCount(t), 0);
  const mins = TRACKS.reduce((a,t) => a + t.modules.reduce((b,m) => b + m.minutes, 0), 0);
  return `
  <div class="hero">
    <p class="eyebrow">${esc(BRIEF.date)}</p>
    <h2>What's going on, and what's worth understanding</h2>
    <p>${BRIEF.lede}</p>
  </div>

  <h3 class="sec">Three things to know today</h3>
  <ol class="three">${BRIEF.threeThings.map(t => `<li>${t}</li>`).join("")}</ol>
  <p style="margin-top:16px"><button class="pill" data-jump="news" style="cursor:pointer">Read the full brief &rarr;</button></p>

  <h3 class="sec">Learning tracks</h3>
  <p class="sub">${total} modules across eleven subjects, at informed-generalist level — roughly ${Math.round(mins/60)} hours of reading. Two a week finishes the hub in a year; one a day finishes it in three months.</p>
  <div class="grid4" style="margin-top:16px">
    ${TRACKS.map(t => {
      const d = doneCount(t), n = t.modules.length;
      return `<button class="tcard" data-track="${t.id}" style="--ac:${t.accent}">
        <h4>${esc(t.name)}</h4>
        <p>${esc(t.tagline)}</p>
        <div class="bar"><i style="width:${Math.round(d/n*100)}%"></i></div>
        <div class="tmeta"><span>${d} of ${n} modules</span><span>${t.modules.reduce((a,m)=>a+m.minutes,0)} min</span></div>
      </button>`;
    }).join("")}
  </div>

  <h3 class="sec">Explore sideways</h3>
  <div class="grid4" style="margin-top:14px">
    <button class="tcard" data-jump="thinkers" style="--ac:#e8e0c8">
      <h4>Great thinkers</h4>
      <p>${GREAT_THINKERS.people.length} figures from Confucius to Wangari Maathai — what they argued, and the best objection to it.</p>
    </button>
    <button class="tcard" data-jump="questions" style="--ac:#94e2d5">
      <h4>Big questions</h4>
      <p>${BIG_QUESTIONS.questions.length} questions that cut across every track, with the competing positions and what each one costs.</p>
    </button>
    <button class="tcard" data-jump="glossary" style="--ac:#94a3b8">
      <h4>Glossary</h4>
      <p>Every key concept in the hub, searchable, linked back to the module it comes from.</p>
    </button>
  </div>

  <h3 class="sec">This hub is not finished</h3>
  <p class="sub">It started at 88 modules and is meant to outgrow that. Two things add to it. Ask Claude for anything — a harder version of a module you've done, or a mini-track on a topic that has caught you — and it gets written in this format and added permanently. Separately, a weekly task adds one new module of its own: either a level 2 for a subject you've worked through, or an explainer for something the week's news actually demanded. New tracks appear in the sidebar and join the daily rotation automatically.</p>
  <div class="asks" style="margin-top:14px">
    ${["Add a mini-track to my Knowledge Hub on a topic I'll name.",
       "What has been added to my Knowledge Hub recently?",
       "Write a level 2 tier for the track I've made most progress on."
      ].map(a => `<button class="ask" data-copy="1">${esc(a)}</button>`).join("")}
  </div>

  <h3 class="sec">Where things stand</h3>
  <div class="ind">${BRIEF.indicators.map(i =>
    `<div><div class="k">${esc(i.label)}</div><div class="v">${esc(i.value)}</div><div class="n">${esc(i.note)}</div></div>`).join("")}</div>

  <h3 class="sec">Coming up</h3>
  <ul class="watch">${BRIEF.watch.map(w => `<li><b>${esc(w.when)}</b><span>${esc(w.what)}</span></li>`).join("")}</ul>

  <div class="note"><b>Progress: ${done} of ${total} modules.</b> Ticks you make here last for this browsing session. To save them permanently, tell Claude which modules you've finished and they'll be baked into the next daily rebuild of this dashboard.</div>`;
}

/* ---------- news ---------- */
function viewNews(){
  const f = state.filter;
  const items = f === "all" ? BRIEF.items : BRIEF.items.filter(i => i.cat === f);
  const cats = ["all", ...Object.keys(CATS)];
  return `
  <p class="eyebrow">Daily brief &middot; updated ${esc(BRIEF.updated)}</p>
  <h2 class="title">${esc(BRIEF.date)}</h2>
  <p class="lede">${BRIEF.lede}</p>

  <h3 class="sec">Three things to know</h3>
  <ol class="three">${BRIEF.threeThings.map(t => `<li>${t}</li>`).join("")}</ol>

  <h3 class="sec">Numbers</h3>
  <div class="ind">${BRIEF.indicators.map(i =>
    `<div><div class="k">${esc(i.label)}</div><div class="v">${esc(i.value)}</div><div class="n">${esc(i.note)}</div></div>`).join("")}</div>

  <h3 class="sec">The stories</h3>
  <div class="filters">${cats.map(c => {
    const n = c === "all" ? BRIEF.items.length : BRIEF.items.filter(i => i.cat === c).length;
    return `<button data-filter="${c}" class="${f===c?"on":""}">${c==="all"?"All":CATS[c]} <span style="opacity:.6">${n}</span></button>`;
  }).join("")}</div>
  ${items.map(i => `
    <article class="story">
      <span class="pill" style="border-color:${CATCOL[i.cat]}55;color:${CATCOL[i.cat]}">${CATS[i.cat]}</span>
      <h4 style="margin-top:9px">${esc(i.headline)}</h4>
      <p class="body">${i.summary}</p>
      <div class="why"><b>Why it matters</b>${i.why}</div>
      <div class="srcrow">Source: <a href="${i.url}" target="_blank" rel="noopener">${esc(i.source)}</a></div>
    </article>`).join("")}

  <h3 class="sec">Diary</h3>
  <ul class="watch">${BRIEF.watch.map(w => `<li><b>${esc(w.when)}</b><span>${esc(w.what)}</span></li>`).join("")}</ul>

  <div class="note">Every story above was checked against the linked primary or reputable secondary source at the time of writing. Where a claim could not be verified it was left out rather than softened.</div>`;
}

/* ---------- track & lesson ---------- */
function viewTrack(){
  const t = trackById(state.track);
  const d = doneCount(t), n = t.modules.length;
  return `
  <p class="eyebrow" style="color:${t.accent}">Learning track</p>
  <h2 class="title">${esc(t.name)}</h2>
  <p class="sub">${t.blurb}</p>
  <div style="max-width:420px;margin-top:20px">
    <div class="bar"><i style="width:${Math.round(d/n*100)}%;background:${t.accent}"></i></div>
    <div class="tmeta"><span>${d} of ${n} complete</span><span>${t.modules.reduce((a,m)=>a+m.minutes,0)} min total</span></div>
  </div>
  <div class="modlist">
    ${t.modules.map((m,ix) => `
      <button class="mod" data-mod="${m.id}" style="--ac:${t.accent}">
        <span class="num">${String(ix+1).padStart(2,"0")}</span>
        <span style="min-width:0">
          <span class="t">${esc(m.title)}</span>
          <p class="o">${esc(m.oneLine)}</p>
        </span>
        <span class="r">
          <span class="mins">${m.minutes} min</span>
          <span class="chk ${DONE.has(m.id)?"done":""}">&#10003;</span>
        </span>
      </button>`).join("")}
  </div>`;
}

function viewLesson(){
  const t = trackById(state.track);
  const ix = t.modules.findIndex(m => m.id === state.mod);
  const m = t.modules[ix];
  const prev = t.modules[ix-1], next = t.modules[ix+1];
  const cut = s => esc(s.length > 30 ? s.slice(0,30) + "…" : s);
  return `
  <button class="back" data-back="1">&larr; ${esc(t.name)}</button>
  <div class="lesson" style="--ac:${t.accent}">
    <p class="eyebrow" style="color:${t.accent}">Module ${ix+1} of ${t.modules.length} &middot; ${m.minutes} min</p>
    <h2>${esc(m.title)}</h2>
    <p class="oneline">${esc(m.oneLine)}</p>
    <div class="lb">
      ${m.body.map(s => `<h4>${esc(s.h)}</h4>${s.p.map(p => `<p>${p}</p>`).join("")}`).join("")}
    </div>

    <div class="kbox">
      <h5>Key concepts</h5>
      <dl>${m.concepts.map(c => `<dt>${esc(c.term)} <button class="wk" data-wiki="${esc(c.term)}" title="Look up on Wikipedia">look up</button></dt><dd>${esc(c.def)}</dd>`).join("")}</dl>
      <div id="wikibox" class="wikibox" hidden></div>
    </div>

    <h3 class="sec">Key thinkers</h3>
    <ul class="think">${m.thinkers.map(k => `<li><b>${esc(k.name)}</b>${esc(k.note)}</li>`).join("")}</ul>

    <h3 class="sec">The live argument</h3>
    <p class="sub" style="font-size:15px">${esc(m.debate.title)}</p>
    <div class="deb">${m.debate.sides.map(s => `<div><h6>${esc(s.label)}</h6><p>${esc(s.text)}</p></div>`).join("")}</div>

    <h3 class="sec">Check yourself</h3>
    ${m.quiz.map(q => `<details class="qa"><summary>${esc(q.q)}</summary><p>${esc(q.a)}</p></details>`).join("")}

    <h3 class="sec">Further reading</h3>
    <ul class="rd">${m.reading.map(r => `<li><b>${esc(r.title)}</b><span>${esc(r.who)}</span></li>`).join("")}</ul>

    <h3 class="sec">Take it further</h3>
    <p class="sub" style="font-size:14.5px">This page can't write new material on its own — but the hub is built to be extended. Click a line to select it, then paste it to Claude and the new modules get added here permanently.</p>
    <div class="asks">
      ${[
        `Write a level 2 module on "${m.title}" for my Knowledge Hub — more technical, and assume I have done the level 1 one.`,
        `Build a mini-track for my Knowledge Hub on this question: ${m.debate.title}`,
        `Add a module to my Knowledge Hub going deeper on ${m.concepts[0].term.toLowerCase()}${m.concepts[1] ? " and " + m.concepts[1].term.toLowerCase() : ""}.`
      ].map(a => `<button class="ask" data-copy="1">${esc(a)}</button>`).join("")}
    </div>

    <div class="navbtns">
      <button data-nav="prev" ${prev?"":"disabled"}>&larr; ${prev?cut(prev.title):"Start of track"}</button>
      <button class="mark" data-toggle="${m.id}">${DONE.has(m.id)?"&#10003; Completed":"Mark complete"}</button>
      <button data-nav="next" ${next?"":"disabled"}>${next?cut(next.title):"End of track"} &rarr;</button>
    </div>
  </div>`;
}

/* ---------- great thinkers ---------- */
function viewThinkers(){
  const G = GREAT_THINKERS;
  const q = state.pq.toLowerCase();
  const fields = [...new Set(G.people.flatMap(p => p.fields))].sort();

  if (state.thTab === "all") {
    const rows = [];
    TRACKS.forEach(t => t.modules.forEach(m => m.thinkers.forEach(k =>
      rows.push({name:k.name, note:k.note, t:t, m:m}))));
    rows.sort((a,b) => {
      const ln = s => (s.split("(")[0].trim().split(" ").slice(-1)[0] || s);
      return ln(a.name).localeCompare(ln(b.name));
    });
    const shown = rows.filter(r => !q || (r.name + " " + r.note).toLowerCase().includes(q));
    return `
    <p class="eyebrow">Explore</p>
    <h2 class="title">Great thinkers</h2>
    <p class="sub">${G.blurb}</p>
    ${thTabs()}
    <div class="tools"><input id="pq" placeholder="Filter ${rows.length} names…" value="${esc(state.pq)}"></div>
    <p class="eralab" style="margin:12px 0 0">Every thinker cited anywhere in the hub — ${rows.length} entries, sorted by surname. Click to open the module.</p>
    <div style="margin-top:8px">
      ${shown.map(r => `<div class="allrow">
        <b>${esc(r.name)}</b>
        <span>${esc(r.note)}
          <button data-goto="${r.t.id}|${r.m.id}" class="tag" style="margin-left:6px;cursor:pointer;border-color:${r.t.accent}55;color:${r.t.accent}">${esc(r.m.title)}</button>
        </span>
      </div>`).join("") || `<p class="sub">No matches.</p>`}
    </div>`;
  }

  let people = G.people;
  if (state.era !== "all") people = people.filter(p => p.era === state.era);
  if (state.field !== "all") people = people.filter(p => p.fields.includes(state.field));
  if (q) people = people.filter(p => (p.name + " " + p.oneLine + " " + p.fields.join(" ")).toLowerCase().includes(q));

  const byEra = G.eras.map(e => ({e: e, list: people.filter(p => p.era === e.id)})).filter(g => g.list.length);

  return `
  <p class="eyebrow">Explore</p>
  <h2 class="title">Great thinkers</h2>
  <p class="sub">${G.blurb}</p>
  ${thTabs()}
  <div class="tools">
    <input id="pq" placeholder="Search names and ideas…" value="${esc(state.pq)}">
    <button data-era="all" class="pill" style="cursor:pointer;${state.era==="all"?"background:var(--tx);color:#0b0d12;border-color:var(--tx)":""}">All eras</button>
    ${G.eras.map(e => `<button data-era="${e.id}" class="pill" style="cursor:pointer;${state.era===e.id?"background:var(--tx);color:#0b0d12;border-color:var(--tx)":""}">${esc(e.label)}</button>`).join("")}
  </div>
  <div class="tools" style="margin-top:2px">
    <button data-field="all" class="pill" style="cursor:pointer;${state.field==="all"?"background:var(--tx);color:#0b0d12;border-color:var(--tx)":""}">All fields</button>
    ${fields.map(f => {
      const t = TRACKS.find(x => x.name === f);
      const on = state.field === f;
      return `<button data-field="${esc(f)}" class="pill" style="cursor:pointer;${on?"background:"+(t?t.accent:"#94a3b8")+";color:#0b0d12;border-color:transparent":(t?"border-color:"+t.accent+"55;color:"+t.accent:"")}">${esc(f)}</button>`;
    }).join("")}
  </div>
  ${byEra.length ? byEra.map(g => `
    <h3 class="sec">${esc(g.e.label)} <span class="eralab" style="font-weight:400">${esc(g.e.range)}</span></h3>
    <div class="pgrid">
      ${g.list.map(p => `<button class="pcard" data-person="${p.id}">
        <span class="nm">${esc(p.name)}</span>
        <span class="dt">${esc(p.dates)}</span>
        <p class="ol">${esc(p.oneLine)}</p>
        <span class="fl">${p.fields.map(f => {
          const t = TRACKS.find(x => x.name === f);
          return `<span class="tag" style="${t?"border-color:"+t.accent+"55;color:"+t.accent:""}">${esc(f)}</span>`;
        }).join("")}</span>
      </button>`).join("")}
    </div>`).join("") : `<p class="sub" style="margin-top:24px">No one matches those filters.</p>`}`;
}

function thTabs(){
  return `<div class="subtabs">
    <button data-thtab="curated" class="${state.thTab==="curated"?"on":""}">Profiles</button>
    <button data-thtab="all" class="${state.thTab==="all"?"on":""}">Everyone cited</button>
  </div>`;
}

function viewPerson(){
  const p = GREAT_THINKERS.people.find(x => x.id === state.person);
  const era = GREAT_THINKERS.eras.find(e => e.id === p.era);
  const ac = (TRACKS.find(t => t.name === p.fields[0]) || {accent:"#e8e0c8"}).accent;
  return `
  <button class="back" data-backth="1">&larr; Great thinkers</button>
  <div class="lesson" style="--ac:${ac}">
    <p class="eyebrow" style="color:${ac}">${esc(era ? era.label : "")} &middot; ${esc(p.dates)}</p>
    <h2>${esc(p.name)}</h2>
    <p class="oneline">${esc(p.oneLine)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      ${p.fields.map(f => {
        const t = TRACKS.find(x => x.name === f);
        return `<span class="tag" style="${t?"border-color:"+t.accent+"55;color:"+t.accent:""}">${esc(f)}</span>`;
      }).join("")}
    </div>
    <div class="lb">${p.bio.split("\n\n").map(x => `<p>${x.trim()}</p>`).join("")}</div>

    ${p.quote ? `<div class="pq">&ldquo;${esc(p.quote)}&rdquo;<small>${esc(p.quoteNote)}</small></div>`
              : `<div class="note" style="margin:22px 0">${esc(p.quoteNote)}</div>`}

    <div class="kbox">
      <h5>Key ideas</h5>
      <ul style="margin:0;padding-left:18px">${p.ideas.map(i => `<li style="font-size:14.5px;color:var(--tx2);margin-bottom:7px;line-height:1.5">${esc(i)}</li>`).join("")}</ul>
    </div>

    <div class="crit"><h6>The standing objection</h6><p>${esc(p.criticism)}</p></div>

    <h3 class="sec">Where this comes up</h3>
    <div class="linkmods">${p.modules.filter(id => MODMAP[id]).map(id =>
      `<button data-goto="${MODMAP[id].t.id}|${id}" style="border-color:${accentOf(id)}55;color:${accentOf(id)}">${esc(MODMAP[id].t.name)} &middot; ${esc(MODMAP[id].m.title)}</button>`).join("")}</div>
  </div>`;
}

/* ---------- big questions ---------- */
function viewQuestions(){
  const B = BIG_QUESTIONS;
  const qs = state.qTheme === "all" ? B.questions : B.questions.filter(q => q.theme === state.qTheme);
  return `
  <p class="eyebrow">Explore</p>
  <h2 class="title">Big questions</h2>
  <p class="sub">${B.blurb}</p>
  <div class="tools">
    <button data-qtheme="all" class="pill" style="cursor:pointer;${state.qTheme==="all"?"background:var(--tx);color:#0b0d12;border-color:var(--tx)":""}">All ${B.questions.length}</button>
    ${B.themes.map(t => {
      const n = B.questions.filter(q => q.theme === t.id).length;
      return `<button data-qtheme="${t.id}" class="pill" style="cursor:pointer;${state.qTheme===t.id?"background:var(--tx);color:#0b0d12;border-color:var(--tx)":""}">${esc(t.label)} <span style="opacity:.6">${n}</span></button>`;
    }).join("")}
  </div>
  <div style="margin-top:18px">
  ${qs.map(q => {
    const th = B.themes.find(t => t.id === q.theme);
    return `<details class="qcard">
      <summary>
        <span class="pill" style="margin-bottom:8px;display:inline-block">${esc(th ? th.label : "")}</span>
        <h4>${esc(q.question)}</h4>
        <p class="hk">${esc(q.hook)}</p>
      </summary>
      <div class="qbody">
        <div class="lb" style="padding-top:14px">${q.framing.split("\n\n").map(x => `<p class="fr">${x.trim()}</p>`).join("")}</div>
        <h3 class="sec" style="margin-top:22px">The positions</h3>
        ${q.positions.map(p => `<div class="pos">
          <h6>${esc(p.label)}</h6>
          <p class="hd">${esc(p.holds)}</p>
          <p class="cs">${esc(p.case)}</p>
          <p class="ct"><b>What it costs:</b> ${esc(p.cost)}</p>
        </div>`).join("")}
        <div class="stl"><b>What is actually settled</b>${esc(q.settled)}</div>
        <div class="linkmods">${q.modules.filter(id => MODMAP[id]).map(id =>
          `<button data-goto="${MODMAP[id].t.id}|${id}" style="border-color:${accentOf(id)}55;color:${accentOf(id)}">${esc(MODMAP[id].t.name)} &middot; ${esc(MODMAP[id].m.title)}</button>`).join("")}</div>
      </div>
    </details>`;
  }).join("")}
  </div>`;
}

/* ---------- glossary & sources ---------- */
function viewGlossary(){
  const rows = [];
  TRACKS.forEach(t => t.modules.forEach(m => m.concepts.forEach(c => rows.push({...c, t: t, m: m}))));
  rows.sort((a,b) => a.term.localeCompare(b.term));
  return `
  <p class="eyebrow">Reference</p>
  <h2 class="title">Glossary</h2>
  <p class="sub">Every key concept across the eleven tracks — ${rows.length} terms. Click a term to open the module it comes from.</p>
  <div class="tools"><input id="gq" placeholder="Filter terms…" style="max-width:400px;width:100%"></div>
  <div id="glist" style="margin-top:12px">
    ${rows.map(r => `<div class="grow" data-term="${esc((r.term + " " + r.def).toLowerCase())}" style="border-top:1px solid var(--line);padding:13px 0">
      <button data-goto="${r.t.id}|${r.m.id}" style="text-align:left;width:100%">
        <span style="font-weight:600;font-size:15px">${esc(r.term)}</span>
        <span class="pill" style="margin-left:9px;border-color:${r.t.accent}55;color:${r.t.accent};font-size:9.5px">${esc(r.t.name)}</span>
        <p style="margin:4px 0 0;font-size:14px;color:var(--tx2);line-height:1.5">${esc(r.def)}</p>
      </button></div>`).join("")}
  </div>`;
}

function viewSources(){
  const books = [];
  TRACKS.forEach(t => t.modules.forEach(m => m.reading.forEach(r => books.push({...r, t: t}))));
  return `
  <p class="eyebrow">Reference</p>
  <h2 class="title">Sources &amp; further reading</h2>
  <h3 class="sec">Daily reading list</h3>
  <p class="sub">A reasonable spread of primary data, wire reporting and analysis. The primary-data sources are the ones most worth building a habit around — they are what the journalism is written from.</p>
  <div class="srcgrid" style="margin-top:14px">${BRIEF.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)} &nearr;</a>`).join("")}</div>
  ${TRACKS.map(t => `
    <h3 class="sec" style="color:${t.accent}">${esc(t.name)}</h3>
    <ul class="rd">${books.filter(b => b.t.id === t.id).map(b => `<li><b>${esc(b.title)}</b><span>${esc(b.who)}</span></li>`).join("")}</ul>`).join("")}`;
}

/* ---------- render + wiring ---------- */
function render(){
  const v = state.view;
  $("#main").innerHTML =
    v === "today" ? viewToday() :
    v === "news" ? viewNews() :
    v === "track" ? viewTrack() :
    v === "lesson" ? viewLesson() :
    v === "thinkers" ? viewThinkers() :
    v === "person" ? viewPerson() :
    v === "questions" ? viewQuestions() :
    v === "glossary" ? viewGlossary() :
    v === "sources" ? viewSources() : viewHome();
  markNav();
  wire();
}

function wire(){
  document.querySelectorAll("button.tcard[data-track]").forEach(b => b.onclick = () => go_track(b.dataset.track));
  document.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => go(b.dataset.jump));
  document.querySelectorAll("[data-mod]").forEach(b => b.onclick = () => go_mod(state.track, b.dataset.mod));
  document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { state.filter = b.dataset.filter; render(); });
  document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => go_track(state.track));
  document.querySelectorAll("[data-backth]").forEach(b => b.onclick = () => go("thinkers"));
  document.querySelectorAll("[data-person]").forEach(b => b.onclick = () => go_person(b.dataset.person));
  document.querySelectorAll("[data-era]").forEach(b => b.onclick = () => { state.era = b.dataset.era; render(); });
  document.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { state.field = b.dataset.field; render(); });
  document.querySelectorAll("[data-qtheme]").forEach(b => b.onclick = () => { state.qTheme = b.dataset.qtheme; render(); });
  document.querySelectorAll("[data-thtab]").forEach(b => b.onclick = () => { state.thTab = b.dataset.thtab; state.pq = ""; render(); });
  document.querySelectorAll("[data-goto]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const parts = b.dataset.goto.split("|");
    go_mod(parts[0], parts[1]);
  });
  document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
    const t = trackById(state.track), ix = t.modules.findIndex(m => m.id === state.mod);
    const nx = b.dataset.nav === "prev" ? t.modules[ix-1] : t.modules[ix+1];
    if (nx) go_mod(t.id, nx.id);
  });
  document.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => {
    const id = b.dataset.toggle;
    if (DONE.has(id)) DONE.delete(id); else DONE.add(id);
    render();
  });
  document.querySelectorAll("[data-wiki]").forEach(b => b.onclick = () => {
    const box = $("#wikibox");
    if (!box) return;
    box.hidden = false;
    wikiLookup(b.dataset.wiki, box);
    box.scrollIntoView({behavior:"smooth", block:"nearest"});
  });
  if (state.view === "today") loadLive();
  document.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    const r = document.createRange();
    r.selectNodeContents(b);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    b.classList.add("sel");
    setTimeout(() => b.classList.remove("sel"), 1400);
  });
  const gq = $("#gq");
  if (gq) gq.oninput = () => {
    const s = gq.value.toLowerCase();
    document.querySelectorAll(".grow").forEach(r => { r.style.display = r.dataset.term.includes(s) ? "" : "none"; });
  };
  const pq = $("#pq");
  if (pq) {
    pq.oninput = () => {
      state.pq = pq.value;
      render();
      const el = $("#pq");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }
}


loadData().then(() => { buildNav(); render(); })
  .catch(err => {
    document.getElementById("main").innerHTML =
      '<h2 class="title">Could not load the library</h2>' +
      '<p class="sub">The content files did not load. If you opened this file directly from disk, ' +
      'use the standalone version instead \u2014 browsers block local file requests. ' +
      'If this is the hosted site, it may still be deploying; try again in a minute.</p>' +
      '<p class="sub" style="color:var(--tx3);font-size:13px">' + String(err) + '</p>';
  });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}