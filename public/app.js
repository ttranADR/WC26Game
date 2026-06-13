const api = {
  async getState() {
    return request("/api/state");
  },
  async getMatchdayOdds(matchDayId) {
    return request(`/api/matchday-odds?matchDayId=${encodeURIComponent(matchDayId || "")}`);
  },
  async getWc26Update() {
    return request("/api/wc26");
  },
  async login(email, password) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  async post(path, body = {}) {
    return request(path, { method: "POST", body: JSON.stringify(body) });
  }
};

const MIN_SELECTED_CARDS = 5;
const MAX_SELECTED_CARDS = 12;
const CARD_SET_SIZE = 12;
const CARD_POINTS_CORRECT = 10;
const EXACT_SCORE_POINTS_MULTIPLIER = 5;
const DEFAULT_OTHER_SCORE_MULTIPLIER = 19.5;
const APP_TIME_ZONE = "America/Los_Angeles";
const PAIRING_MODE_LABELS = {
  MIXED: "Mixed",
  SOLO: "1v1",
  DUO: "2v2",
  HALF: "Half league"
};
const FLAG_CODE_BY_TEAM_CODE = {
  AFG: "af",
  ALB: "al",
  ALG: "dz",
  AND: "ad",
  ANG: "ao",
  ARG: "ar",
  ARM: "am",
  AUS: "au",
  AUT: "at",
  AZE: "az",
  BAH: "bs",
  BHR: "bh",
  BAN: "bd",
  BAR: "bb",
  BEL: "be",
  BEN: "bj",
  BFA: "bf",
  BIH: "ba",
  BLR: "by",
  BOL: "bo",
  BOT: "bw",
  BRA: "br",
  BUL: "bg",
  CAM: "kh",
  CAN: "ca",
  CHI: "cl",
  CHN: "cn",
  CIV: "ci",
  CMR: "cm",
  COD: "cd",
  COL: "co",
  CRC: "cr",
  CRO: "hr",
  CUB: "cu",
  CZE: "cz",
  DEN: "dk",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  ETH: "et",
  FIN: "fi",
  FRA: "fr",
  GAB: "ga",
  GAM: "gm",
  GEO: "ge",
  GER: "de",
  GHA: "gh",
  GRE: "gr",
  GUA: "gt",
  GUI: "gn",
  HAI: "ht",
  HON: "hn",
  HUN: "hu",
  IDN: "id",
  IND: "in",
  IRL: "ie",
  IRN: "ir",
  IRQ: "iq",
  ISL: "is",
  ISR: "il",
  ITA: "it",
  JAM: "jm",
  JOR: "jo",
  JPN: "jp",
  KOR: "kr",
  KSA: "sa",
  KUW: "kw",
  MAR: "ma",
  MEX: "mx",
  MLI: "ml",
  MNE: "me",
  NGA: "ng",
  NED: "nl",
  NIR: "gb-nir",
  NOR: "no",
  NZL: "nz",
  OMA: "om",
  PAN: "pa",
  PAR: "py",
  PER: "pe",
  POL: "pl",
  POR: "pt",
  QAT: "qa",
  ROU: "ro",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SRB: "rs",
  SUI: "ch",
  SVK: "sk",
  SVN: "si",
  SWE: "se",
  THA: "th",
  TUN: "tn",
  TUR: "tr",
  UAE: "ae",
  UGA: "ug",
  UKR: "ua",
  URU: "uy",
  USA: "us",
  UZB: "uz",
  VEN: "ve",
  VIE: "vn",
  WAL: "gb-wls",
  ZAF: "za",
  ZAM: "zm"
};
const FLAG_CODE_BY_TEAM_NAME = {
  "costa rica": "cr",
  czechia: "cz",
  england: "gb-eng",
  germany: "de",
  "ivory coast": "ci",
  japan: "jp",
  mexico: "mx",
  morocco: "ma",
  netherlands: "nl",
  scotland: "gb-sct",
  "south africa": "za",
  "south korea": "kr",
  spain: "es",
  "united states": "us",
  usa: "us",
  wales: "gb-wls"
};
const ADMIN_ROUTES = new Set(["admin", "submitCheck", "playerData", "leagueData"]);

async function request(path, options = {}) {
  const headers = { "content-type": "application/json" };
  if (state.userId) headers["x-user-id"] = state.userId;
  const response = await fetch(path, {
    headers,
    ...options
  });
  const responsePath = path.split("?")[0];
  const data = responsePath.endsWith(".csv") ? await response.text() : await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

const state = {
  data: null,
  route: "player",
  theme: localStorage.getItem("pitchpick-full-theme") || "dark",
  userId: localStorage.getItem("pitchpick-user-id") || null,
  selectedMatchdayId: localStorage.getItem("pitchpick-selected-matchday-id") || null,
  selectedMatchId: null,
  managedLeagueId: localStorage.getItem("pitchpick-managed-league-id") || null,
  score: { home: 2, away: 1 },
  dirtyCards: new Map(),
  matchdayOdds: new Map(),
  wc26Data: null,
  wc26LoadPromise: null
};

const root = document.querySelector("#appRoot");
const toast = document.querySelector("#toast");

function setTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");
  document.querySelector("#themeToggle").textContent = theme === "dark" ? "Dark" : "Light";
  localStorage.setItem("pitchpick-full-theme", theme);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

async function loadState() {
  if (!state.userId) {
    renderLogin();
    updateChrome();
    return;
  }

  try {
    state.data = await api.getState();
  } catch (error) {
    localStorage.removeItem("pitchpick-user-id");
    state.userId = null;
    renderLogin(error.message);
    updateChrome();
    return;
  }
  resetRouteDataCaches();
  syncHydratedState();
  await ensureMatchdayOdds(selectedMatchday()?.id);
  applyMatchdaySelectionState();
  updateChrome();
  render();
}

function render() {
  if (!state.data) {
    renderLogin();
    return;
  }

  if (ADMIN_ROUTES.has(state.route) && !isAdmin()) state.route = "player";

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });

  if (state.route === "admin") renderAdmin();
  else if (state.route === "submitCheck") renderSubmitCheck();
  else if (state.route === "playerData") renderPlayerData();
  else if (state.route === "leagueData") renderLeagueData();
  else if (state.route === "matchups") renderSeasonMatchups();
  else if (state.route === "wc26") renderWc26Update();
  else if (state.route === "leaderboard") renderLeaderboard();
  else if (state.route === "account") renderAccount();
  else if (state.route === "rules") renderRules();
  else renderPlayer();
}

function renderLogin(error = "") {
  document.querySelector("#leagueName").textContent = "World Cup 26 Prediction";
  document.querySelector("#matchdayName").textContent = "Log in";
  root.innerHTML = `
    <section class="login-screen">
      <form class="login-card" id="loginForm">
        <div>
          <p class="label">Welcome back</p>
          <h1>Log in to World Cup 26 Prediction</h1>
          <p class="muted">Use your email, name, or player id with the password set by an admin.</p>
        </div>
        ${error ? `<div class="form-error">${error}</div>` : ""}
        <label>
          <span>Email or username</span>
          <input name="email" type="text" value="user" autocomplete="username" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" value="player123" required />
        </label>
        <button class="submit-button">Log In</button>
        <div class="demo-accounts">
          <button type="button" data-demo-login="player">Player demo</button>
          <button type="button" data-demo-login="admin">Admin demo</button>
        </div>
        <p class="muted">Admin: admin / admin123<br />Player: user / player123</p>
      </form>
    </section>
  `;
}

function updateChrome() {
  const loggedIn = Boolean(state.data?.currentUser);
  const admin = isAdmin();
  document.querySelectorAll('[data-route="admin"], [data-route="submitCheck"], [data-route="playerData"], [data-route="leagueData"]').forEach((button) => {
    button.hidden = !admin;
  });
  document.querySelector("#refreshButton").hidden = !loggedIn;
  document.querySelector("#logoutButton").hidden = !loggedIn;
}

function isAdmin() {
  return state.data?.currentUser?.role === "ADMIN";
}

function renderPlayer() {
  const data = state.data;
  const summary = selectedMatchday();
  if (!summary) {
    root.innerHTML = `<div class="loading">No matchdays are available yet.</div>`;
    return;
  }
  document.querySelector("#matchdayName").textContent = `${summary.name} · ${summary.status}`;
  if (summary.status === "FINAL") {
    renderMatchdayResult(summary);
    return;
  }

  const visibleCards = visiblePredictionCards(summary);
  const hasAssignedCards = summary.playerCards.length > 0;
  const selected = hasAssignedCards ? [...state.dirtyCards.values()].filter((card) => card.selected).length : 0;
  const locked = isMatchdayLocked(summary);
  const readOnlyCards = locked || !hasAssignedCards;
  const selectedMatch = summary.matches.find((match) => match.id === state.selectedMatchId) || summary.matches[0] || null;
  const exactOdds = selectedMatch ? getExactOdds(selectedMatch.id) : [];
  const activeOdd = getActiveExactOdd(exactOdds);
  const multiplier = activeOdd?.priceDecimal || estimateMultiplier();
  const potential = exactScoreBoostPoints(multiplier);
  const currentPlayerProjection = estimateProjectedScore(potential);
  const displayContest = getPrimaryMatchup(summary);
  const matchup = getProjectedMatchupDisplay(displayContest, data.currentUser.id, currentPlayerProjection);
  const submitDisabledReason = getSubmitDisabledReason({ summary, hasAssignedCards, locked, selectedMatch, selected });

  root.innerHTML = `
    <section class="arena">
      ${renderMatchdayList(summary.id)}
      <div class="hero">
        <div>
              <p class="label">${summary.isToday ? "Today" : summary.phaseLabel || "Matchday"} · ${summary.status}</p>
              <h1>${summary.name}</h1>
              <span class="muted">${summary.matches.length} matches · ${formatDate(summary.date)}</span>
        </div>
        <div class="matchup-score">
          <span>${matchup.userLabel || data.currentUser.displayName}</span>
          <small class="muted">Projected</small>
          <strong>${formatScoreValue(matchup.userScore)}</strong>
        </div>
        <div class="matchup-score">
          <span>${matchup.opponentLabel}</span>
          <small class="muted">Projected</small>
          <strong class="blue-score">${formatScoreValue(matchup.opponentScore)}</strong>
        </div>
        <div class="lock-card">
          <span class="muted">${locked ? "Auto-locked" : "Auto-locks in"}</span>
          <strong>${locked ? "Locked" : formatCountdown(summary.lockAt)}</strong>
          <small class="muted">First kickoff · ${formatTime(summary.lockAt)}</small>
        </div>
      </div>

      <div class="workspace">
        <section class="picks-panel">
          <div class="section-head">
            <div>
              <p class="label">Pick ${MIN_SELECTED_CARDS}-${MAX_SELECTED_CARDS} of ${CARD_SET_SIZE}</p>
              <h2>Prediction cards</h2>
              <span class="muted">${cardPanelMessage(summary, hasAssignedCards, locked)}</span>
            </div>
            <div class="meter"><span>${selected} Selected</span><strong>${selected} / ${MAX_SELECTED_CARDS}</strong></div>
          </div>
          ${visibleCards.length
            ? `<div class="cards-grid">${visibleCards.map((playerCard) => renderCard(playerCard, { locked: readOnlyCards })).join("")}</div>`
            : `<div class="empty-state">No prediction cards have been generated for this matchday yet.</div>`}
        </section>

        <aside class="right-rail">
          ${renderExactScorePanel({ selectedMatch, exactOdds, multiplier, potential, readOnlyCards })}

          <section class="panel">
            <div class="panel-head"><h2>Matchup</h2><span class="label">${formatPairingMode(displayContest?.mode || data.league.pairingMode)}</span></div>
            ${renderContest(summary)}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Standings</h2><button class="panel-button" data-route-click="leaderboard">View Full</button></div>
            ${renderStandingsTable(data.standings.slice(0, 6))}
          </section>
        </aside>
      </div>

      <div class="bottom-fixtures">
        <div><p class="label">${summary.isToday ? "Today's matches" : "Selected matches"}</p><strong>${summary.matches.length} matches</strong></div>
        ${summary.matches.length ? summary.matches.map((match) => `
          <button class="fixture-button ${match.id === selectedMatch?.id ? "active" : ""}" data-match-id="${match.id}">
            ${renderTeamFlag(match.homeTeamCode, match.homeTeam, { side: "home", compact: true })}
            <small>vs</small>
            ${renderTeamFlag(match.awayTeamCode, match.awayTeam, { side: "away", compact: true })}
            <em>${formatTime(match.kickoffAt)}</em>
          </button>
        `).join("") : `<div class="empty-state fixture-empty">No matches are scheduled for this matchday yet.</div>`}
        ${renderSubmitPicksButton(submitDisabledReason)}
      </div>
    </section>
  `;
}

function renderSubmitPicksButton(disabledReason = "") {
  const disabled = Boolean(disabledReason);
  const safeReason = escapeHtml(disabledReason);
  return `
    <span class="submit-button-wrap ${disabled ? "disabled" : ""}" ${disabled ? `title="${safeReason}" data-tooltip="${safeReason}" tabindex="0"` : ""}>
      <button class="submit-button" id="submitPicks" ${disabled ? `disabled title="${safeReason}" aria-disabled="true"` : ""}>Submit Picks</button>
    </span>
  `;
}

function getSubmitDisabledReason({ summary, hasAssignedCards, locked, selectedMatch, selected }) {
  if (locked || isMatchdayLocked(summary)) return "This matchday is locked.";
  if (!hasAssignedCards) return "No prediction cards are available yet.";
  if (!selectedMatch) return "No match is available for exact-score prediction.";
  if (selected < MIN_SELECTED_CARDS) return `Select at least ${MIN_SELECTED_CARDS} cards to submit.`;
  if (selected > MAX_SELECTED_CARDS) return `Select no more than ${MAX_SELECTED_CARDS} cards.`;
  return "";
}

function renderExactScorePanel({ selectedMatch, exactOdds, multiplier, potential, readOnlyCards }) {
  if (!selectedMatch) {
    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Exact Score Boost</h2>
          <span class="label">No match</span>
        </div>
        <div class="empty-state compact-empty">No match is available for exact-score picks yet.</div>
      </section>
    `;
  }

  const activeScore = normalizeScoreState(state.score);
  const selectedScore = scoreKey(activeScore);
  const scoreOdds = withOtherExactOdd(exactOdds);
  const listedOdd = getExactOddForScore(scoreOdds, selectedScore);
  const displayOdd = listedOdd || getOtherExactOdd(scoreOdds);
  const usesOtherRate = !listedOdd && Boolean(displayOdd);

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>Exact Score Boost</h2>
        <span class="label">API ratios</span>
      </div>
      <div class="score-matchup">
        ${renderTeamFlag(selectedMatch.homeTeamCode, selectedMatch.homeTeam, { side: "home" })}
        <span>vs</span>
        ${renderTeamFlag(selectedMatch.awayTeamCode, selectedMatch.awayTeam, { side: "away" })}
      </div>
      <div class="score-controls">
        <div class="score-stack">
          <button class="score-step" data-score-team="home" data-delta="1" ${readOnlyCards ? "disabled" : ""}>+</button>
          <strong>${activeScore.home}</strong>
          <button class="score-step" data-score-team="home" data-delta="-1" ${readOnlyCards ? "disabled" : ""}>-</button>
        </div>
        <span> - </span>
        <div class="score-stack">
          <button class="score-step" data-score-team="away" data-delta="1" ${readOnlyCards ? "disabled" : ""}>+</button>
          <strong>${activeScore.away}</strong>
          <button class="score-step" data-score-team="away" data-delta="-1" ${readOnlyCards ? "disabled" : ""}>-</button>
        </div>
      </div>
      <div class="score-odds">
        <span>Multiplier</span>
        <strong>${multiplier.toFixed(1)}x</strong>
        <em>${potential} pts</em>
      </div>
      <label class="score-picker">
        <span>Score list</span>
        <select id="scoreSelect" aria-label="Exact score list" ${readOnlyCards || !scoreOdds.length ? "disabled" : ""}>
          ${renderScoreSelectOptions(scoreOdds, selectedScore, displayOdd)}
        </select>
        <small>${usesOtherRate
          ? `Other scores use the 5-5 rate: ${displayOdd.priceDecimal.toFixed(1)}x.`
          : "Listed score odds from the database."}</small>
      </label>
    </section>
  `;
}

function renderMatchdayList(activeId, options = {}) {
  const months = groupMatchdaysByCalendarMonth(state.data.matchdaySummaries);
  const today = state.data.todayDate || todayKey();
  const upcomingCount = state.data.matchdaySummaries.filter((matchday) => matchday.date >= today && matchday.status !== "FINAL").length;
  const summaryLabel = options.summaryLabel || "All matchdays";
  const summaryMeta = options.summaryMeta || `${upcomingCount} upcoming`;
  const getDayMetric = options.getDayMetric || ((matchday) => matchday.matches.length);
  const formatDayMetricLabel = options.formatDayMetricLabel || ((count) => count === 1 ? "game" : "games");
  return `
    <section class="matchday-strip">
      <div class="calendar-summary">
        <p class="label">${summaryLabel}</p>
        <strong>${state.data.matchdaySummaries.length} days</strong>
        <span class="muted">${summaryMeta}</span>
      </div>
      <div class="matchday-calendar">
        ${months.map((month) => `
          <div class="calendar-month">
            <div class="calendar-month-head">
              <strong>${month.label}</strong>
              <span>${month.matchdays.length} matchday${month.matchdays.length === 1 ? "" : "s"}</span>
            </div>
            <div class="calendar-weekdays">
              ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}
            </div>
            <div class="calendar-grid">
              ${month.days.map((day) => {
                const metricCount = day.matchday ? getDayMetric(day.matchday) : 0;
                const statusLabel = day.matchday ? calendarDayStatusLabel(day.matchday) : "";
                const statusClass = statusLabel ? statusLabel.toLowerCase() : "";
                return day.matchday ? `
                <button class="calendar-day ${day.matchday.id === activeId ? "active" : ""} ${day.matchday.isToday ? "today" : ""} ${day.matchday.status.toLowerCase()} ${statusClass}" data-matchday-id="${day.matchday.id}">
                  <span>${day.dayOfMonth}</span>
                  <strong>${statusLabel}</strong>
                  <small>${metricCount} ${formatDayMetricLabel(metricCount)}</small>
                </button>
              ` : `
                <span class="calendar-day empty">${day.dayOfMonth || ""}</span>
              `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMatchdayResult(summary) {
  const exactMatch = summary.matches.find((match) => match.id === summary.scorePrediction?.tournamentMatchId);
  const resultContest = getPrimaryMatchup(summary);
  const resultMatchup = getFinalMatchupDisplay(resultContest, state.data.currentUser.id);
  root.innerHTML = `
    <section class="arena">
      ${renderMatchdayList(summary.id)}
      <div class="result-hero">
        <div>
          <p class="label">${summary.status}</p>
          <h1>${summary.name} Result</h1>
          <span class="muted">${summary.matches.map((match) => `${match.homeTeamCode} ${match.homeScore}-${match.awayScore} ${match.awayTeamCode}`).join(" · ")}</span>
        </div>
        <div class="matchup-score final ${summary.resultLabel.toLowerCase()}">
          <span>${resultMatchup.userLabel || state.data.currentUser.displayName}</span>
          <small class="muted">Final</small>
          <strong>${formatScoreValue(resultMatchup.userScore)}</strong>
        </div>
        <div class="matchup-score final ${summary.resultLabel.toLowerCase()}">
          <span>${resultMatchup.opponentLabel}</span>
          <small class="muted">Final</small>
          <strong class="blue-score">${formatScoreValue(resultMatchup.opponentScore)}</strong>
        </div>
        <div class="result-breakdown">
          <span><strong>${summary.cardPoints}</strong> card pts</span>
          <span><strong>${summary.exactPoints}</strong> exact pts</span>
          <span><strong>${summary.totalPoints}</strong> your fantasy</span>
        </div>
      </div>

      <div class="workspace">
        <section class="picks-panel">
          <div class="section-head">
            <div>
              <p class="label">Submitted picks</p>
              <h2>Your final card results</h2>
              <span class="muted">Old matchdays are read-only.</span>
            </div>
            <div class="meter"><span>${summary.selectedCards.length} Selected</span><strong>${summary.cardPoints} pts</strong></div>
          </div>
          <div class="cards-grid">${summary.playerCards.map(renderResultCard).join("")}</div>
        </section>

        <aside class="right-rail">
          <section class="panel">
            <div class="panel-head"><h2>Exact Score Result</h2><span class="label">${summary.scorePrediction?.isExact ? "Exact" : "Missed"}</span></div>
            ${summary.scorePrediction ? `
              <div class="score-matchup">
                ${renderTeamFlag(exactMatch?.homeTeamCode || "HOME", exactMatch?.homeTeam || "Home", { side: "home" })}
                <span>vs</span>
                ${renderTeamFlag(exactMatch?.awayTeamCode || "AWAY", exactMatch?.awayTeam || "Away", { side: "away" })}
              </div>
              <div class="score-odds">
                <span>Predicted ${summary.scorePrediction.predictedHomeScore}-${summary.scorePrediction.predictedAwayScore}</span>
                <strong>${summary.scorePrediction.oddsMultiplier.toFixed(1)}x</strong>
                <em>${summary.scorePrediction.pointsAwarded} pts</em>
              </div>
            ` : `<p class="muted">No exact score was submitted.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Contest</h2><span class="label">${formatPairingMode(resultContest?.mode || state.data.league.pairingMode)}</span></div>
            ${resultContest ? renderContestRow(resultContest) : `<p class="muted">Generate matchups for this matchday to show the scheduled contest.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Matches</h2><span class="label">Final scores</span></div>
            <div class="contest-list">${summary.matches.map((match) => renderCompactMatchLog(match, { showScore: true })).join("")}</div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderResultCard(playerCard) {
  const selected = playerCard.selected;
  const resultClass = selected
    ? playerCard.isCorrect ? "result-correct" : "result-wrong"
    : "locked";
  const pillClass = selected ? playerCard.isCorrect ? "win" : "loss" : "";
  return `
    <article class="prediction-card ${selected ? "selected" : ""} ${resultClass}">
      <div class="card-top">
        <span class="card-number">${cardDisplayNumber(playerCard.card)}</span>
        <h3>${playerCard.card.title}</h3>
      </div>
      <p class="card-question">${playerCard.card.questionText}</p>
      <div class="result-pill ${pillClass}">${selected ? playerCard.isCorrect ? "Correct" : "Wrong" : "Not selected"}</div>
      <div class="card-foot"><strong>${playerCard.playerAnswer || "-"}</strong><span>${playerCard.pointsAwarded || 0} pts</span></div>
    </article>
  `;
}

function renderCard(playerCard, options = {}) {
  const dirty = state.dirtyCards.get(playerCard.predictionCardId) || { selected: false, answer: null };
  const selectedCount = [...state.dirtyCards.values()].filter((card) => card.selected).length;
  const lockedOut = !dirty.selected && selectedCount >= MAX_SELECTED_CARDS;
  const locked = options.locked ?? isMatchdayLocked(selectedMatchday());
  return `
    <article class="prediction-card ${dirty.selected ? "selected" : ""} ${lockedOut || locked ? "locked" : ""}" data-card-id="${playerCard.predictionCardId}">
      <div class="card-top">
        <span class="card-number">${cardDisplayNumber(playerCard.card)}</span>
        <h3>${playerCard.card.title}</h3>
      </div>
      <p class="card-question">${playerCard.card.questionText}</p>
      <div class="answer-row">
        <button class="answer-button ${dirty.answer === "YES" ? "yes-active" : ""}" data-answer="YES" ${locked ? "disabled" : ""}>Yes</button>
        <button class="answer-button ${dirty.answer === "NO" ? "no-active" : ""}" data-answer="NO" ${locked ? "disabled" : ""}>No</button>
      </div>
      <div class="card-foot"><strong>${CARD_POINTS_CORRECT} pts</strong><span>Correct pick</span></div>
    </article>
  `;
}

function visiblePredictionCards(summary) {
  if (summary.playerCards.length) return summary.playerCards;
  return (summary.predictionCards || []).map((card) => ({
    id: `preview_${card.id}`,
    playerCardSetId: null,
    predictionCardId: card.id,
    selected: false,
    playerAnswer: null,
    isCorrect: null,
    pointsAwarded: 0,
    answeredAt: null,
    card
  }));
}

function cardPanelMessage(summary, hasAssignedCards, locked) {
  if (!hasAssignedCards && summary.predictionCardCount > 0) {
    return "Generated card preview. Active players receive selectable cards.";
  }
  if (!hasAssignedCards) return "No player card set is assigned yet.";
  if (locked) return "This matchday is read-only after first kickoff.";
  return "Correct picks score +10. Incorrect picks score -10.";
}

function renderAdmin() {
  const data = state.data;
  const league = managedLeague();
  const opsMatchday = selectedMatchday() || data.matchday;
  document.querySelector("#matchdayName").textContent = `Admin Ops · ${opsMatchday.name}`;
  const finishedOpsMatches = opsMatchday.matches.filter((match) => match.status === "FINISHED").length;
  root.innerHTML = `
    <section class="admin-layout">
      <div class="admin-main">
        ${renderMatchdayList(opsMatchday.id)}
        <div class="admin-grid">
          ${renderLiveDataPanel(data)}

          <section class="panel">
            <div class="panel-head"><h2>Matchday Ops</h2><span class="label">${opsMatchday.status}</span></div>
            <p class="muted">Cards, matchups, score, and finalize target <strong>${opsMatchday.name}</strong> for <strong>${league.name}</strong>.</p>
            <div class="ops-summary">
              <span><strong>${formatDate(opsMatchday.date)}</strong><small>${opsMatchday.matches.length} matches</small></span>
              <span><strong>${formatTime(opsMatchday.lockAt)}</strong><small>Auto-lock</small></span>
              <span><strong>${finishedOpsMatches}/${opsMatchday.matches.length}</strong><small>Final scores</small></span>
              <span><strong>${opsMatchday.predictionCardCount || 0}</strong><small>Cards</small></span>
            </div>
            <div class="ops-action-groups">
              <div class="ops-action-group score-finalization">
                <div>
                  <strong>Score Finalization</strong>
                  <span>${finishedOpsMatches}/${opsMatchday.matches.length} final scores</span>
                </div>
                <div class="actions">
                  <button class="panel-button primary" data-admin-action="update-match-scores">Update WC Match Score</button>
                  <button class="panel-button" data-admin-action="score-matchday">Score</button>
                  <button class="panel-button primary" data-admin-action="finalize-matchday">Finalize</button>
                </div>
              </div>
              <div class="ops-action-group">
                <div>
                  <strong>Live Data</strong>
                  <span>${data.tournamentSummary?.oddsSnapshots || 0} odds</span>
                </div>
                <div class="actions">
                  <button class="panel-button primary" data-admin-action="sync-fixtures">Sync All Fixtures</button>
                  <button class="panel-button primary" data-admin-action="sync-odds">Sync All Odds</button>
                </div>
              </div>
              <div class="ops-action-group">
                <div>
                  <strong>Cards</strong>
                  <span>${opsMatchday.predictionCardCount || 0} generated</span>
                </div>
                <div class="actions">
                  <button class="panel-button" data-admin-action="generate-cards">Generate Cards</button>
                  <button class="panel-button primary" data-admin-action="generate-cards" data-card-scope="season">Generate Season Cards</button>
                </div>
              </div>
              <div class="ops-action-group">
                <div>
                  <strong>Matchups</strong>
                  <span>${managedSelectedContests(opsMatchday.id).length} selected</span>
                </div>
                <div class="actions">
                  <button class="panel-button" data-admin-action="generate-pairings">Generate Selected</button>
                  <button class="panel-button" data-admin-action="generate-pairings" data-shuffle="true">Shuffle Selected</button>
                  <button class="panel-button primary" data-admin-action="generate-pairings" data-pairing-scope="season" data-shuffle="true">Generate Season</button>
                </div>
              </div>
            </div>
          </section>

          <section class="panel">
          <div class="panel-head"><h2>Void Card</h2><span class="label">Safety</span></div>
          <form class="admin-form" id="voidForm">
            <select name="cardId" aria-label="Card to void" ${opsMatchday.predictionCards?.length ? "" : "disabled"}>
              ${opsMatchday.predictionCards?.length
                ? opsMatchday.predictionCards.map((card) => `<option value="${card.id}">${card.title}</option>`).join("")
                : `<option>No cards for selected matchday</option>`}
            </select>
            <input name="reason" value="Data unavailable" aria-label="Void reason" />
            <button class="panel-button danger" ${opsMatchday.predictionCards?.length ? "" : "disabled"}>Void Card</button>
          </form>
          </section>

          <section class="panel">
          <div class="panel-head"><h2>Selected Matchups</h2><span class="label">${managedSelectedContests(opsMatchday.id).length} contests</span></div>
          <div class="contest-list">${managedSelectedContests(opsMatchday.id).length ? managedSelectedContests(opsMatchday.id).map(renderContestRow).join("") : `<p class="muted">Generate matchups for ${opsMatchday.name} to fill this list.</p>`}</div>
          </section>

          <section class="panel">
          <div class="panel-head"><h2>Season Matchups</h2><span class="label">${managedSeasonMatchups().length} contests</span></div>
          <div class="contest-list season-matchups">${managedSeasonMatchups().length ? managedSeasonMatchups().map(({ contest, matchday }) => renderContestRow(contest, { matchday })).join("") : `<p class="muted">Generate the season schedule for ${league.name} to show every matchup here.</p>`}</div>
          </section>
        </div>
      </div>

      <aside class="right-rail">
        <section class="panel">
          <div class="panel-head"><h2>Raw Sync Logs</h2><button class="panel-button" id="exportCsv">Export CSV</button></div>
          <div class="contest-list">${data.syncLogs.map((item) => `
            <div class="log-row"><strong>${item.type}</strong><span class="muted">${item.message}</span><small>${new Date(item.createdAt).toLocaleString()}</small></div>
          `).join("")}</div>
        </section>
      </aside>
    </section>
  `;
}

function renderSubmitCheck() {
  const data = state.data;
  const league = managedLeague();
  const summary = selectedMatchday() || data.matchday;
  const submissionCheck = submissionCheckForMatchday(summary.id);
  const rows = submissionCheck?.rows || [];
  const submittedRows = rows.filter((row) => row.submitted);
  const missingRows = rows.filter((row) => !row.submitted);
  const generatedCards = summary.predictionCardCount || 0;
  document.querySelector("#matchdayName").textContent = `Submit Check · ${summary.name}`;
  root.innerHTML = `
    <section class="admin-layout">
      <div class="admin-main">
        ${renderMatchdayList(summary.id, {
          summaryLabel: "Submit check",
          summaryMeta: `${submissionCheck?.submittedCount || 0}/${submissionCheck?.totalCount || 0} submitted`,
          getDayMetric: (matchday) => submissionCheckForMatchday(matchday.id)?.submittedCount || 0,
          formatDayMetricLabel: () => "submitted"
        })}

        <section class="panel">
          <div class="panel-head"><h2>${escapeHtml(summary.name)}</h2><span class="label">${escapeHtml(league.name)}</span></div>
          <div class="ops-summary">
            <span><strong>${submissionCheck?.submittedCount || 0}</strong><small>Submitted</small></span>
            <span><strong>${submissionCheck?.missingCount || 0}</strong><small>Missing</small></span>
            <span><strong>${generatedCards}</strong><small>Cards</small></span>
            <span><strong>${summary.matches.length}</strong><small>Games</small></span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Missing</h2><span class="label">${missingRows.length} players</span></div>
          <div class="member-list submit-check-list">
            ${missingRows.length ? missingRows.map(renderSubmissionRow).join("") : `<p class="empty-state">Everyone has submitted for this matchday.</p>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Submitted</h2><span class="label">${submittedRows.length} players</span></div>
          <div class="member-list submit-check-list">
            ${submittedRows.length ? submittedRows.map(renderSubmissionRow).join("") : `<p class="empty-state">No submissions yet.</p>`}
          </div>
        </section>
      </div>

      <aside class="right-rail">
        <section class="panel">
          <div class="panel-head"><h2>Checklist</h2><span class="label">${summary.status}</span></div>
          <div class="league-summary compact-summary">
            <span><strong>${formatDate(summary.date)}</strong> matchday</span>
            <span><strong>${formatTime(summary.lockAt)}</strong> lock</span>
            <span><strong>${MIN_SELECTED_CARDS}</strong> cards required</span>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function renderSubmissionRow(row) {
  const status = row.submitted ? "submitted" : "missing";
  const detail = row.submitted
    ? `Submitted ${formatDateTime(row.submittedAt)}`
    : missingSubmissionReason(row);
  return `
    <div class="member-row submit-check-row">
      <div>
        <strong>${escapeHtml(row.displayName)}</strong>
        <span>${escapeHtml(row.email)}</span>
      </div>
      <div class="submission-meta">
        <span>${row.selectedCount}/${row.requiredCount} cards</span>
        <span>${row.exactScore ? `Exact ${escapeHtml(row.exactScore)}` : "No exact score"}</span>
      </div>
      <span class="status-pill ${status}">${row.submitted ? "Submitted" : "Missing"}</span>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function missingSubmissionReason(row) {
  if (!row.hasCardSet || row.cardCount === 0) return "No card set assigned";
  if (row.selectedCount < row.requiredCount && !row.hasExactScore) return "Needs cards and exact score";
  if (row.selectedCount < row.requiredCount) return "Needs more selected cards";
  if (!row.hasExactScore) return "Needs exact score";
  return "Not submitted";
}

function renderPlayerData() {
  const data = state.data;
  document.querySelector("#matchdayName").textContent = "Admin · Player Data";
  root.innerHTML = `
    <section class="admin-layout">
      <div class="admin-main">
        <section class="panel">
          <div class="panel-head"><h2>Create User</h2><span class="label">Account</span></div>
          <form class="admin-form user-edit-form" id="createUserForm">
            <input name="displayName" placeholder="Name" aria-label="Name" autocomplete="off" required />
            <input name="email" type="email" placeholder="user@example.com" aria-label="Email" autocomplete="off" required />
            <select name="role" aria-label="Role">${renderUserRoleOptions("PLAYER")}</select>
            <input name="password" type="text" placeholder="Password" aria-label="Password" autocomplete="new-password" required />
            <button class="panel-button primary">Create User</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Player Database</h2><span class="label">${data.users.length} users</span></div>
          <div class="member-list user-database-list">${data.users.map(renderUserDatabaseRow).join("")}</div>
        </section>
      </div>

      <aside class="right-rail">
        <section class="panel">
          <div class="panel-head"><h2>Role Access</h2><span class="label">${data.users.filter((user) => user.role === "ADMIN").length} admins</span></div>
          <div class="league-summary compact-summary">
            <span><strong>${data.users.filter((user) => user.role === "PLAYER").length}</strong> players</span>
            <span><strong>${data.users.filter((user) => user.hasPassword).length}</strong> protected</span>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function renderLeagueData() {
  const data = state.data;
  const league = managedLeague();
  const leagueMembers = membersForLeague(league.id);
  const availableUsers = availableUsersForLeague(league.id);
  document.querySelector("#matchdayName").textContent = `Admin · ${league.name}`;
  root.innerHTML = `
    <section class="admin-layout">
      <div class="admin-main">
        <div class="admin-grid">
          <section class="panel">
            <div class="panel-head"><h2>Manage League</h2><span class="label">${data.leagues.length} leagues</span></div>
            <form class="admin-form" id="updateLeagueForm">
              <select id="managedLeagueSelect" name="leagueId" aria-label="Select league to manage">
                ${data.leagues.map((item) => `<option value="${item.id}" ${item.id === league.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
              <input name="name" value="${escapeHtml(league.name)}" aria-label="League name" />
              <input name="seasonName" value="${escapeHtml(league.seasonName)}" aria-label="Season name" />
              <select name="pairingMode" aria-label="Pairing mode">
                ${renderPairingModeOptions(league.pairingMode)}
              </select>
              <button class="panel-button primary">Save League</button>
            </form>
            <div class="league-summary">
              <span><strong>${league.memberCount}</strong> members</span>
              <span><strong>${league.activeMemberCount}</strong> active</span>
              <span><strong>${league.contestCount}</strong> contests</span>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Create League</h2><span class="label">Admin</span></div>
            <form class="admin-form" id="createLeagueForm">
              <input name="name" value="Weekend Rivals" aria-label="League name" />
              <select name="pairingMode" aria-label="Pairing mode">
                ${renderPairingModeOptions("MIXED")}
              </select>
              <button class="panel-button primary">Create League</button>
            </form>
          </section>
        </div>

        <section class="panel">
          <div class="panel-head"><h2>League Members</h2><span class="label">${league.name}</span></div>
          <form class="admin-form" id="addExistingMemberForm">
            <select name="userId" aria-label="Existing player to add" ${availableUsers.length ? "" : "disabled"}>
              ${availableUsers.length
                ? availableUsers.map((user) => `<option value="${user.id}">${escapeHtml(user.displayName)} · ${escapeHtml(user.email)}</option>`).join("")
                : `<option>No available players outside this league</option>`}
            </select>
            <button class="panel-button" ${availableUsers.length ? "" : "disabled"}>Add Existing Player</button>
          </form>
          <div class="member-list">${leagueMembers.length ? leagueMembers.map(renderMemberRow).join("") : `<p class="muted">No members yet.</p>`}</div>
        </section>
      </div>

      <aside class="right-rail">
        <section class="panel">
          <div class="panel-head"><h2>Selected League</h2><span class="label">${league.pairingMode}</span></div>
          <div class="league-summary compact-summary">
            <span><strong>${league.seasonName}</strong> season</span>
            <span><strong>${league.contestCount}</strong> matchups</span>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function renderAccount() {
  const user = state.data.currentUser;
  document.querySelector("#matchdayName").textContent = "Account";
  root.innerHTML = `
    <section class="panel account-page">
      <div class="panel-head"><h2>Account</h2><span class="status-pill ${user.role.toLowerCase()}">${formatUserRole(user.role)}</span></div>
      <form class="admin-form account-form" id="accountForm">
        <input value="${escapeHtml(user.email)}" aria-label="Email" disabled />
        <input name="displayName" value="${escapeHtml(user.displayName)}" aria-label="Name" required />
        <input name="password" type="password" placeholder="New password" aria-label="New password" autocomplete="new-password" />
        <button class="panel-button primary">Update Account</button>
      </form>
    </section>
  `;
}

function renderLiveDataPanel(data) {
  const today = todayKey();
  const matchdays = data.matchdays || [];
  const tournamentSummary = data.tournamentSummary || {};
  const syncLogs = data.syncLogs || [];
  const lastInitial = syncLogs.find((item) => item.type === "INITIAL_DATA_LOAD");
  const lastDaily = syncLogs.find((item) => item.type === "DAILY_DATA_UPDATE");
  const todayMatchday = matchdays.find((matchday) => matchday.date === today);
  const todaySummary = state.data.matchdaySummaries?.find((matchday) => matchday.id === todayMatchday?.id);
  const matchCount = tournamentSummary.matches || 0;
  const oddsCount = tournamentSummary.oddsSnapshots || 0;
  const correctScoreOddsCount = tournamentSummary.correctScoreOdds || 0;
  const generatedCorrectScoreOddsCount = tournamentSummary.generatedCorrectScoreOdds || 0;
  const todayMatchCount = todaySummary?.matches?.length || 0;

  return `
    <section class="panel live-data-panel">
      <div class="panel-head">
        <h2>Live Data</h2>
        <span class="label">${matchCount} matches</span>
      </div>
      <div class="league-summary live-data-summary">
        <span><strong>${matchdays.length}</strong> matchdays</span>
        <span><strong>${matchCount}</strong> games</span>
        <span><strong>${oddsCount}</strong> odds</span>
        <span><strong>${correctScoreOddsCount}</strong> score odds</span>
      </div>
      <div class="live-data-actions">
        <div>
          <strong>Initial database</strong>
          <span class="muted">${lastInitial ? new Date(lastInitial.createdAt).toLocaleString() : "Not loaded from admin yet"}</span>
        </div>
        <button class="panel-button primary" data-admin-action="initialize-tournament-data">Initial Load</button>
      </div>
      <div class="live-data-actions">
        <label class="daily-sync-date">
          <span>Daily date</span>
          <input id="dailySyncDate" type="date" value="${today}" />
        </label>
        <div>
          <strong>${todayMatchCount} games today</strong>
          <span class="muted">${lastDaily ? new Date(lastDaily.createdAt).toLocaleString() : "No daily update yet"} · ${generatedCorrectScoreOddsCount} generated score odds</span>
        </div>
        <button class="panel-button" data-admin-action="sync-daily-tournament-data">Update Date</button>
      </div>
    </section>
  `;
}

function renderUserDatabaseRow(user) {
  const role = user?.role === "ADMIN" ? "ADMIN" : "PLAYER";
  return `
    <form class="member-row user-data-row" id="updateUserForm">
      <input type="hidden" name="userId" value="${escapeHtml(user.id)}" />
      <div>
        <strong>${escapeHtml(user.email || "No email")}</strong>
        <span class="muted">ID ${escapeHtml(user.id)} · ${user.hasPassword ? "Password protected" : "Needs password"}</span>
      </div>
      <input name="displayName" value="${escapeHtml(user.displayName || "")}" aria-label="Name" autocomplete="off" required />
      <select name="role" aria-label="Role">${renderUserRoleOptions(role)}</select>
      <input name="password" type="text" placeholder="Reset password" aria-label="Reset password" autocomplete="new-password" />
      <button class="panel-button primary">Save / Reset</button>
    </form>
  `;
}

function renderMemberRow(member) {
  const user = state.data.users.find((item) => item.id === member.userId);
  const profile = state.data.profiles.find((item) => item.userId === member.userId);
  return `
    <div class="member-row">
      <div>
        <strong>${escapeHtml(user?.displayName || member.userId)}</strong>
        <span class="muted">${escapeHtml(user?.email || "No email")}${profile ? ` · ${escapeHtml(profile.timezone)} · ${escapeHtml(profile.favoriteTeam)}` : ""}</span>
      </div>
      <span class="status-pill ${member.status.toLowerCase()}">${member.status}</span>
      <div class="member-actions">
        ${member.status !== "ACTIVE" ? `<button class="panel-button" data-member-action="ACTIVE" data-member-user-id="${member.userId}">Activate</button>` : ""}
        <button class="panel-button danger" data-member-action="REMOVED" data-member-user-id="${member.userId}">Remove</button>
      </div>
    </div>
  `;
}

function renderSeasonMatchups() {
  const league = managedLeague();
  const summary = selectedMatchday();
  if (!summary) {
    root.innerHTML = `<div class="loading">No matchdays are available yet.</div>`;
    return;
  }

  const dayMatchups = managedSelectedContests(summary.id);
  const visibleDayMatchups = visibleContestsForUser(dayMatchups);
  const seasonMatchups = managedSeasonMatchups();
  const visibleSeasonMatchups = isAdmin() ? seasonMatchups : seasonMatchups.filter(({ contest }) => contestIncludesCurrentUser(contest));
  const generatedDays = new Set(visibleSeasonMatchups.map((item) => item.matchday.id)).size;
  const finalizedCount = visibleSeasonMatchups.filter(({ contest }) => contest.status === "FINAL").length;
  const defaultSeasonPairingMode = league.pairingMode === "SOLO" ? "MIXED" : league.pairingMode;
  const dayModeLabel = formatContestModeSummary(visibleDayMatchups, defaultSeasonPairingMode);
  const seasonModeLabel = formatContestModeSummary(visibleSeasonMatchups.map((item) => item.contest), defaultSeasonPairingMode);
  const currentUserContest = dayMatchups.find((contest) => (
    contest.participants.some((part) => part.userId === state.data.currentUser.id)
  ));

  document.querySelector("#leagueName").textContent = league.name;
  document.querySelector("#matchdayName").textContent = `${league.name} · Season Matchups`;
  root.innerHTML = `
    <section class="arena season-matchups-page">
      ${renderMatchdayList(summary.id, {
        summaryLabel: "Tournament matchups",
        summaryMeta: `${generatedDays} days generated`,
        getDayMetric: (matchday) => managedSelectedContests(matchday.id).length,
        formatDayMetricLabel: (count) => count === 1 ? "matchup" : "matchups"
      })}

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="label">${league.seasonName}</p>
            <h2>${league.name} Matchup Calendar</h2>
          </div>
          ${isAdmin() ? `
            <div class="matchup-actions">
              <label class="matchup-style-control">
                <span>Style</span>
                <select id="seasonPairingMode" aria-label="Season matchup style">
                  ${renderPairingModeOptions(defaultSeasonPairingMode)}
                </select>
              </label>
              <button class="panel-button primary" data-admin-action="generate-pairings" data-pairing-scope="season" data-shuffle="true">Generate Season</button>
            </div>
          ` : `<span class="label">${seasonModeLabel}</span>`}
        </div>
        <div class="league-summary matchup-summary">
          <span><strong>${state.data.matchdaySummaries.length}</strong> tournament days</span>
          <span><strong>${generatedDays}</strong> matchup days</span>
          <span><strong>${visibleSeasonMatchups.length}</strong> contests</span>
          <span><strong>${finalizedCount}</strong> finalized</span>
        </div>
      </section>

      <div class="workspace">
        <section class="picks-panel">
          <div class="section-head">
            <div>
              <p class="label">${formatDate(summary.date)} · ${summary.status}</p>
              <h2>${summary.name} Matchups</h2>
              <span class="muted">${visibleDayMatchups.length} contest${visibleDayMatchups.length === 1 ? "" : "s"} for ${league.name}</span>
            </div>
            <div class="meter"><span>${dayModeLabel}</span><strong>${visibleDayMatchups.length}</strong></div>
          </div>
          <div class="contest-list season-day-matchups">
            ${visibleDayMatchups.length
              ? visibleDayMatchups.map(renderContestRow).join("")
              : `<div class="empty-state compact-empty">${isAdmin() ? "No matchups generated for this matchday yet." : "Your matchup assignment is pending for this matchday."}</div>`}
          </div>
        </section>

        <aside class="right-rail">
          <section class="panel">
            <div class="panel-head"><h2>${currentUserContest ? "Your Matchup" : "Day Snapshot"}</h2><span class="label">${summary.name}</span></div>
            ${currentUserContest
              ? renderContestRow(currentUserContest)
              : `<div class="league-summary compact-summary"><span><strong>${visibleDayMatchups.length}</strong> contests</span><span><strong>${summary.matches.length}</strong> games</span></div>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Tournament Matches</h2><span class="label">${summary.matches.length} games</span></div>
            <div class="contest-list">
              ${summary.matches.length ? summary.matches.map((match) => renderCompactMatchLog(match)).join("") : `<p class="muted">No tournament matches are scheduled for this day.</p>`}
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Standings</h2><button class="panel-button" data-route-click="leaderboard">View Full</button></div>
            ${renderStandingsTable(league.standings.slice(0, 6))}
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderWc26Update() {
  if (!state.wc26Data) {
    document.querySelector("#matchdayName").textContent = "WC26 Update";
    root.innerHTML = `<div class="loading">Loading WC26 fixtures, results, and standings...</div>`;
    ensureWc26Data().then(() => {
      if (state.route === "wc26") render();
    }).catch((error) => showToast(error.message));
    return;
  }

  const matches = (state.wc26Data.tournamentMatches || []).slice().sort(compareMatchesByKickoff);
  const fixtures = matches.filter((match) => !isCompletedMatch(match)).sort(compareMatchesByKickoff);
  const results = matches.filter(isCompletedMatch).sort((a, b) => matchKickoffTime(b) - matchKickoffTime(a));
  const standings = buildTournamentStandings(matches);
  const teamCount = new Set(matches.flatMap((match) => [match.homeTeamCode, match.awayTeamCode]).filter(Boolean)).size;
  const nextMatch = fixtures[0];
  const nextMatchLabel = nextMatch
    ? `${nextMatch.homeTeam} vs ${nextMatch.awayTeam} · ${formatDateTime(nextMatch.kickoffAt)}`
    : results[0]
      ? `Latest result: ${results[0].homeTeam} ${formatMatchScore(results[0].homeScore)} - ${formatMatchScore(results[0].awayScore)} ${results[0].awayTeam}`
      : "Fixture data will appear after admin sync.";

  document.querySelector("#matchdayName").textContent = "WC26 Update";
  root.innerHTML = `
    <section class="arena wc-update-page">
      <section class="panel wc-update-hero">
        <div>
          <p class="label">World Cup 26</p>
          <h1>Fixtures, Results, Standings</h1>
          <span class="muted">${escapeHtml(nextMatchLabel)}</span>
        </div>
        <div class="league-summary wc-update-summary">
          <span><strong>${fixtures.length}</strong> fixtures</span>
          <span><strong>${results.length}</strong> results</span>
          <span><strong>${standings.length}</strong> table teams</span>
          <span><strong>${teamCount}</strong> total teams</span>
        </div>
      </section>

      <nav class="wc-update-tabs" aria-label="WC26 update sections">
        <a href="#wc-fixtures">Fixtures</a>
        <a href="#wc-results">Results</a>
        <a href="#wc-standings">Standings</a>
      </nav>

      <div class="wc-update-grid">
        <section class="panel" id="wc-fixtures">
          <div class="panel-head">
            <h2>Fixtures</h2>
            <span class="label">${fixtures.length} upcoming</span>
          </div>
          <div class="wc-match-list">
            ${fixtures.length
              ? fixtures.slice(0, 18).map((match) => renderWcMatchRow(match)).join("")
              : `<div class="empty-state compact-empty">No upcoming fixtures are available.</div>`}
          </div>
        </section>

        <section class="panel" id="wc-results">
          <div class="panel-head">
            <h2>Results</h2>
            <span class="label">${results.length} final</span>
          </div>
          <div class="wc-match-list">
            ${results.length
              ? results.slice(0, 18).map((match) => renderWcMatchRow(match, { showScore: true })).join("")
              : `<div class="empty-state compact-empty">Results will appear after matches are finalized.</div>`}
          </div>
        </section>
      </div>

      <section class="panel" id="wc-standings">
        <div class="panel-head">
          <h2>Standings</h2>
          <span class="label">${results.length} results counted</span>
        </div>
        ${renderWcStandingsTable(standings)}
      </section>
    </section>
  `;
}

function renderWcMatchRow(match, options = {}) {
  const completed = isCompletedMatch(match);
  const showScore = options.showScore || completed;
  const statusLabel = completed ? "Result" : match.status === "LIVE" ? "Live" : "Fixture";
  const statusClass = completed ? "finished" : String(match.status || "SCHEDULED").toLowerCase();
  const homeScore = showScore ? `<strong class="team-score">${formatMatchScore(match.homeScore)}</strong>` : "";
  const awayScore = showScore ? `<strong class="team-score">${formatMatchScore(match.awayScore)}</strong>` : "";
  const firstGoal = completed && match.firstGoalMinute
    ? `<span class="muted">First goal ${match.firstGoalMinute}'</span>`
    : "";

  return `
    <article class="wc-match-row">
      <div class="wc-match-row-head">
        <span class="status-pill ${statusClass}">${statusLabel}</span>
        <time>${formatDateTime(match.kickoffAt)}</time>
      </div>
      <div class="wc-match-teams">
        <div class="wc-team-row">
          ${renderTeamFlag(match.homeTeamCode, match.homeTeam, { side: "home", compact: true })}
          <span class="wc-team-name">${escapeHtml(match.homeTeam || "Home")}</span>
          ${homeScore}
        </div>
        <div class="wc-team-row">
          ${renderTeamFlag(match.awayTeamCode, match.awayTeam, { side: "away", compact: true })}
          <span class="wc-team-name">${escapeHtml(match.awayTeam || "Away")}</span>
          ${awayScore}
        </div>
      </div>
      <div class="wc-match-meta">
        <span>${escapeHtml(match.stage || match.group || "World Cup")}</span>
        ${firstGoal}
      </div>
    </article>
  `;
}

function renderCompactMatchLog(match, options = {}) {
  const showScore = options.showScore || isCompletedMatch(match);
  const middle = showScore
    ? `<span class="compact-score">${formatMatchScore(match.homeScore)} - ${formatMatchScore(match.awayScore)}</span>`
    : `<span class="compact-score">vs</span>`;
  const firstGoal = showScore ? ` · First goal ${match.firstGoalMinute || "n/a"}'` : "";
  return `
    <div class="log-row">
      <strong class="compact-match-title">
        ${renderTeamFlag(match.homeTeamCode, match.homeTeam, { side: "home", compact: true })}
        ${middle}
        ${renderTeamFlag(match.awayTeamCode, match.awayTeam, { side: "away", compact: true })}
      </strong>
      <span class="muted">${escapeHtml(match.homeTeam || "Home")} vs ${escapeHtml(match.awayTeam || "Away")} · ${formatTime(match.kickoffAt)}${firstGoal}</span>
    </div>
  `;
}

function renderWcStandingsTable(rows) {
  if (!rows.length) {
    return `<div class="empty-state compact-empty">Standings will appear after the first result is finalized.</div>`;
  }
  return `
    <div class="table-scroll">
      <table class="wc-standings-table">
        <thead>
          <tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>
                <div class="wc-standing-team">
                  ${renderTeamFlag(row.teamCode, row.teamName, { compact: true })}
                  <span class="wc-standing-name">${escapeHtml(row.teamName)}</span>
                </div>
              </td>
              <td>${row.played}</td>
              <td>${row.won}</td>
              <td>${row.drawn}</td>
              <td>${row.lost}</td>
              <td>${row.goalsFor}</td>
              <td>${row.goalsAgainst}</td>
              <td>${formatGoalDifference(row.goalDifference)}</td>
              <td><strong>${row.points}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeaderboard() {
  const league = managedLeague();
  document.querySelector("#matchdayName").textContent = `${league.name} · Standings`;
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>${league.name} Leaderboard</h2><button class="panel-button" id="exportCsv">Export CSV</button></div>
      ${renderStandingsTable(league.standings)}
    </section>
  `;
}

function renderRules() {
  document.querySelector("#matchdayName").textContent = "Game Rules";
  root.innerHTML = `
    <section class="panel rules-panel">
      <div class="panel-head"><h2>Game Rules</h2><span class="label">World Cup friends league</span></div>
      <div class="rules-section">
        <h3>English</h3>
        <p>Use the left menu to move through the game:</p>
        <ul>
          <li><strong>Rules</strong>: read the game guide and scoring rules.</li>
          <li><strong>Player</strong>: submit your matchday prediction cards and exact final score.</li>
          <li><strong>Matchups</strong>: see your scheduled head-to-head contests for the season.</li>
          <li><strong>Leaderboard</strong>: see standings for the league you participate in.</li>
          <li><strong>Account</strong>: update your display name or password.</li>
        </ul>
        <p>To submit a matchday result prediction:</p>
        <ol>
          <li>Go to <strong>Player</strong> and choose the matchday from <strong>All Matchdays</strong>.</li>
          <li>Select at least <strong>5</strong> prediction cards, up to all <strong>12</strong>.</li>
          <li>Answer each selected card with <strong>Yes</strong> or <strong>No</strong>.</li>
          <li>Choose the exact-score match, then set the final score using the score controls or score list.</li>
          <li>Click <strong>Submit Picks</strong>. After submission, the calendar shows <strong>Submitted</strong>.</li>
        </ol>
        <p>Submit before the first kickoff. Once a matchday is locked, it shows <strong>Locked</strong> and picks cannot be changed.</p>
        <p>Every selected card scores <strong>+10</strong> when correct and <strong>-10</strong> when incorrect. The exact-score pick scores <strong>5 x odds multiplier</strong> only when it is exactly correct.</p>
        <p>Matchup winners receive <strong>3 league points</strong>; draws receive <strong>1</strong>. Finalized matchup points stay in standings when future matchups are shuffled.</p>
      </div>
      <div class="rules-section translated">
        <h3>Tiếng Việt</h3>
        <p>Dùng menu bên trái để di chuyển trong trò chơi:</p>
        <ul>
          <li><strong>Rules</strong>: đọc hướng dẫn và luật tính điểm.</li>
          <li><strong>Player</strong>: nộp thẻ dự đoán trong ngày thi đấu và dự đoán tỉ số cuối cùng.</li>
          <li><strong>Matchups</strong>: xem các trận đối đầu của bạn trong mùa giải.</li>
          <li><strong>Leaderboard</strong>: xem bảng xếp hạng của league bạn đang tham gia.</li>
          <li><strong>Account</strong>: cập nhật tên hiển thị hoặc mật khẩu.</li>
        </ul>
        <p>Cách nộp dự đoán cho một ngày thi đấu:</p>
        <ol>
          <li>Vào tab <strong>Player</strong> và chọn ngày thi đấu trong phần <strong>All Matchdays</strong>.</li>
          <li>Chọn ít nhất <strong>5</strong> thẻ dự đoán, tối đa <strong>12</strong> thẻ.</li>
          <li>Trả lời từng thẻ đã chọn bằng <strong>Yes</strong> hoặc <strong>No</strong>.</li>
          <li>Chọn trận để dự đoán tỉ số chính xác, sau đó chỉnh tỉ số cuối cùng bằng nút tăng/giảm hoặc danh sách tỉ số.</li>
          <li>Bấm <strong>Submit Picks</strong>. Sau khi nộp thành công, lịch sẽ hiện <strong>Submitted</strong>.</li>
        </ol>
        <p>Hãy nộp trước giờ bóng lăn trận đầu tiên. Khi ngày thi đấu đã khóa, lịch sẽ hiện <strong>Locked</strong> và bạn không thể đổi lựa chọn.</p>
        <p>Mỗi thẻ đã chọn được <strong>+10</strong> điểm nếu đúng và <strong>-10</strong> điểm nếu sai. Dự đoán tỉ số chính xác chỉ có điểm khi đúng tuyệt đối, với công thức <strong>5 x hệ số odds</strong>.</p>
        <p>Người thắng matchup nhận <strong>3 điểm league</strong>; hòa nhận <strong>1 điểm</strong>. Điểm của matchup đã finalize sẽ được giữ trong bảng xếp hạng dù lịch matchup tương lai được shuffle.</p>
      </div>
    </section>
  `;
}

function renderContest(summary = selectedMatchday()) {
  const contest = getPrimaryMatchup(summary) ||
    state.data.contests.find((item) => item.participants.some((part) => part.userId === state.data.currentUser.id));
  if (!contest) return `<p class="muted">Generate matchups for this matchday to show the scheduled contest.</p>`;
  return renderContestRow(contest);
}

function renderContestRow(contest, options = {}) {
  const a = contest.participants.filter((part) => part.side === "A").map((part) => part.user?.displayName || part.userId);
  const b = contest.participants.filter((part) => part.side === "B").map((part) => part.user?.displayName || part.userId);
  const matchdayLabel = options.matchday ? `${formatDate(options.matchday.date)} · ${options.matchday.name}` : "";
  const contestShapeLabel = formatContestShape(contest);
  return `
    <div class="contest">
      <div class="contest-row-head">
        <strong>${matchdayLabel || contestShapeLabel}</strong>
        <span class="status-pill ${contest.status.toLowerCase()}">${contestShapeLabel} · ${contest.status}</span>
      </div>
      <div class="contest-sides">
        <div class="contest-side"><span>A</span><strong>${a.join(" + ") || "Side A"}</strong></div>
        <div class="contest-vs">vs</div>
        <div class="contest-side"><span>B</span><strong>${b.join(" + ") || "Bye"}</strong></div>
      </div>
      <span class="muted">${formatScoreValue(contest.participantAScore)} - ${formatScoreValue(contest.participantBScore)}${contest.result ? ` · ${contest.result.replace("_", " ")}` : ""}</span>
    </div>
  `;
}

function renderPairingModeOptions(selected) {
  return Object.entries(PAIRING_MODE_LABELS).map(([mode, label]) => (
    `<option value="${mode}" ${mode === selected ? "selected" : ""}>${label}</option>`
  )).join("");
}

function renderUserRoleOptions(selected) {
  return ["PLAYER", "ADMIN"].map((role) => (
    `<option value="${role}" ${role === selected ? "selected" : ""}>${formatUserRole(role)}</option>`
  )).join("");
}

function formatPairingMode(mode) {
  return PAIRING_MODE_LABELS[mode] || mode || "Mixed";
}

function formatUserRole(role) {
  return role === "ADMIN" ? "Admin" : "Player";
}

function formatContestShape(contest) {
  const aCount = contest.participants.filter((part) => part.side === "A").length;
  const bCount = contest.participants.filter((part) => part.side === "B").length;
  if (aCount && bCount) return `${aCount}v${bCount}`;
  return formatPairingMode(contest.mode);
}

function formatContestModeSummary(contests, fallback = "MIXED") {
  const shapes = [...new Set(contests.map(formatContestShape).filter(Boolean))];
  if (!shapes.length) return formatPairingMode(fallback);
  return shapes.join(" / ");
}

function playerSeasonMatchups() {
  const userId = state.data.currentUser.id;
  return state.data.matchdaySummaries
    .filter((summary) => summary.userContest?.participants.some((part) => part.userId === userId));
}

function renderPlayerSeasonMatchups() {
  const matchups = playerSeasonMatchups();
  if (!matchups.length) return `<p class="muted">No season matchups have been generated yet.</p>`;
  return `<div class="contest-list season-matchups">${matchups.map((summary) => renderContestRow(summary.userContest, { matchday: summary })).join("")}</div>`;
}

function getPrimaryMatchup(summary = selectedMatchday()) {
  if (!summary) return null;
  const matchupId = summary.matchupAssignment?.matchupId || summary.userContestId || summary.userContest?.id;
  return summary.userContest ||
    (matchupId ? summary.contests?.find((contest) => contest.id === matchupId) : null) ||
    null;
}

function getMatchupSideDisplay(contest, userId, fallbackUserName = "You") {
  if (!contest?.participants?.length) {
    return {
      userSide: "A",
      opponentSide: "B",
      userParts: [],
      opponentParts: [],
      userLabel: fallbackUserName,
      opponentLabel: "Your matchup assignment is pending"
    };
  }

  const userSide = contest.participants.find((part) => part.userId === userId)?.side || "A";
  const opponentSide = userSide === "A" ? "B" : "A";
  const userParts = contest.participants.filter((part) => part.side === userSide);
  const opponentParts = contest.participants.filter((part) => part.side === opponentSide);
  return {
    userSide,
    opponentSide,
    userParts,
    opponentParts,
    userLabel: formatMatchupSideLabel(userParts, fallbackUserName),
    opponentLabel: formatMatchupSideLabel(opponentParts, "Bye")
  };
}

function getProjectedMatchupDisplay(contest, userId, currentUserProjection) {
  const sideDisplay = getMatchupSideDisplay(contest, userId, state.data.currentUser?.displayName || "You");
  if (!contest) {
    return {
      ...sideDisplay,
      userScore: currentUserProjection,
      opponentScore: 0
    };
  }
  return {
    ...sideDisplay,
    userScore: normalizedProjectedSideScore(sideDisplay.userParts, sideDisplay.opponentParts, userId, currentUserProjection),
    opponentScore: normalizedProjectedSideScore(sideDisplay.opponentParts, sideDisplay.userParts, userId, currentUserProjection)
  };
}

function getFinalMatchupDisplay(contest, userId) {
  const sideDisplay = getMatchupSideDisplay(contest, userId, state.data.currentUser?.displayName || "You");
  return {
    ...sideDisplay,
    userScore: sideDisplay.userSide === "A" ? contest?.participantAScore || 0 : contest?.participantBScore || 0,
    opponentScore: sideDisplay.opponentSide === "A" ? contest?.participantAScore || 0 : contest?.participantBScore || 0
  };
}

function normalizedProjectedSideScore(parts, opposingParts, userId, currentUserProjection) {
  if (!parts.length) return 0;
  const rawScore = parts.reduce((sum, part) => {
    const score = part.userId === userId ? currentUserProjection : part.projectedScore;
    return sum + Number(score || 0);
  }, 0);
  const playerBaseline = Math.max(parts.length, opposingParts.length || parts.length);
  return Number((rawScore * (playerBaseline / parts.length)).toFixed(1));
}

function formatMatchupSideLabel(parts, fallback) {
  const names = parts.map(participantName).filter(Boolean);
  if (!names.length) return fallback;
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} +${names.length - 2}`;
}

function participantName(part) {
  return part.user?.displayName || part.userId;
}

function visibleContestsForUser(contests) {
  return isAdmin() ? contests : contests.filter(contestIncludesCurrentUser);
}

function contestIncludesCurrentUser(contest) {
  return contest.participants.some((part) => part.userId === state.data.currentUser.id);
}

function formatScoreValue(value) {
  const score = Number(value || 0);
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function renderStandingsTable(rows) {
  return `
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>Fantasy</th><th>Accuracy</th><th>Diff</th></tr></thead>
      <tbody>${rows.map((row, index) => `
        <tr class="${row.userId === "user_you" ? "you-row" : ""}">
          <td>${index + 1}</td><td>${row.displayName}</td><td>${row.leaguePoints}</td><td>${row.fantasyPointsFor}</td><td>${row.cardAccuracy}%</td><td>${row.scoreDifference}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function getExactOdds(matchId) {
  const matchdayId = matchdayIdForMatch(matchId);
  const odds = state.matchdayOdds.get(matchdayId) || [];
  return odds
    .filter((odd) => odd.tournamentMatchId === matchId)
    .sort(compareScoreOdds);
}

function renderScoreSelectOptions(exactOdds, selectedScore, displayOdd) {
  if (!exactOdds.length) return `<option value="">No score odds available</option>`;
  const listedOdd = getExactOddForScore(exactOdds, selectedScore);
  const otherOption = !listedOdd && displayOdd
    ? `<option value="${selectedScore}" selected>Other score ${selectedScore} · ${displayOdd.priceDecimal.toFixed(1)}x</option>`
    : "";
  const groups = new Map();
  exactOdds.forEach((odd) => {
    const score = parseScoreValue(odd.outcomeName);
    const home = score ? score.home : "Other";
    if (!groups.has(home)) groups.set(home, []);
    groups.get(home).push(odd);
  });

  return otherOption + [...groups.entries()].map(([home, odds]) => `
    <optgroup label="${home} home goals">
      ${odds.map((odd) => `
        <option value="${odd.outcomeName}" ${odd.outcomeName === selectedScore ? "selected" : ""}>
          ${odd.outcomeName} · ${odd.priceDecimal.toFixed(1)}x
        </option>
      `).join("")}
    </optgroup>
  `).join("");
}

function getActiveExactOdd(exactOdds) {
  const scoreOdds = withOtherExactOdd(exactOdds);
  return getExactOddForScore(scoreOdds, scoreKey(normalizeScoreState(state.score))) || getOtherExactOdd(scoreOdds);
}

function getExactOddForScore(exactOdds, score) {
  return exactOdds.find((odd) => odd.outcomeName === score) || null;
}

function getOtherExactOdd(exactOdds) {
  return getExactOddForScore(exactOdds, "5-5") || null;
}

function withOtherExactOdd(exactOdds) {
  if (getExactOddForScore(exactOdds, "5-5")) return exactOdds;
  return [...exactOdds, {
    outcomeName: "5-5",
    priceDecimal: DEFAULT_OTHER_SCORE_MULTIPLIER
  }].sort(compareScoreOdds);
}

function compareScoreOdds(a, b) {
  const left = parseScoreValue(a.outcomeName);
  const right = parseScoreValue(b.outcomeName);
  if (!left || !right) return String(a.outcomeName).localeCompare(String(b.outcomeName));
  return left.home - right.home || left.away - right.away;
}

function parseScoreValue(value) {
  const match = String(value || "").match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  return {
    home: Number(match[1]),
    away: Number(match[2])
  };
}

function scoreKey(score) {
  const normalized = normalizeScoreState(score);
  return `${normalized.home}-${normalized.away}`;
}

function normalizeScoreState(score, fallback = { home: 2, away: 1 }) {
  const home = Number(score?.home);
  const away = Number(score?.away);
  return {
    home: Number.isInteger(home) && home >= 0 ? Math.min(12, home) : fallback.home,
    away: Number.isInteger(away) && away >= 0 ? Math.min(12, away) : fallback.away
  };
}

function setScore(score) {
  state.score = normalizeScoreState(score);
}

function groupMatchdaysByCalendarMonth(matchdays) {
  const months = new Map();
  matchdays.forEach((matchday) => {
    const date = new Date(`${matchday.date}T00:00:00`);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: date.toLocaleDateString([], { month: "long", year: "numeric" }),
        date,
        matchdays: []
      });
    }
    months.get(key).matchdays.push(matchday);
  });

  return [...months.values()]
    .sort((a, b) => a.date - b.date)
    .map((month) => {
      const byDate = new Map(month.matchdays.map((matchday) => [matchday.date, matchday]));
      const year = month.date.getFullYear();
      const monthIndex = month.date.getMonth();
      const first = new Date(year, monthIndex, 1);
      const last = new Date(year, monthIndex + 1, 0);
      const days = [];

      for (let i = 0; i < first.getDay(); i += 1) {
        days.push({ dayOfMonth: "", matchday: null });
      }

      for (let day = 1; day <= last.getDate(); day += 1) {
        const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        days.push({
          dayOfMonth: day,
          matchday: byDate.get(dateKey) || null
        });
      }

      return { ...month, days };
    });
}

function groupMatchdaysByPhase(matchdays) {
  const groups = new Map();
  matchdays.forEach((matchday) => {
    const key = matchday.phase || matchday.phaseLabel || "matchdays";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: matchday.phaseLabel || "Matchdays",
        sort: matchday.phaseSort || 0,
        matchdays: []
      });
    }
    groups.get(key).matchdays.push(matchday);
  });

  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map((group) => ({
      ...group,
      matchdays: group.matchdays.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    }));
}

function cardDisplayNumber(card) {
  if (Number.isFinite(Number(card.displayIndex))) return Number(card.displayIndex);
  const match = String(card.id || "").match(/_(\d+)$/);
  return match ? Number(match[1]) : "-";
}

function estimateMultiplier() {
  const selectedMatch = selectedMatchday()?.matches.find((match) => match.id === state.selectedMatchId);
  const score = normalizeScoreState(state.score);
  const total = score.home + score.away;
  let base = score.home === score.away ? 3.4 : score.home > score.away ? 1.7 : 4.8;
  if (total <= 1) base += 0.2;
  if (total >= 4) base += 0.3;
  return Math.min(8, Math.max(1, Number(base.toFixed(1)))) || (selectedMatch ? 2.2 : 1);
}

function exactScoreBoostPoints(multiplier) {
  return Number((Number(multiplier || 0) * EXACT_SCORE_POINTS_MULTIPLIER).toFixed(1));
}

function estimateProjectedScore(exactScoreBoost = 0) {
  const selectedCards = [...state.dirtyCards.values()].filter((card) => card.selected).length;
  if (!selectedCards) return 0;
  return Number((selectedCards * CARD_POINTS_CORRECT + exactScoreBoost).toFixed(1));
}

function formatCountdown(lockAt) {
  const diff = Math.max(0, new Date(lockAt).getTime() - Date.now());
  const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderTeamFlag(teamCode, teamName, options = {}) {
  const displayCode = String(teamCode || "TBD").toUpperCase();
  const safeCode = escapeHtml(displayCode);
  const safeName = escapeHtml(teamName || displayCode);
  const flagCode = flagImageCodeForTeam(teamCode, teamName);
  const classes = ["team-flag"];
  if (options.side) classes.push(String(options.side).replace(/[^a-z-]/g, ""));
  if (options.compact) classes.push("compact");
  const image = flagCode
    ? `<img src="https://flagcdn.com/${flagCode}.svg" alt="${safeName} flag" loading="lazy" decoding="async" onerror="this.hidden=true" />`
    : "";
  return `<span class="${classes.join(" ")}" title="${safeName}">${image}<strong>${safeCode}</strong></span>`;
}

function flagImageCodeForTeam(teamCode, teamName) {
  const code = String(teamCode || "").trim().toUpperCase();
  if (FLAG_CODE_BY_TEAM_CODE[code]) return FLAG_CODE_BY_TEAM_CODE[code];
  const nameKey = String(teamName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (FLAG_CODE_BY_TEAM_NAME[nameKey]) return FLAG_CODE_BY_TEAM_NAME[nameKey];
  const directCode = code.toLowerCase();
  if (/^[a-z]{2}$/.test(directCode) || /^gb-[a-z]{3}$/.test(directCode)) return directCode;
  return "";
}

function buildTournamentStandings(matches) {
  const teams = new Map();
  const ensureTeam = (teamCode, teamName) => {
    const key = teamCode || teamName || "TBD";
    if (!teams.has(key)) {
      teams.set(key, {
        teamCode: teamCode || key,
        teamName: teamName || teamCode || "TBD",
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    }
    return teams.get(key);
  };

  matches.filter(isCompletedMatch).forEach((match) => {
    const home = ensureTeam(match.homeTeamCode, match.homeTeam);
    const away = ensureTeam(match.awayTeamCode, match.awayTeam);
    const homeScore = scoreNumber(match.homeScore);
    const awayScore = scoreNumber(match.awayScore);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (awayScore > homeScore) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  return [...teams.values()]
    .map((team) => ({
      ...team,
      goalDifference: team.goalsFor - team.goalsAgainst
    }))
    .sort((a, b) => (
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName)
    ));
}

function compareMatchesByKickoff(a, b) {
  return matchKickoffTime(a) - matchKickoffTime(b);
}

function matchKickoffTime(match) {
  const timestamp = new Date(match?.kickoffAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isCompletedMatch(match) {
  return match?.status === "FINISHED" && hasScoreValue(match.homeScore) && hasScoreValue(match.awayScore);
}

function hasScoreValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function scoreNumber(value) {
  return hasScoreValue(value) ? Number(value) : 0;
}

function formatMatchScore(value) {
  return hasScoreValue(value) ? String(Number(value)) : "-";
}

function formatGoalDifference(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function matchdayIdForMatch(matchId) {
  return (state.data?.matchdaySummaries || []).find((matchday) => (
    matchday.matches?.some((match) => match.id === matchId)
  ))?.id || selectedMatchday()?.id || "";
}

async function ensureMatchdayOdds(matchDayId) {
  if (!matchDayId || state.matchdayOdds.has(matchDayId)) return;
  const result = await api.getMatchdayOdds(matchDayId);
  state.matchdayOdds.set(result.matchDayId, result.correctScoreOdds || []);
}

async function ensureWc26Data() {
  if (state.wc26Data) return state.wc26Data;
  if (!state.wc26LoadPromise) {
    state.wc26LoadPromise = api.getWc26Update()
      .then((data) => {
        state.wc26Data = data;
        return data;
      })
      .finally(() => {
        state.wc26LoadPromise = null;
      });
  }
  return state.wc26LoadPromise;
}

function resetRouteDataCaches() {
  state.matchdayOdds.clear();
  state.wc26Data = null;
  state.wc26LoadPromise = null;
}

function selectedMatchday() {
  const summaries = state.data?.matchdaySummaries || [];
  return summaries.find((matchday) => matchday.id === state.selectedMatchdayId) ||
    summaries.find((matchday) => matchday.id === state.data?.todayMatchdayId) ||
    summaries[0] ||
    null;
}

function submissionCheckForMatchday(matchDayId) {
  return (state.data?.submissionChecks || []).find((check) => check.matchDayId === matchDayId) || null;
}

function calendarDayStatusLabel(matchday) {
  if (!matchday) return "";
  if (!isAdmin()) {
    if (hasSubmittedMatchday(matchday)) return "Submitted";
    if (isMatchdayLocked(matchday)) return "Locked";
  }
  return matchday.isToday ? "Today" : matchday.status;
}

function hasSubmittedMatchday(matchday) {
  return Boolean(matchday?.scorePrediction?.submittedAt && (matchday.selectedCards || []).length >= MIN_SELECTED_CARDS);
}

function normalizeSelectedMatchday() {
  const summaries = state.data?.matchdaySummaries || [];
  if (!summaries.length) return null;
  const selected = summaries.find((matchday) => matchday.id === state.selectedMatchdayId);
  const today = summaries.find((matchday) => matchday.id === state.data.todayMatchdayId);
  const selectedIsStaleActiveDay = selected && today &&
    selected.date < (state.data.todayDate || todayKey()) &&
    selected.status !== "FINAL";
  if (!selected || selectedIsStaleActiveDay) {
    state.selectedMatchdayId = state.data.todayMatchdayId || summaries[0].id;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
  }
  return selectedMatchday();
}

function applyMatchdaySelectionState() {
  const summary = normalizeSelectedMatchday();
  if (!summary) return;
  const saved = summary.scorePrediction;
  state.selectedMatchId = saved?.tournamentMatchId || summary.matches[0]?.id || null;
  if (saved) {
    setScore({ home: saved.predictedHomeScore, away: saved.predictedAwayScore });
  } else {
    const firstOdd = state.selectedMatchId ? getExactOdds(state.selectedMatchId)[0] : null;
    setScore(parseScoreValue(firstOdd?.outcomeName));
  }
  state.dirtyCards = new Map(summary.playerCards.map((playerCard) => [playerCard.predictionCardId, {
    selected: playerCard.selected,
    answer: playerCard.playerAnswer || playerCard.card?.expectedAnswer || "YES"
  }]));
}

function syncHydratedState() {
  if (!state.data) return;
  if (!state.data.leagues.some((league) => league.id === state.managedLeagueId)) {
    state.managedLeagueId = state.data.league.id;
    localStorage.setItem("pitchpick-managed-league-id", state.managedLeagueId);
  }
  applyMatchdaySelectionState();
  const summary = selectedMatchday();
  document.querySelector("#leagueName").textContent = state.data.league.name;
  document.querySelector("#matchdayName").textContent = `${summary?.name || state.data.matchday.name} · ${summary?.status || state.data.matchday.status}`;
}

function mutateCard(cardId, patch) {
  const current = state.dirtyCards.get(cardId) || { selected: false, answer: null };
  state.dirtyCards.set(cardId, { ...current, ...patch });
  render();
}

function defaultAnswerForCard(cardId) {
  const playerCard = selectedMatchday()?.playerCards.find((card) => card.predictionCardId === cardId);
  return playerCard?.card?.expectedAnswer || "YES";
}

root.addEventListener("click", async (event) => {
  const matchdayButton = event.target.closest("[data-matchday-id]");
  if (matchdayButton) {
    state.selectedMatchdayId = matchdayButton.dataset.matchdayId;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
    applyMatchdaySelectionState();
    await ensureMatchdayOdds(state.selectedMatchdayId);
    applyMatchdaySelectionState();
    render();
    return;
  }

  const demo = event.target.closest("[data-demo-login]");
  if (demo) {
    const email = demo.dataset.demoLogin === "admin" ? "admin" : "user";
    const password = demo.dataset.demoLogin === "admin" ? "admin123" : "player123";
    await doLogin(email, password);
    return;
  }

  const routeButton = event.target.closest("[data-route-click]");
  if (routeButton) {
    if (ADMIN_ROUTES.has(routeButton.dataset.routeClick) && !isAdmin()) return showToast("Admin access required.");
    state.route = routeButton.dataset.routeClick;
    render();
    return;
  }

  const cardEl = event.target.closest(".prediction-card");
  const answerButton = event.target.closest("[data-answer]");
  if (cardEl?.dataset.cardId && answerButton) {
    if (isMatchdayLocked(selectedMatchday())) return showToast("This matchday auto-locked at first kickoff.");
    const cardId = cardEl.dataset.cardId;
    const current = state.dirtyCards.get(cardId);
    if (!current.selected) {
      const selectedCount = [...state.dirtyCards.values()].filter((card) => card.selected).length;
      if (selectedCount >= MAX_SELECTED_CARDS) return showToast(`You can select up to ${MAX_SELECTED_CARDS} cards.`);
    }
    mutateCard(cardId, { selected: true, answer: answerButton.dataset.answer });
    return;
  }

  if (cardEl?.dataset.cardId) {
    if (isMatchdayLocked(selectedMatchday())) return showToast("This matchday auto-locked at first kickoff.");
    const cardId = cardEl.dataset.cardId;
    const current = state.dirtyCards.get(cardId);
    if (current.selected) mutateCard(cardId, { selected: false, answer: null });
    else {
      const selectedCount = [...state.dirtyCards.values()].filter((card) => card.selected).length;
      if (selectedCount >= MAX_SELECTED_CARDS) return showToast(`You can select up to ${MAX_SELECTED_CARDS} cards.`);
      mutateCard(cardId, { selected: true, answer: defaultAnswerForCard(cardId) });
    }
    return;
  }

  const scoreStep = event.target.closest("[data-score-team]");
  if (scoreStep) {
    if (isMatchdayLocked(selectedMatchday())) return showToast("This matchday auto-locked at first kickoff.");
    const team = scoreStep.dataset.scoreTeam;
    const delta = Number(scoreStep.dataset.delta);
    const currentScore = normalizeScoreState(state.score);
    setScore({ ...currentScore, [team]: currentScore[team] + delta });
    render();
    return;
  }

  const scoreChip = event.target.closest("[data-score-chip]");
  if (scoreChip) {
    if (isMatchdayLocked(selectedMatchday())) return showToast("This matchday auto-locked at first kickoff.");
    setScore(parseScoreValue(scoreChip.dataset.scoreChip));
    render();
    return;
  }

  const fixture = event.target.closest("[data-match-id]");
  if (fixture) {
    state.selectedMatchId = fixture.dataset.matchId;
    const firstOdd = getExactOdds(state.selectedMatchId)[0];
    setScore(parseScoreValue(firstOdd?.outcomeName));
    render();
    return;
  }

  if (event.target.closest("#submitPicks")) {
    await submitPicks();
    return;
  }

  const adminAction = event.target.closest("[data-admin-action]");
  if (adminAction) {
    if (!isAdmin()) return showToast("Admin access required.");
    await runAdminAction(adminAction.dataset.adminAction, adminAction.dataset);
    return;
  }

  const memberAction = event.target.closest("[data-member-action]");
  if (memberAction) {
    if (!isAdmin()) return showToast("Admin access required.");
    await mutate("/api/admin/update-member-status", {
      leagueId: managedLeague().id,
      userId: memberAction.dataset.memberUserId,
      status: memberAction.dataset.memberAction
    }, "Member updated.");
    return;
  }

  if (event.target.closest("#exportCsv")) {
    try {
      await downloadStandingsCsv();
    } catch (error) {
      showToast(error.message);
    }
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id === "managedLeagueSelect") {
    state.managedLeagueId = event.target.value;
    localStorage.setItem("pitchpick-managed-league-id", state.managedLeagueId);
    render();
  }

  if (event.target.id === "scoreSelect") {
    if (isMatchdayLocked(selectedMatchday())) {
      showToast("This matchday auto-locked at first kickoff.");
      render();
      return;
    }
    const score = parseScoreValue(event.target.value);
    if (!score) return;
    setScore(score);
    render();
  }
});

root.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = Object.fromEntries(new FormData(form).entries());

  if (form.id === "loginForm") {
    await doLogin(formData.email, formData.password);
    return;
  }

  if (form.id === "accountForm") {
    await mutate("/api/player/update-account", formData, "Account updated.");
    return;
  }

  if (!isAdmin()) {
    showToast("Admin access required.");
    return;
  }

  if (form.id === "createUserForm") {
    await mutate("/api/admin/create-user", formData, "User created.");
  }
  if (form.id === "updateUserForm") {
    await mutate("/api/admin/update-user", formData, "User updated.");
  }
  if (form.id === "createLeagueForm") {
    await mutate("/api/admin/create-league", formData, "League created.", (result) => {
      state.managedLeagueId = result.leagueId;
      localStorage.setItem("pitchpick-managed-league-id", state.managedLeagueId);
    });
  }
  if (form.id === "updateLeagueForm") {
    await mutate("/api/admin/update-league", formData, "League updated.", (result) => {
      state.managedLeagueId = result.leagueId;
      localStorage.setItem("pitchpick-managed-league-id", state.managedLeagueId);
    });
  }
  if (form.id === "addExistingMemberForm") {
    await mutate("/api/admin/add-member", { ...formData, leagueId: managedLeague().id }, "Player added to league.");
  }
  if (form.id === "voidForm") {
    await mutate("/api/admin/void-card", formData, "Card voided.");
  }
});

async function submitPicks() {
  const summary = selectedMatchday();
  if (isMatchdayLocked(summary)) {
    showToast("This matchday auto-locked at first kickoff.");
    return;
  }
  if (!state.selectedMatchId) {
    showToast("No match is available for this matchday yet.");
    return;
  }
  const selectedCardIds = [...state.dirtyCards.entries()].filter(([, value]) => value.selected).map(([cardId]) => cardId);
  if (selectedCardIds.length < MIN_SELECTED_CARDS || selectedCardIds.length > MAX_SELECTED_CARDS) {
    showToast(`Select ${MIN_SELECTED_CARDS} to ${MAX_SELECTED_CARDS} cards.`);
    return;
  }
  const answers = Object.fromEntries([...state.dirtyCards.entries()].map(([cardId, value]) => [cardId, value.answer]));
  const score = normalizeScoreState(state.score);
  await mutate("/api/player/submit-picks", {
    userId: state.data.currentUser.id,
    matchDayId: summary.id,
    selectedCardIds,
    answers,
    scorePrediction: {
      tournamentMatchId: state.selectedMatchId,
      predictedHomeScore: score.home,
      predictedAwayScore: score.away
    }
  }, "Picks submitted.");
}

async function downloadStandingsCsv() {
  const league = managedLeague();
  const csv = await request(`/api/export/standings.csv?leagueId=${encodeURIComponent(league.id)}`);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${league.slug || league.id}-standings.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function runAdminAction(action, options = {}) {
  const summary = selectedMatchday();
  const syncScope = action === "sync-fixtures" || action === "sync-odds" ? "all" : undefined;
  const body = {
    leagueId: managedLeague().id,
    matchDayId: summary?.id || state.data.matchday.id,
    scope: syncScope
  };
  if (options.cardScope) body.scope = options.cardScope;
  if (options.pairingScope) body.scope = options.pairingScope;
  if (action === "generate-pairings" && options.pairingScope === "season") {
    body.pairingMode = document.querySelector("#seasonPairingMode")?.value || managedLeague().pairingMode || "MIXED";
  }
  if (options.shuffle === "true") {
    body.shuffle = true;
    body.shuffleSeed = `${Date.now()}`;
  }
  if (action === "sync-daily-tournament-data") {
    body.date = document.querySelector("#dailySyncDate")?.value || todayKey();
  }
  await mutate(`/api/admin/${action}`, body, action.replaceAll("-", " ") + " complete.");
}

async function mutate(path, body, message, after) {
  try {
    const result = await api.post(path, body);
    after?.(result);
    state.data = result.state;
    resetRouteDataCaches();
    syncHydratedState();
    await ensureMatchdayOdds(selectedMatchday()?.id);
    applyMatchdaySelectionState();
    showToast(result.message || message);
    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function doLogin(email, password) {
  try {
    const result = await api.login(email, password);
    state.userId = result.user.id;
    localStorage.setItem("pitchpick-user-id", state.userId);
    state.data = result.state;
    resetRouteDataCaches();
    state.selectedMatchdayId = result.state.todayMatchdayId;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
    state.route = result.user.role === "ADMIN" ? "admin" : "player";
    syncHydratedState();
    await ensureMatchdayOdds(selectedMatchday()?.id);
    applyMatchdaySelectionState();
    updateChrome();
    render();
    showToast(`Logged in as ${result.user.displayName}.`);
  } catch (error) {
    renderLogin(error.message);
  }
}

function todayKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

function isMatchdayLocked(matchday) {
  if (!matchday) return false;
  return ["LOCKED", "SCORING", "FINAL"].includes(matchday.status) || new Date(matchday.lockAt).getTime() <= Date.now();
}

function managedLeague() {
  return state.data.leagues.find((league) => league.id === state.managedLeagueId) || state.data.leagues[0] || state.data.league;
}

function membersForLeague(leagueId) {
  return state.data.leagueMembers.filter((member) => member.leagueId === leagueId && member.status !== "REMOVED");
}

function availableUsersForLeague(leagueId) {
  const currentMembers = new Set(membersForLeague(leagueId).map((member) => member.userId));
  return state.data.users.filter((user) => user.role === "PLAYER" && !currentMembers.has(user.id));
}

function managedSelectedContests(matchDayId = selectedMatchday()?.id) {
  const leagueId = managedLeague().id;
  return (state.data.seasonContests || state.data.contests)
    .filter((contest) => contest.leagueId === leagueId && contest.matchDayId === matchDayId);
}

function managedSeasonMatchups() {
  const leagueId = managedLeague().id;
  return state.data.matchdaySummaries.flatMap((matchday) => (
    matchday.contests
      .filter((contest) => contest.leagueId === leagueId)
      .map((contest) => ({ contest, matchday }))
  ));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => {
    if (ADMIN_ROUTES.has(button.dataset.route) && !isAdmin()) {
      showToast("Admin access required.");
      return;
    }
    state.route = button.dataset.route;
    render();
  });
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  setTheme(state.theme === "dark" ? "light" : "dark");
});

document.querySelector("#refreshButton").addEventListener("click", async () => {
  await loadState();
  showToast("State refreshed.");
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  localStorage.removeItem("pitchpick-user-id");
  state.userId = null;
  state.data = null;
  resetRouteDataCaches();
  state.route = "player";
  updateChrome();
  renderLogin();
  showToast("Logged out.");
});

setTheme(state.theme);
loadState().catch((error) => {
  root.innerHTML = `<div class="loading">Could not load app: ${error.message}</div>`;
});

window.setInterval(() => {
  if (state.data && state.route === "player") renderPlayer();
}, 1000);
