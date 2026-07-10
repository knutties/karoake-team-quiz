/* ================================================================
   Karaoke Team Quiz — all state lives in the browser (localStorage).
   ================================================================ */

const STORAGE_KEY = "ktq_state_v1";

/* Emoji rating scale offered after every performance. */
const EMOJIS = [
  { icon: "😴", label: "Snooze" },
  { icon: "🙂", label: "Okay" },
  { icon: "👏", label: "Good" },
  { icon: "🔥", label: "On fire" },
  { icon: "⭐", label: "Star" },
  { icon: "🏆", label: "Legend" },
];

/* ---------- State ---------- */
const DEFAULT_TURN_SECONDS = 90;

const blankState = () => ({
  setup: {
    types: [],
    families: [],
    people: [],       // { name, type, family }
    categories: [],
    numTeams: 2,
    numRounds: 3,
    turnSeconds: DEFAULT_TURN_SECONDS, // per-turn countdown length; 0 = no timer
  },
  started: false,
  ended: false,
  teams: [],          // { name, members:[{name,type,family}], used:[categoryName] }
  grid: [],           // grid[round][team] = { category, rating } | null
  turnRound: 0,
  turnTeam: 0,
  // Per-turn countdown. endsAt is an epoch ms deadline while running; when
  // paused/idle the time left lives in remainingMs.
  timer: { running: false, endsAt: null, remainingMs: DEFAULT_TURN_SECONDS * 1000 },
});

let state = loadState();

/* Merge saved data over a blank state and backfill any fields added in
   later versions (e.g. families) so older saved data keeps working. */
function normalize(saved) {
  const base = blankState();
  const st = { ...base, ...(saved || {}) };
  st.setup = { ...base.setup, ...(saved && saved.setup) };
  st.setup.types = st.setup.types || [];
  st.setup.families = st.setup.families || [];
  st.setup.categories = st.setup.categories || [];
  st.setup.people = (st.setup.people || []).map((p) => ({
    name: p.name,
    type: p.type,
    family: p.family || "",
  }));
  if (!Number.isFinite(st.setup.turnSeconds)) st.setup.turnSeconds = DEFAULT_TURN_SECONDS;
  if (!st.timer || typeof st.timer !== "object") {
    st.timer = { running: false, endsAt: null, remainingMs: st.setup.turnSeconds * 1000 };
  }
  return st;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn("Could not load saved state:", e);
  }
  return blankState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

/* ---------- Small helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Populate a <select> from a list of values, or show a disabled prompt. */
function fillSelect(sel, values, emptyPrompt) {
  sel.innerHTML = "";
  if (!values.length) {
    const opt = el("option", null, emptyPrompt);
    opt.value = "";
    sel.append(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    values.forEach((v) => {
      const opt = el("option", null, v);
      opt.value = v;
      sel.append(opt);
    });
  }
}

/* ================================================================
   SETUP VIEW
   ================================================================ */

/* Index of the person currently being edited in the add/edit row, or null
   when the row is in "add a new person" mode. UI-only, not persisted. */
let editingPersonIndex = null;

function renderSetup() {
  const s = state.setup;

  // Types
  const typeList = $("#type-list");
  typeList.innerHTML = "";
  if (!s.types.length) typeList.append(el("li", "empty-note", "No types yet."));
  s.types.forEach((t, i) => {
    const li = el("li", "chip");
    li.append(el("span", null, t));
    const rm = el("button", null, "×");
    rm.title = "Remove";
    rm.onclick = () => removeType(i);
    li.append(rm);
    typeList.append(li);
  });

  // Families
  const familyList = $("#family-list");
  familyList.innerHTML = "";
  if (!s.families.length) familyList.append(el("li", "empty-note", "No families yet."));
  s.families.forEach((f, i) => {
    const li = el("li", "chip");
    li.append(el("span", null, f));
    const rm = el("button", null, "×");
    rm.title = "Remove";
    rm.onclick = () => removeFamily(i);
    li.append(rm);
    familyList.append(li);
  });

  // Person type / family dropdowns
  fillSelect($("#person-type"), s.types, "Add a type first");
  fillSelect($("#person-family"), s.families, "Add a family first");

  // People
  const personList = $("#person-list");
  personList.innerHTML = "";
  if (!s.people.length) personList.append(el("li", "empty-note", "No people yet."));
  s.people.forEach((p, i) => {
    const li = el("li");
    if (i === editingPersonIndex) li.classList.add("editing");
    const left = el("span");
    left.append(el("span", "p-name", p.name));
    left.append(el("span", "type-tag", p.type));
    if (p.family) left.append(el("span", "family-tag", p.family));
    li.append(left);

    const controls = el("span", "row-controls");
    const edit = el("button", "row-edit", "✎");
    edit.title = "Edit";
    edit.onclick = () => startEditPerson(i);
    const rm = el("button", null, "×");
    rm.title = "Remove";
    rm.onclick = () => removePerson(i);
    controls.append(edit, rm);
    li.append(controls);
    personList.append(li);
  });

  // Reflect add-vs-edit mode in the person row.
  syncPersonRow();

  // Categories
  const catList = $("#category-list");
  catList.innerHTML = "";
  if (!s.categories.length) catList.append(el("li", "empty-note", "No categories yet."));
  s.categories.forEach((c, i) => {
    const li = el("li", "chip");
    li.append(el("span", null, c));
    const rm = el("button", null, "×");
    rm.title = "Remove";
    rm.onclick = () => removeCategory(i);
    li.append(rm);
    catList.append(li);
  });

  // Numbers
  $("#num-teams").value = s.numTeams;
  $("#num-rounds").value = s.numRounds;
  const secs = s.turnSeconds || 0;
  $("#timer-min").value = Math.floor(secs / 60);
  $("#timer-sec").value = secs % 60;
}

function addType() {
  const input = $("#type-input");
  const v = input.value.trim();
  if (!v) return;
  if (!state.setup.types.includes(v)) state.setup.types.push(v);
  input.value = "";
  saveState();
  renderSetup();
}

function removeType(i) {
  const removed = state.setup.types.splice(i, 1)[0];
  // People that used this type lose their type reference.
  state.setup.people = state.setup.people.filter((p) => p.type !== removed);
  editingPersonIndex = null;
  saveState();
  renderSetup();
}

function addFamily() {
  const input = $("#family-input");
  const v = input.value.trim();
  if (!v) return;
  if (!state.setup.families.includes(v)) state.setup.families.push(v);
  input.value = "";
  saveState();
  renderSetup();
}

function removeFamily(i) {
  const removed = state.setup.families.splice(i, 1)[0];
  // People in this family lose their family reference.
  state.setup.people.forEach((p) => {
    if (p.family === removed) p.family = "";
  });
  editingPersonIndex = null;
  saveState();
  renderSetup();
}

/* Add a new person, or save changes when editing an existing one. */
function submitPerson() {
  const nameInput = $("#person-input");
  const type = $("#person-type").value;
  const family = $("#person-family").value;
  const name = nameInput.value.trim();
  if (!name || !type || !family) return;

  if (editingPersonIndex != null && state.setup.people[editingPersonIndex]) {
    state.setup.people[editingPersonIndex] = { name, type, family };
    editingPersonIndex = null;
  } else {
    state.setup.people.push({ name, type, family });
  }
  nameInput.value = "";
  saveState();
  renderSetup();
}

/* Load a person's details into the add/edit row for editing. */
function startEditPerson(i) {
  editingPersonIndex = i;
  renderSetup();
  $("#person-input").focus();
}

function cancelEditPerson() {
  editingPersonIndex = null;
  $("#person-input").value = "";
  renderSetup();
}

/* Prefill the row and toggle Add/Save + Cancel based on edit mode. */
function syncPersonRow() {
  const submitBtn = $("#person-submit-btn");
  const cancelBtn = $("#person-cancel-btn");
  const editing =
    editingPersonIndex != null && state.setup.people[editingPersonIndex];

  if (editing) {
    const p = state.setup.people[editingPersonIndex];
    $("#person-input").value = p.name;
    if (state.setup.types.includes(p.type)) $("#person-type").value = p.type;
    if (state.setup.families.includes(p.family)) $("#person-family").value = p.family;
    submitBtn.textContent = "Save";
    cancelBtn.hidden = false;
  } else {
    submitBtn.textContent = "Add";
    cancelBtn.hidden = true;
  }
}

function removePerson(i) {
  state.setup.people.splice(i, 1);
  // Editing state is index-based, so cancel it to avoid pointing at the wrong row.
  editingPersonIndex = null;
  saveState();
  renderSetup();
}

function addCategory() {
  const input = $("#category-input");
  const v = input.value.trim();
  if (!v) return;
  if (!state.setup.categories.includes(v)) state.setup.categories.push(v);
  input.value = "";
  saveState();
  renderSetup();
}

function removeCategory(i) {
  state.setup.categories.splice(i, 1);
  saveState();
  renderSetup();
}

/* ---------- Team allocation ---------- */

/* Number of "extra" same-family team-mates: for every team, each family
   present more than once contributes (count - 1). Lower is better; 0 means
   no two team-mates share a family. */
function familyCollisionScore(teams) {
  let extra = 0;
  teams.forEach((t) => {
    const byFamily = {};
    t.members.forEach((m) => {
      if (m.family) byFamily[m.family] = (byFamily[m.family] || 0) + 1;
    });
    Object.values(byFamily).forEach((c) => {
      if (c > 1) extra += c - 1;
    });
  });
  return extra;
}

/* Build one allocation greedily so that:
     1. each type is spread as evenly as possible across teams (hard goal —
        a person always lands on a team currently holding the fewest of
        their type), and
     2. members of the same family are kept apart as much as possible
        (soft goal — among the teams tied on the type goal, pick the one
        with the fewest members of that person's family).
   Ties beyond that are broken by smallest team, then at random, and the
   people are shuffled first so repeated runs give different teams. */
function allocateOnce(people, numTeams) {
  const teams = Array.from({ length: numTeams }, (_, i) => ({
    name: `Team ${i + 1}`,
    members: [],
    used: [],
    typeCounts: {},
    familyCounts: {},
  }));

  const count = (map, key) => map[key] || 0;

  shuffle(people).forEach((p) => {
    // 1. Teams holding the fewest of this person's type.
    const minType = Math.min(...teams.map((t) => count(t.typeCounts, p.type)));
    let cands = teams.filter((t) => count(t.typeCounts, p.type) === minType);

    // 2. Among those, the fewest of this person's family.
    if (p.family) {
      const minFam = Math.min(...cands.map((t) => count(t.familyCounts, p.family)));
      cands = cands.filter((t) => count(t.familyCounts, p.family) === minFam);
    }

    // 3. Among those, the smallest team; then random.
    const minSize = Math.min(...cands.map((t) => t.members.length));
    cands = cands.filter((t) => t.members.length === minSize);
    const chosen = cands[Math.floor(Math.random() * cands.length)];

    chosen.members.push(p);
    chosen.typeCounts[p.type] = count(chosen.typeCounts, p.type) + 1;
    if (p.family) chosen.familyCounts[p.family] = count(chosen.familyCounts, p.family) + 1;
  });

  // Drop the bookkeeping fields before returning.
  return teams.map((t) => ({ name: t.name, members: t.members, used: t.used }));
}

/* Every candidate keeps types balanced, so try a handful and keep the one
   that best separates families (stop early on a perfect split). */
function allocateTeams(people, numTeams) {
  const ATTEMPTS = 40;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < ATTEMPTS; i++) {
    const teams = allocateOnce(people, numTeams);
    const score = familyCollisionScore(teams);
    if (score < bestScore) {
      best = teams;
      bestScore = score;
      if (score === 0) break;
    }
  }
  return best;
}

function startQuiz() {
  const s = state.setup;
  const errEl = $("#setup-error");
  const numTeams = parseInt($("#num-teams").value, 10);
  const numRounds = parseInt($("#num-rounds").value, 10);

  const problems = [];
  if (!s.types.length) problems.push("add at least one type of person");
  if (!s.families.length) problems.push("add at least one family");
  if (!s.people.length) problems.push("add at least one person");
  if (s.people.length && s.people.some((p) => !p.family))
    problems.push("assign a family to every person");
  if (!s.categories.length) problems.push("add at least one category");
  if (!(numTeams >= 1)) problems.push("choose a valid number of teams");
  if (!(numRounds >= 1)) problems.push("choose a valid number of rounds");
  if (s.people.length && numTeams > s.people.length)
    problems.push("you have more teams than people");

  if (problems.length) {
    errEl.textContent = "Please " + problems.join(", ") + ".";
    errEl.hidden = false;
    return;
  }
  errEl.hidden = true;

  s.numTeams = numTeams;
  s.numRounds = numRounds;
  s.turnSeconds = readTurnSeconds();

  state.teams = allocateTeams(s.people, numTeams);
  state.grid = Array.from({ length: numRounds }, () =>
    Array.from({ length: numTeams }, () => null)
  );
  state.turnRound = 0;
  state.turnTeam = 0;
  state.started = true;
  state.ended = false;
  resetTurnTimer();

  saveState();
  showView("quiz");
  renderQuiz();
}

/* Read the minutes/seconds inputs into a total seconds value (0 = no timer). */
function readTurnSeconds() {
  const m = Math.max(0, Math.min(59, parseInt($("#timer-min").value, 10) || 0));
  const sec = Math.max(0, Math.min(59, parseInt($("#timer-sec").value, 10) || 0));
  return m * 60 + sec;
}

/* ================================================================
   QUIZ VIEW
   ================================================================ */

function isCurrentCell(round, team) {
  return !state.ended && round === state.turnRound && team === state.turnTeam;
}

function renderQuiz() {
  if (!state.started) {
    showView("setup");
    return;
  }

  // Teams summary
  const summary = $("#teams-summary");
  summary.innerHTML = "";
  state.teams.forEach((team) => {
    const pill = el("div", "team-pill");
    pill.append(el("h4", null, team.name));
    const members = el("div", "members");
    team.members.forEach((m, idx) => {
      if (idx) members.append(document.createTextNode(", "));
      members.append(document.createTextNode(m.name + " "));
      const meta = m.family ? `(${m.type} · ${m.family})` : `(${m.type})`;
      members.append(el("span", "member-type", meta));
    });
    if (!team.members.length) members.textContent = "No members";
    pill.append(members);
    summary.append(pill);
  });

  // Turn banner
  const banner = $("#turn-banner");
  if (state.ended) {
    banner.textContent = "Quiz ended 🎉";
  } else {
    const team = state.teams[state.turnTeam];
    banner.textContent = `🎙️ ${team.name}'s turn — Round ${state.turnRound + 1}`;
  }

  // Ended banner
  const existingEnded = $(".ended-banner");
  if (existingEnded) existingEnded.remove();
  if (state.ended) {
    const eb = el("div", "ended-banner", "The quiz has ended. Review the scores below or start a new quiz from Setup.");
    summary.parentNode.insertBefore(eb, summary);
  }

  // Grid
  const table = $("#quiz-grid");
  table.innerHTML = "";

  // Header row
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", "round-head", ""));
  state.teams.forEach((team) => headRow.append(el("th", null, team.name)));
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (let r = 0; r < state.setup.numRounds; r++) {
    const row = el("tr");
    row.append(el("th", "round-head", `Round ${r + 1}`));
    for (let t = 0; t < state.setup.numTeams; t++) {
      row.append(buildCell(r, t));
    }
    tbody.append(row);
  }
  table.append(tbody);

  renderTimer();
}

function buildCell(round, team) {
  const td = el("td");
  const cell = el("div", "cell");
  const entry = state.grid[round][team];
  const current = isCurrentCell(round, team);

  if (current) cell.classList.add("active");

  if (entry && entry.rating) {
    // Completed turn
    cell.classList.add("done");
    cell.append(el("div", "cat", entry.category));
    cell.append(el("div", "rating", entry.rating));
  } else if (entry && entry.category) {
    // Category picked, awaiting rating
    cell.append(el("div", "cat", "🎵 " + entry.category));
    const rateBtn = el("button", "rate-btn", "Rate performance");
    rateBtn.onclick = () => openRating(round, team);
    cell.append(rateBtn);
  } else if (current) {
    // Current empty cell — offer category pick
    const pickBtn = el("button", "pick-btn", "🎲 Pick category");
    pickBtn.onclick = () => pickCategory(round, team);
    cell.append(pickBtn);
  } else {
    cell.append(el("div", "waiting", "—"));
  }

  td.append(cell);
  return td;
}

/* Prefer categories this team has not used yet. */
function pickCategory(round, team) {
  if (!isCurrentCell(round, team)) return;
  const cats = state.setup.categories;
  const used = state.teams[team].used;
  const unused = cats.filter((c) => !used.includes(c));
  const pool = unused.length ? unused : cats;
  const choice = pool[Math.floor(Math.random() * pool.length)];

  state.grid[round][team] = { category: choice, rating: null };
  state.teams[team].used.push(choice);
  startTurnTimer();
  saveState();
  renderQuiz();
}

/* ---------- Rating modal ---------- */
let pendingRating = null;

function openRating(round, team) {
  pendingRating = { round, team };
  const entry = state.grid[round][team];
  $("#rating-title").textContent = `Rate ${state.teams[team].name}`;
  $("#rating-sub").textContent = `Round ${round + 1} · ${entry.category}`;

  const choices = $("#emoji-choices");
  choices.innerHTML = "";
  EMOJIS.forEach((e) => {
    const btn = el("button", "emoji-btn");
    btn.append(el("span", null, e.icon));
    btn.append(el("span", "label", e.label));
    btn.onclick = () => applyRating(e.icon);
    choices.append(btn);
  });

  $("#rating-modal").hidden = false;
}

function applyRating(icon) {
  if (!pendingRating) return;
  const { round, team } = pendingRating;
  state.grid[round][team].rating = icon;
  pendingRating = null;
  $("#rating-modal").hidden = true;

  advanceTurn();
  resetTurnTimer();
  saveState();
  renderQuiz();
}

/* Move to the next team in the round, then the next round. */
function advanceTurn() {
  let t = state.turnTeam + 1;
  let r = state.turnRound;
  if (t >= state.setup.numTeams) {
    t = 0;
    r += 1;
  }
  if (r >= state.setup.numRounds) {
    state.ended = true; // all cells done
  } else {
    state.turnTeam = t;
    state.turnRound = r;
  }
}

function endQuiz() {
  if (!confirm("End the quiz now? You can still review the grid afterwards.")) return;
  state.ended = true;
  state.timer.running = false;
  saveState();
  renderQuiz();
}

/* Start a fresh quiz reusing the current setup (people, categories, team
   and round counts). Teams are reshuffled and all scores cleared. */
function restartQuiz() {
  if (!confirm("Restart the quiz with the same people and settings? Teams will be reshuffled and all scores cleared.")) return;
  const s = state.setup;
  state.teams = allocateTeams(s.people, s.numTeams);
  state.grid = Array.from({ length: s.numRounds }, () =>
    Array.from({ length: s.numTeams }, () => null)
  );
  state.turnRound = 0;
  state.turnTeam = 0;
  state.ended = false;
  state.started = true;
  resetTurnTimer();
  saveState();
  renderQuiz();
}

/* ================================================================
   TURN TIMER
   ================================================================ */

let timerBeeped = false;

/* Milliseconds left right now, whether the clock is running or paused. */
function currentRemainingMs() {
  const t = state.timer;
  if (t.running && t.endsAt) return Math.max(0, t.endsAt - Date.now());
  return Math.max(0, t.remainingMs || 0);
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* Begin a fresh countdown for the turn that just started. */
function startTurnTimer() {
  const total = (state.setup.turnSeconds || 0) * 1000;
  timerBeeped = false;
  state.timer = total > 0
    ? { running: true, endsAt: Date.now() + total, remainingMs: total }
    : { running: false, endsAt: null, remainingMs: 0 };
}

/* Reset the clock to a stopped, full-length state for the next turn. */
function resetTurnTimer() {
  timerBeeped = false;
  state.timer = {
    running: false,
    endsAt: null,
    remainingMs: (state.setup.turnSeconds || 0) * 1000,
  };
}

function toggleTimer() {
  const t = state.timer;
  if (t.running) {
    t.remainingMs = currentRemainingMs();
    t.running = false;
    t.endsAt = null;
  } else {
    let ms = t.remainingMs;
    if (!ms || ms <= 0) {
      ms = (state.setup.turnSeconds || 0) * 1000;
      timerBeeped = false;
    }
    if (ms <= 0) return; // no timer configured
    t.remainingMs = ms;
    t.endsAt = Date.now() + ms;
    t.running = true;
  }
  saveState();
  renderTimer();
}

function resetTimer() {
  resetTurnTimer();
  saveState();
  renderTimer();
}

/* A short two-tone chime when the clock hits zero (best-effort; ignored if
   the browser blocks audio). */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = now + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  } catch (e) {
    /* audio not available — the visual "Time's up!" still shows */
  }
}

/* Called ~4x/second to refresh the clock and fire the zero transition. */
function tickTimer() {
  const t = state.timer;
  if (t.running && t.endsAt && Date.now() >= t.endsAt) {
    t.running = false;
    t.endsAt = null;
    t.remainingMs = 0;
    saveState();
    if (!timerBeeped) {
      timerBeeped = true;
      beep();
    }
  }
  renderTimer();
}

/* Paint the timer widget from the current state. */
function renderTimer() {
  const widget = $("#timer-widget");
  if (!widget) return;
  const active = state.started && !state.ended && (state.setup.turnSeconds || 0) > 0;
  widget.hidden = !active;
  if (!active) return;

  const ms = currentRemainingMs();
  const display = $("#timer-display");
  display.textContent = formatTime(ms);
  const isUp = ms <= 0;
  display.classList.toggle("time-up", isUp);
  display.classList.toggle("time-warn", !isUp && ms <= 10000);

  const toggle = $("#timer-toggle");
  const full = (state.setup.turnSeconds || 0) * 1000;
  if (state.timer.running) toggle.textContent = "Pause";
  else if (ms > 0 && ms < full) toggle.textContent = "Resume";
  else toggle.textContent = "Start";
}

/* ================================================================
   NAV / VIEW SWITCHING
   ================================================================ */

function showView(name) {
  $("#view-setup").hidden = name !== "setup";
  $("#view-quiz").hidden = name !== "quiz";
  $("#nav-setup").classList.toggle("active", name === "setup");
  $("#nav-quiz").classList.toggle("active", name === "quiz");
  if (name === "setup") renderSetup();
  if (name === "quiz") renderQuiz();
}

/* Wipe everything this app has stored in the browser and start from scratch. */
function clearLocalData() {
  if (!confirm("Clear all saved data (types, families, people, categories and any running quiz) from this browser? This cannot be undone.")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear saved data:", e);
  }
  state = blankState();
  showView("setup");
}

/* ================================================================
   WIRING
   ================================================================ */

function init() {
  // Add buttons
  document.querySelectorAll(".add-btn").forEach((btn) => {
    btn.onclick = () => {
      const kind = btn.dataset.add;
      if (kind === "type") addType();
      else if (kind === "family") addFamily();
      else if (kind === "person") submitPerson();
      else if (kind === "category") addCategory();
    };
  });

  // Enter-to-add on text inputs
  const enterMap = {
    "type-input": addType,
    "family-input": addFamily,
    "person-input": submitPerson,
    "category-input": addCategory,
  };
  Object.entries(enterMap).forEach(([id, fn]) => {
    $("#" + id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); fn(); }
    });
  });

  // Number inputs persist
  $("#num-teams").addEventListener("change", (e) => {
    state.setup.numTeams = parseInt(e.target.value, 10) || 1;
    saveState();
  });
  $("#num-rounds").addEventListener("change", (e) => {
    state.setup.numRounds = parseInt(e.target.value, 10) || 1;
    saveState();
  });
  const persistTurnSeconds = () => {
    state.setup.turnSeconds = readTurnSeconds();
    saveState();
  };
  $("#timer-min").addEventListener("change", persistTurnSeconds);
  $("#timer-sec").addEventListener("change", persistTurnSeconds);

  $("#start-btn").onclick = startQuiz;
  $("#reset-btn").onclick = clearLocalData;
  $("#person-cancel-btn").onclick = cancelEditPerson;
  $("#restart-btn").onclick = restartQuiz;
  $("#end-btn").onclick = endQuiz;
  $("#timer-toggle").onclick = toggleTimer;
  $("#timer-reset").onclick = resetTimer;

  // Drive the countdown clock.
  setInterval(tickTimer, 250);
  $("#back-setup-btn").onclick = () => showView("setup");
  $("#nav-setup").onclick = () => showView("setup");
  $("#nav-quiz").onclick = () => {
    if (state.started) showView("quiz");
    else showView("setup");
  };

  // Close modal on backdrop click
  $("#rating-modal").addEventListener("click", (e) => {
    if (e.target.id === "rating-modal") {
      pendingRating = null;
      $("#rating-modal").hidden = true;
    }
  });

  // Initial view
  showView(state.started ? "quiz" : "setup");
}

document.addEventListener("DOMContentLoaded", init);
