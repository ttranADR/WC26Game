const api = {
  async getState() {
    return request("/api/state");
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

async function request(path, options = {}) {
  const headers = { "content-type": "application/json" };
  if (state.userId) headers["x-user-id"] = state.userId;
  const response = await fetch(path, {
    headers,
    ...options
  });
  const data = path.endsWith(".csv") ? await response.text() : await response.json();
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
  dirtyCards: new Map()
};

const root = document.querySelector("#appRoot");
const toast = document.querySelector("#toast");

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

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
  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  if (inviteCode) {
    const accepted = await api.post("/api/player/accept-invite", { inviteCode });
    state.userId = accepted.user.id;
    localStorage.setItem("pitchpick-user-id", state.userId);
    state.data = accepted.state;
    state.selectedMatchdayId = accepted.state.todayMatchdayId;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
    window.history.replaceState(null, "", window.location.pathname);
    showToast(accepted.message);
  } else if (!state.userId) {
    renderLogin();
    updateChrome();
    return;
  } else {
    try {
      state.data = await api.getState();
    } catch (error) {
      localStorage.removeItem("pitchpick-user-id");
      state.userId = null;
      renderLogin(error.message);
      updateChrome();
      return;
    }
  }
  syncHydratedState();
  updateChrome();
  render();
}

function render() {
  if (!state.data) {
    renderLogin();
    return;
  }

  if (state.route === "admin" && !isAdmin()) state.route = "player";

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });

  if (state.route === "admin") renderAdmin();
  else if (state.route === "leaderboard") renderLeaderboard();
  else if (state.route === "rules") renderRules();
  else renderPlayer();
}

function renderLogin(error = "") {
  document.querySelector("#leagueName").textContent = "PitchPick";
  document.querySelector("#matchdayName").textContent = "Log in";
  root.innerHTML = `
    <section class="login-screen">
      <form class="login-card" id="loginForm">
        <div>
          <p class="label">Welcome back</p>
          <h1>Log in to PitchPick</h1>
          <p class="muted">Use a seeded demo account, or accept an invite link from email.</p>
        </div>
        ${error ? `<div class="form-error">${error}</div>` : ""}
        <label>
          <span>Email</span>
          <input name="email" type="email" value="you@pitchpick.local" required />
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
        <p class="muted">Admin: admin@pitchpick.local / admin123<br />Player: you@pitchpick.local / player123</p>
      </form>
    </section>
  `;
}

function updateChrome() {
  const loggedIn = Boolean(state.data?.currentUser);
  const admin = isAdmin();
  document.querySelectorAll('[data-route="admin"]').forEach((button) => {
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

  const selected = [...state.dirtyCards.values()].filter((card) => card.selected).length;
  const selectedMatch = summary.matches.find((match) => match.id === state.selectedMatchId) || summary.matches[0];
  const exactOdds = getExactOdds(selectedMatch.id);
  const activeOdd = exactOdds.find((odd) => odd.outcomeName === `${state.score.home}-${state.score.away}`);
  const multiplier = activeOdd?.priceDecimal || estimateMultiplier();
  const potential = Number((multiplier * 5).toFixed(1));
  const yourScore = estimateProjectedScore(multiplier);
  const opponent = findOpponent(summary);

  root.innerHTML = `
    <section class="arena">
      ${renderMatchdayList(summary.id)}
      <div class="hero">
        <div>
              <p class="label">${summary.isToday ? "Today" : summary.phaseLabel || "Matchday"} · ${summary.status}</p>
              <h1>${summary.name}</h1>
              <span class="muted">${summary.matches.length} matches · ${formatDate(summary.date)}</span>
        </div>
        <div class="avatar-score">
          <span class="avatar">${initials(data.currentUser.displayName)}</span>
          <div><span>${data.currentUser.displayName}</span><strong>${yourScore}</strong><small class="muted">Projected</small></div>
        </div>
        <div class="versus">VS</div>
        <div class="avatar-score">
          <span class="avatar blue">${initials(opponent?.displayName || "Maya")}</span>
          <div><span>${opponent?.displayName || "Maya"}</span><strong class="blue-score">72</strong><small class="muted">Projected</small></div>
        </div>
        <div class="lock-card">
          <span class="muted">Locks in</span>
          <strong>${formatCountdown(summary.lockAt)}</strong>
          <small class="muted">Picks lock before first match</small>
        </div>
      </div>

      <div class="workspace">
        <section class="picks-panel">
          <div class="section-head">
            <div>
              <p class="label">Pick ${MIN_SELECTED_CARDS}-${MAX_SELECTED_CARDS} of ${CARD_SET_SIZE}</p>
              <h2>Prediction cards</h2>
              <span class="muted">Correct picks score +10. Incorrect picks score -10.</span>
            </div>
            <div class="meter"><span>${selected} Selected</span><strong>${selected} / ${MAX_SELECTED_CARDS}</strong></div>
          </div>
          <div class="cards-grid">${summary.playerCards.map(renderCard).join("")}</div>
        </section>

        <aside class="right-rail">
          <section class="panel">
            <div class="panel-head">
              <h2>Exact Score Boost</h2>
              <span class="label">API ratios</span>
            </div>
            <div class="score-matchup">
              <span class="flag home">${selectedMatch.homeTeamCode}</span>
              <span>vs</span>
              <span class="flag away">${selectedMatch.awayTeamCode}</span>
            </div>
            <div class="score-controls">
              <div class="score-stack">
                <button class="score-step" data-score-team="home" data-delta="1">+</button>
                <strong>${state.score.home}</strong>
                <button class="score-step" data-score-team="home" data-delta="-1">-</button>
              </div>
              <span> - </span>
              <div class="score-stack">
                <button class="score-step" data-score-team="away" data-delta="1">+</button>
                <strong>${state.score.away}</strong>
                <button class="score-step" data-score-team="away" data-delta="-1">-</button>
              </div>
            </div>
            <div class="score-odds">
              <span>Multiplier</span>
              <strong>${multiplier.toFixed(1)}x</strong>
              <em>${potential} pts</em>
            </div>
            <div class="chips">${exactOdds.map((odd) => `
              <button class="chip ${odd.outcomeName === `${state.score.home}-${state.score.away}` ? "active" : ""}" data-score-chip="${odd.outcomeName}">
                ${odd.outcomeName}<small>${odd.priceDecimal.toFixed(1)}x</small>
              </button>
            `).join("")}</div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Opponent</h2><span class="label">${data.league.pairingMode}</span></div>
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
        ${summary.matches.map((match) => `
          <button class="fixture-button ${match.id === selectedMatch.id ? "active" : ""}" data-match-id="${match.id}">
            <span>${match.homeTeamCode}</span><small>vs</small><span>${match.awayTeamCode}</span><em>${formatTime(match.kickoffAt)}</em>
          </button>
        `).join("")}
        <button class="submit-button" id="submitPicks" ${selected >= MIN_SELECTED_CARDS && selected <= MAX_SELECTED_CARDS ? "" : "disabled"}>Submit Picks</button>
      </div>
    </section>
  `;
}

function renderMatchdayList(activeId) {
  const groups = groupMatchdaysByPhase(state.data.matchdaySummaries);
  return `
    <section class="matchday-strip">
      <div>
        <p class="label">All matchdays</p>
        <strong>${state.data.matchdaySummaries.length} days</strong>
      </div>
      <div class="matchday-list">
        ${groups.map((group) => `
          <div class="phase-group">
            <span>${group.label}</span>
            <div class="phase-days">
              ${group.matchdays.map((matchday) => `
                <button class="matchday-chip ${matchday.id === activeId ? "active" : ""} ${matchday.isToday ? "today" : ""}" data-matchday-id="${matchday.id}">
                  <span>${formatDate(matchday.date)}</span>
                  <small>${matchday.isToday ? "Today" : matchday.status}</small>
                  <em>${matchday.matches.length} matches</em>
                </button>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMatchdayResult(summary) {
  const exactMatch = summary.matches.find((match) => match.id === summary.scorePrediction?.tournamentMatchId);
  root.innerHTML = `
    <section class="arena">
      ${renderMatchdayList(summary.id)}
      <div class="result-hero">
        <div>
          <p class="label">${summary.status}</p>
          <h1>${summary.name} Result</h1>
          <span class="muted">${summary.matches.map((match) => `${match.homeTeamCode} ${match.homeScore}-${match.awayScore} ${match.awayTeamCode}`).join(" · ")}</span>
        </div>
        <div class="result-score ${summary.resultLabel.toLowerCase()}">
          <span>${summary.resultLabel}</span>
          <strong>${summary.userScore} - ${summary.opponentScore}</strong>
          <small>${summary.opponentNames.length ? `vs ${summary.opponentNames.join(" + ")}` : "No opponent assigned"}</small>
        </div>
        <div class="result-breakdown">
          <span><strong>${summary.cardPoints}</strong> card pts</span>
          <span><strong>${summary.exactPoints}</strong> exact pts</span>
          <span><strong>${summary.totalPoints}</strong> total fantasy</span>
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
                <span class="flag home">${exactMatch?.homeTeamCode || "HOME"}</span>
                <span>vs</span>
                <span class="flag away">${exactMatch?.awayTeamCode || "AWAY"}</span>
              </div>
              <div class="score-odds">
                <span>Predicted ${summary.scorePrediction.predictedHomeScore}-${summary.scorePrediction.predictedAwayScore}</span>
                <strong>${summary.scorePrediction.oddsMultiplier.toFixed(1)}x</strong>
                <em>${summary.scorePrediction.pointsAwarded} pts</em>
              </div>
            ` : `<p class="muted">No exact score was submitted.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Contest</h2><span class="label">${summary.userContest?.mode || state.data.league.pairingMode}</span></div>
            ${summary.userContest ? renderContestRow(summary.userContest) : `<p class="muted">No contest was assigned.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Matches</h2><span class="label">Final scores</span></div>
            <div class="contest-list">${summary.matches.map((match) => `
              <div class="log-row"><strong>${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}</strong><span class="muted">${formatTime(match.kickoffAt)} · First goal ${match.firstGoalMinute || "n/a"}'</span></div>
            `).join("")}</div>
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
        <span class="card-number">${playerCard.card.id.replace(/\D+/g, "") || "-"}</span>
        <h3>${playerCard.card.title}</h3>
      </div>
      <p class="card-question">${playerCard.card.questionText}</p>
      <div class="result-pill ${pillClass}">${selected ? playerCard.isCorrect ? "Correct" : "Wrong" : "Not selected"}</div>
      <div class="card-foot"><strong>${playerCard.playerAnswer || "-"}</strong><span>${playerCard.pointsAwarded || 0} pts</span></div>
    </article>
  `;
}

function renderCard(playerCard) {
  const dirty = state.dirtyCards.get(playerCard.predictionCardId) || { selected: false, answer: null };
  const selectedCount = [...state.dirtyCards.values()].filter((card) => card.selected).length;
  const lockedOut = !dirty.selected && selectedCount >= MAX_SELECTED_CARDS;
  return `
    <article class="prediction-card ${dirty.selected ? "selected" : ""} ${lockedOut ? "locked" : ""}" data-card-id="${playerCard.predictionCardId}">
      <div class="card-top">
        <span class="card-number">${playerCard.card.id.replace("card_", "")}</span>
        <h3>${playerCard.card.title}</h3>
      </div>
      <p class="card-question">${playerCard.card.questionText}</p>
      <div class="answer-row">
        <button class="answer-button ${dirty.answer === "YES" ? "yes-active" : ""}" data-answer="YES">Yes</button>
        <button class="answer-button ${dirty.answer === "NO" ? "no-active" : ""}" data-answer="NO">No</button>
      </div>
      <div class="card-foot"><strong>${playerCard.card.estimatedProbability.toFixed(2)} prob</strong><span>+10 / -10</span></div>
    </article>
  `;
}

function renderAdmin() {
  const data = state.data;
  const league = managedLeague();
  const opsMatchday = selectedMatchday() || data.matchday;
  const leagueMembers = membersForLeague(league.id);
  const availableUsers = availableUsersForLeague(league.id);
  const emailOutbox = data.emailOutbox || [];
  root.innerHTML = `
    <section class="admin-layout">
      <div class="admin-grid">
        ${renderLiveDataPanel(data)}

        <section class="panel">
          <div class="panel-head"><h2>Manage Leagues</h2><span class="label">${data.leagues.length} leagues</span></div>
          <form class="admin-form" id="updateLeagueForm">
            <select id="managedLeagueSelect" name="leagueId" aria-label="Select league to manage">
              ${data.leagues.map((item) => `<option value="${item.id}" ${item.id === league.id ? "selected" : ""}>${item.name}</option>`).join("")}
            </select>
            <input name="name" value="${escapeHtml(league.name)}" aria-label="League name" />
            <input name="seasonName" value="${escapeHtml(league.seasonName)}" aria-label="Season name" />
            <select name="pairingMode" aria-label="Pairing mode">
              <option value="SOLO" ${league.pairingMode === "SOLO" ? "selected" : ""}>SOLO</option>
              <option value="DUO" ${league.pairingMode === "DUO" ? "selected" : ""}>DUO</option>
            </select>
            <button class="panel-button primary">Save League</button>
          </form>
          <div class="league-summary">
            <span><strong>${league.memberCount}</strong> members</span>
            <span><strong>${league.activeMemberCount}</strong> active</span>
            <span><strong>${league.invitedMemberCount}</strong> invited</span>
            <span><strong>${league.contestCount}</strong> contests</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Matchday Ops</h2><span class="label">${opsMatchday.status}</span></div>
          <p class="muted">Sync imports tournament data. Card, pairing, lock, score, and finalize target <strong>${opsMatchday.name}</strong> for <strong>${league.name}</strong>.</p>
          <div class="actions">
            <button class="panel-button primary" data-admin-action="sync-fixtures">Sync All Fixtures</button>
            <button class="panel-button primary" data-admin-action="sync-odds">Sync All Odds</button>
            <button class="panel-button" data-admin-action="generate-cards">Generate Cards</button>
            <button class="panel-button" data-admin-action="generate-pairings">Generate Pairings</button>
            <button class="panel-button danger" data-admin-action="lock-matchday">Lock</button>
            <button class="panel-button" data-admin-action="score-matchday">Score</button>
            <button class="panel-button primary" data-admin-action="finalize-matchday">Finalize</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Create League</h2><span class="label">Admin</span></div>
          <form class="admin-form" id="createLeagueForm">
            <input name="name" value="Weekend Rivals" aria-label="League name" />
            <select name="pairingMode" aria-label="Pairing mode">
              <option value="SOLO">SOLO</option>
              <option value="DUO">DUO</option>
            </select>
            <button class="panel-button primary">Create League</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Void Card</h2><span class="label">Safety</span></div>
          <form class="admin-form" id="voidForm">
            <select name="cardId" aria-label="Card to void">
              ${data.playerCards.map((playerCard) => `<option value="${playerCard.card.id}">${playerCard.card.title}</option>`).join("")}
            </select>
            <input name="reason" value="Data unavailable" aria-label="Void reason" />
            <button class="panel-button danger">Void Card</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>League Members</h2><span class="label">${league.name}</span></div>
          <div class="context-banner">
            <strong>Managing: ${league.name}</strong>
            <span>Invites and member changes below apply only to this selected league.</span>
          </div>

          <form class="admin-form" id="inviteForm">
            <input value="Inviting to: ${escapeHtml(league.name)}" aria-label="Invite target league" disabled />
            <input name="displayName" placeholder="Friend name" aria-label="Friend name" required />
            <input name="email" type="email" placeholder="friend@example.com" aria-label="Friend email" required />
            <button class="panel-button primary">Create Invite Link for ${league.name}</button>
          </form>

          <form class="admin-form" id="addExistingMemberForm">
            <select name="userId" aria-label="Existing player to add" ${availableUsers.length ? "" : "disabled"}>
              ${availableUsers.length
                ? availableUsers.map((user) => `<option value="${user.id}">${user.displayName} · ${user.email}</option>`).join("")
                : `<option>No available players outside this league</option>`}
            </select>
            <button class="panel-button" ${availableUsers.length ? "" : "disabled"}>Add Existing Player</button>
          </form>

          <div class="member-list">${leagueMembers.length ? leagueMembers.map(renderMemberRow).join("") : `<p class="muted">No members yet. Invite a friend to ${league.name} to start this league.</p>`}</div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Pairings</h2><span class="label">${managedContests().length} contests</span></div>
          <div class="contest-list">${managedContests().length ? managedContests().map(renderContestRow).join("") : `<p class="muted">Generate pairings for ${league.name} to fill this list.</p>`}</div>
        </section>
      </div>

      <aside class="right-rail">
        <section class="panel">
          <div class="panel-head"><h2>Email Outbox</h2><span class="label">${emailOutbox.length} emails</span></div>
          <div class="contest-list">${emailOutbox.length ? emailOutbox.map((email) => `
            <div class="log-row">
              <strong>${email.status} · ${email.to}</strong>
              <span class="muted">${email.subject}</span>
              <label class="invite-link-row">
                <span>Invite link</span>
                <input value="${email.inviteLink}" readonly />
              </label>
            </div>
          `).join("") : `<p class="muted">Invite emails appear here when you create them. Add RESEND_API_KEY to send real email.</p>`}</div>
        </section>

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

function renderLiveDataPanel(data) {
  const today = new Date().toISOString().slice(0, 10);
  const matchdays = data.matchdays || [];
  const tournamentMatches = data.tournamentMatches || [];
  const oddsSnapshots = data.oddsSnapshots || [];
  const syncLogs = data.syncLogs || [];
  const correctScoreOdds = oddsSnapshots.filter((odd) => odd.marketKey === "CORRECT_SCORE");
  const generatedCorrectScoreOdds = correctScoreOdds.filter((odd) => odd.provider === "pitchpick-generated");
  const lastInitial = syncLogs.find((item) => item.type === "INITIAL_DATA_LOAD");
  const lastDaily = syncLogs.find((item) => item.type === "DAILY_DATA_UPDATE");
  const todayMatchday = matchdays.find((matchday) => matchday.date === today);
  const todayMatches = todayMatchday
    ? tournamentMatches.filter((match) => match.matchDayId === todayMatchday.id)
    : [];

  return `
    <section class="panel live-data-panel">
      <div class="panel-head">
        <h2>Live Data</h2>
        <span class="label">${tournamentMatches.length} matches</span>
      </div>
      <div class="league-summary live-data-summary">
        <span><strong>${matchdays.length}</strong> matchdays</span>
        <span><strong>${tournamentMatches.length}</strong> games</span>
        <span><strong>${oddsSnapshots.length}</strong> odds</span>
        <span><strong>${correctScoreOdds.length}</strong> score odds</span>
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
          <strong>${todayMatches.length} games today</strong>
          <span class="muted">${lastDaily ? new Date(lastDaily.createdAt).toLocaleString() : "No daily update yet"} · ${generatedCorrectScoreOdds.length} generated score odds</span>
        </div>
        <button class="panel-button" data-admin-action="sync-daily-tournament-data">Update Date</button>
      </div>
    </section>
  `;
}

function renderMemberRow(member) {
  const user = state.data.users.find((item) => item.id === member.userId);
  const profile = state.data.profiles.find((item) => item.userId === member.userId);
  const active = member.status === "ACTIVE";
  const inviteLink = member.inviteCode ? `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(member.inviteCode)}` : "";
  return `
    <div class="member-row">
      <div>
        <strong>${user?.displayName || member.userId}</strong>
        <span class="muted">${user?.email || "No email"}${profile ? ` · ${profile.timezone} · ${profile.favoriteTeam}` : ""}</span>
        ${inviteLink ? `
          <label class="invite-link-row">
            <span>Invite link</span>
            <input value="${inviteLink}" readonly />
          </label>
        ` : ""}
      </div>
      <span class="status-pill ${member.status.toLowerCase()}">${member.status}</span>
      <div class="member-actions">
        ${inviteLink ? `<button class="panel-button primary" data-copy-invite="${inviteLink}">Copy Link</button>` : ""}
        <button class="panel-button" data-member-action="${active ? "INVITED" : "ACTIVE"}" data-member-user-id="${member.userId}">
          ${active ? "Mark Invited" : "Mark Active"}
        </button>
        <button class="panel-button danger" data-member-action="REMOVED" data-member-user-id="${member.userId}">Remove</button>
      </div>
    </div>
  `;
}

function renderLeaderboard() {
  const league = managedLeague();
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>${league.name} Leaderboard</h2><button class="panel-button" id="exportCsv">Export CSV</button></div>
      ${renderStandingsTable(league.standings)}
    </section>
  `;
}

function renderRules() {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Game Rules</h2><span class="label">World Cup friends league</span></div>
      <p>Each player receives 12 prediction cards each matchday and must select at least 5, up to all 12.</p>
      <p>Every selected card scores <strong>+10</strong> when correct and <strong>-10</strong> when incorrect.</p>
      <p>Players also submit one exact final score. If it is correct, exact-score points equal <strong>5 x odds multiplier</strong>.</p>
      <p>Admin can sync fixtures and odds, generate cards, generate deterministic pairings, lock submissions, score, finalize, void cards, and export standings.</p>
    </section>
  `;
}

function renderContest(summary = selectedMatchday()) {
  const contest = summary?.userContest ||
    state.data.contests.find((item) => item.participants.some((part) => part.userId === state.data.currentUser.id));
  if (!contest) return `<p class="muted">No contest assigned yet.</p>`;
  return `<div class="contest">${renderContestRow(contest)}</div>`;
}

function renderContestRow(contest) {
  const a = contest.participants.filter((part) => part.side === "A").map((part) => part.user.displayName).join(" + ");
  const b = contest.participants.filter((part) => part.side === "B").map((part) => part.user.displayName).join(" + ") || "Bye";
  return `<strong>${a} vs ${b}</strong><span class="muted">${contest.status} · ${contest.participantAScore} - ${contest.participantBScore}</span>`;
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
  return state.data.correctScoreOdds
    .filter((odd) => odd.tournamentMatchId === matchId)
    .sort((a, b) => a.priceDecimal - b.priceDecimal);
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

function estimateMultiplier() {
  const selectedMatch = selectedMatchday()?.matches.find((match) => match.id === state.selectedMatchId);
  const total = state.score.home + state.score.away;
  let base = state.score.home === state.score.away ? 3.4 : state.score.home > state.score.away ? 1.7 : 4.8;
  if (total <= 1) base += 0.2;
  if (total >= 4) base += 0.3;
  return Math.min(8, Math.max(1, Number(base.toFixed(1)))) || (selectedMatch ? 2.2 : 1);
}

function estimateProjectedScore(multiplier) {
  const selectedCards = [...state.dirtyCards.values()].filter((card) => card.selected).length;
  const yesAnswers = [...state.dirtyCards.values()].filter((card) => card.selected && card.answer === "YES").length;
  return Math.round(38 + selectedCards * 3 + yesAnswers * 2 + multiplier * 1.8);
}

function findOpponent(summary = selectedMatchday()) {
  const contest = summary?.userContest ||
    state.data.contests.find((item) => item.participants.some((part) => part.userId === state.data.currentUser.id));
  return contest?.participants.find((part) => part.userId !== state.data.currentUser.id)?.user;
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

function selectedMatchday() {
  const summaries = state.data?.matchdaySummaries || [];
  return summaries.find((matchday) => matchday.id === state.selectedMatchdayId) ||
    summaries.find((matchday) => matchday.id === state.data?.todayMatchdayId) ||
    summaries[0] ||
    null;
}

function normalizeSelectedMatchday() {
  const summaries = state.data?.matchdaySummaries || [];
  if (!summaries.length) return null;
  const exists = summaries.some((matchday) => matchday.id === state.selectedMatchdayId);
  if (!exists) {
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
    state.score = { home: saved.predictedHomeScore, away: saved.predictedAwayScore };
  } else {
    const firstOdd = state.selectedMatchId ? getExactOdds(state.selectedMatchId)[0] : null;
    if (firstOdd) {
      const [home, away] = firstOdd.outcomeName.split("-").map(Number);
      state.score = { home, away };
    } else {
      state.score = { home: 2, away: 1 };
    }
  }
  state.dirtyCards = new Map(summary.playerCards.map((playerCard) => [playerCard.predictionCardId, {
    selected: playerCard.selected,
    answer: playerCard.playerAnswer
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

root.addEventListener("click", async (event) => {
  const matchdayButton = event.target.closest("[data-matchday-id]");
  if (matchdayButton) {
    state.selectedMatchdayId = matchdayButton.dataset.matchdayId;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
    applyMatchdaySelectionState();
    render();
    return;
  }

  const demo = event.target.closest("[data-demo-login]");
  if (demo) {
    const email = demo.dataset.demoLogin === "admin" ? "admin@pitchpick.local" : "you@pitchpick.local";
    const password = demo.dataset.demoLogin === "admin" ? "admin123" : "player123";
    await doLogin(email, password);
    return;
  }

  const routeButton = event.target.closest("[data-route-click]");
  if (routeButton) {
    state.route = routeButton.dataset.routeClick;
    render();
    return;
  }

  const cardEl = event.target.closest(".prediction-card");
  const answerButton = event.target.closest("[data-answer]");
  if (cardEl?.dataset.cardId && answerButton) {
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
    const cardId = cardEl.dataset.cardId;
    const current = state.dirtyCards.get(cardId);
    if (current.selected) mutateCard(cardId, { selected: false, answer: null });
    else {
      const selectedCount = [...state.dirtyCards.values()].filter((card) => card.selected).length;
      if (selectedCount >= MAX_SELECTED_CARDS) return showToast(`You can select up to ${MAX_SELECTED_CARDS} cards.`);
      mutateCard(cardId, { selected: true, answer: "YES" });
    }
    return;
  }

  const scoreStep = event.target.closest("[data-score-team]");
  if (scoreStep) {
    const team = scoreStep.dataset.scoreTeam;
    const delta = Number(scoreStep.dataset.delta);
    state.score[team] = Math.max(0, Math.min(12, state.score[team] + delta));
    render();
    return;
  }

  const scoreChip = event.target.closest("[data-score-chip]");
  if (scoreChip) {
    const [home, away] = scoreChip.dataset.scoreChip.split("-").map(Number);
    state.score = { home, away };
    render();
    return;
  }

  const fixture = event.target.closest("[data-match-id]");
  if (fixture) {
    state.selectedMatchId = fixture.dataset.matchId;
    const firstOdd = getExactOdds(state.selectedMatchId)[0];
    if (firstOdd) {
      const [home, away] = firstOdd.outcomeName.split("-").map(Number);
      state.score = { home, away };
    }
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
    await runAdminAction(adminAction.dataset.adminAction);
    return;
  }

  const memberAction = event.target.closest("[data-member-action]");
  if (memberAction) {
    await mutate("/api/admin/update-member-status", {
      leagueId: managedLeague().id,
      userId: memberAction.dataset.memberUserId,
      status: memberAction.dataset.memberAction
    }, "Member updated.");
    return;
  }

  const copyInvite = event.target.closest("[data-copy-invite]");
  if (copyInvite) {
    await copyText(copyInvite.dataset.copyInvite);
    showToast("Invite link copied.");
    return;
  }

  if (event.target.closest("#exportCsv")) {
    window.location.href = `/api/export/standings.csv?leagueId=${managedLeague().id}`;
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id === "managedLeagueSelect") {
    state.managedLeagueId = event.target.value;
    localStorage.setItem("pitchpick-managed-league-id", state.managedLeagueId);
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

  if (!isAdmin() && form.id !== "loginForm") {
    showToast("Admin access required.");
    return;
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
  if (form.id === "inviteForm") {
    await mutate("/api/admin/invite-player", { ...formData, leagueId: managedLeague().id }, "Invite created. Copy the link from League Members.");
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
  const selectedCardIds = [...state.dirtyCards.entries()].filter(([, value]) => value.selected).map(([cardId]) => cardId);
  if (selectedCardIds.length < MIN_SELECTED_CARDS || selectedCardIds.length > MAX_SELECTED_CARDS) {
    showToast(`Select ${MIN_SELECTED_CARDS} to ${MAX_SELECTED_CARDS} cards.`);
    return;
  }
  const answers = Object.fromEntries([...state.dirtyCards.entries()].map(([cardId, value]) => [cardId, value.answer]));
  await mutate("/api/player/submit-picks", {
    userId: state.data.currentUser.id,
    matchDayId: summary.id,
    selectedCardIds,
    answers,
    scorePrediction: {
      tournamentMatchId: state.selectedMatchId,
      predictedHomeScore: state.score.home,
      predictedAwayScore: state.score.away
    }
  }, "Picks submitted.");
}

async function runAdminAction(action) {
  const summary = selectedMatchday();
  const syncScope = action === "sync-fixtures" || action === "sync-odds" ? "all" : undefined;
  const body = {
    leagueId: managedLeague().id,
    matchDayId: summary?.id || state.data.matchday.id,
    scope: syncScope
  };
  if (action === "sync-daily-tournament-data") {
    body.date = document.querySelector("#dailySyncDate")?.value || new Date().toISOString().slice(0, 10);
  }
  await mutate(`/api/admin/${action}`, body, action.replaceAll("-", " ") + " complete.");
}

async function mutate(path, body, message, after) {
  try {
    const result = await api.post(path, body);
    after?.(result);
    state.data = result.state;
    syncHydratedState();
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
    state.selectedMatchdayId = result.state.todayMatchdayId;
    localStorage.setItem("pitchpick-selected-matchday-id", state.selectedMatchdayId);
    state.route = result.user.role === "ADMIN" ? "admin" : "player";
    syncHydratedState();
    updateChrome();
    render();
    showToast(`Logged in as ${result.user.displayName}.`);
  } catch (error) {
    renderLogin(error.message);
  }
}

function managedLeague() {
  return state.data.leagues.find((league) => league.id === state.managedLeagueId) || state.data.leagues[0];
}

function membersForLeague(leagueId) {
  return state.data.leagueMembers.filter((member) => member.leagueId === leagueId && member.status !== "REMOVED");
}

function availableUsersForLeague(leagueId) {
  const currentMembers = new Set(membersForLeague(leagueId).map((member) => member.userId));
  return state.data.users.filter((user) => user.role === "PLAYER" && !currentMembers.has(user.id));
}

function managedContests() {
  const leagueId = managedLeague().id;
  return state.data.contests.filter((contest) => contest.leagueId === leagueId);
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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => {
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
