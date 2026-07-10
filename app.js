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
const blankState = () => ({
  setup: {
    types: [],
    people: [],       // { name, type }
    categories: [],
    numTeams: 2,
    numRounds: 3,
  },
  started: false,
  ended: false,
  teams: [],          // { name, members:[{name,type}], used:[categoryName] }
  grid: [],           // grid[round][team] = { category, rating } | null
  turnRound: 0,
  turnTeam: 0,
});

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...blankState(), ...JSON.parse(raw) };
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

/* ================================================================
   SETUP VIEW
   ================================================================ */

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

  // Person type dropdown
  const sel = $("#person-type");
  sel.innerHTML = "";
  if (!s.types.length) {
    const opt = el("option", null, "Add a type first");
    opt.value = "";
    sel.append(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    s.types.forEach((t) => {
      const opt = el("option", null, t);
      opt.value = t;
      sel.append(opt);
    });
  }

  // People
  const personList = $("#person-list");
  personList.innerHTML = "";
  if (!s.people.length) personList.append(el("li", "empty-note", "No people yet."));
  s.people.forEach((p, i) => {
    const li = el("li");
    const left = el("span");
    left.append(el("span", "p-name", p.name));
    left.append(el("span", "type-tag", p.type));
    li.append(left);
    const rm = el("button", null, "×");
    rm.title = "Remove";
    rm.onclick = () => removePerson(i);
    li.append(rm);
    personList.append(li);
  });

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
  saveState();
  renderSetup();
}

function addPerson() {
  const nameInput = $("#person-input");
  const type = $("#person-type").value;
  const name = nameInput.value.trim();
  if (!name || !type) return;
  state.setup.people.push({ name, type });
  nameInput.value = "";
  saveState();
  renderSetup();
}

function removePerson(i) {
  state.setup.people.splice(i, 1);
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
/* Group people by type, then hand them out round-robin across teams,
   carrying the cursor across types so both per-type and overall counts
   stay as even as possible. */
function allocateTeams(people, numTeams) {
  const teams = Array.from({ length: numTeams }, (_, i) => ({
    name: `Team ${i + 1}`,
    members: [],
    used: [],
  }));

  const byType = {};
  people.forEach((p) => {
    (byType[p.type] = byType[p.type] || []).push(p);
  });

  let cursor = 0;
  Object.keys(byType).forEach((type) => {
    shuffle(byType[type]).forEach((p) => {
      teams[cursor % numTeams].members.push(p);
      cursor++;
    });
  });

  return teams;
}

function startQuiz() {
  const s = state.setup;
  const errEl = $("#setup-error");
  const numTeams = parseInt($("#num-teams").value, 10);
  const numRounds = parseInt($("#num-rounds").value, 10);

  const problems = [];
  if (!s.types.length) problems.push("add at least one type of person");
  if (!s.people.length) problems.push("add at least one person");
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

  state.teams = allocateTeams(s.people, numTeams);
  state.grid = Array.from({ length: numRounds }, () =>
    Array.from({ length: numTeams }, () => null)
  );
  state.turnRound = 0;
  state.turnTeam = 0;
  state.started = true;
  state.ended = false;

  saveState();
  showView("quiz");
  renderQuiz();
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
      const t = el("span", "member-type", `(${m.type})`);
      members.append(t);
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
  saveState();
  renderQuiz();
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

function resetAll() {
  if (!confirm("Clear all people, categories and any running quiz? This cannot be undone.")) return;
  state = blankState();
  saveState();
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
      else if (kind === "person") addPerson();
      else if (kind === "category") addCategory();
    };
  });

  // Enter-to-add on text inputs
  const enterMap = {
    "type-input": addType,
    "person-input": addPerson,
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

  $("#start-btn").onclick = startQuiz;
  $("#reset-btn").onclick = resetAll;
  $("#end-btn").onclick = endQuiz;
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
