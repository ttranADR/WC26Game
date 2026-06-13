import { createCardsFromOdds, createCardPool, createContests, createStandings, getCardMeaningKey, normalizePairingMode } from "./seed.js";
import { gradeCard, gradeExactPrediction, getExactScoreMultiplier } from "./scoring.js";
import { defaultPasswordForRole, ensureUserPassword, hashPassword, verifyPassword } from "./auth.js";
import { sendInviteEmail } from "./email.js";
import { shuffle } from "./random.js";
import {
  CARD_POINTS_CORRECT,
  CARD_POINTS_INCORRECT,
  CARD_SET_SIZE,
  MAX_SELECTED_CARDS,
  MIN_SELECTED_CARDS
} from "./config.js";

const APP_TIME_ZONE = "America/Los_Angeles";
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export async function getAppState(store, userId = "user_you") {
  return store.update((data) => {
    ensureDemoScaffold(data);
    return hydrateState(data, userId);
  });
}

export async function getMatchdayOdds(store, input = {}) {
  const data = await store.read();
  ensureDemoScaffold(data);
  refreshMatchdayStatuses(data);
  const matchday = input.matchDayId
    ? mustFind(data.matchdays, input.matchDayId, "Matchday")
    : getTodayMatchday(data);
  const matchIds = new Set(data.tournamentMatches
    .filter((match) => match.matchDayId === matchday.id)
    .map((match) => match.id));
  return {
    matchDayId: matchday.id,
    correctScoreOdds: data.oddsSnapshots.filter((odd) => (
      odd.marketKey === "CORRECT_SCORE" &&
      matchIds.has(odd.tournamentMatchId)
    ))
  };
}

export async function loginUser(store, input) {
  return store.update((data) => {
    ensureDemoScaffold(data);
    const identifier = normalizeLoginIdentifier(input.email);
    const password = String(input.password || "").trim();
    const user = findLoginUser(data, identifier);
    if (!user || !verifyPassword(user, password)) {
      throw new Error("Invalid email or password.");
    }
    data.syncLogs.unshift(log("LOGIN", "SUCCESS", `${user.displayName} logged in.`));
    return {
      ok: true,
      user: publicUser(user),
      state: hydrateState(data, user.id)
    };
  });
}

function normalizeLoginIdentifier(value) {
  const identifier = String(value || "").trim().toLowerCase();
  const aliases = {
    admin: "admin@pitchpick.local",
    player: "you@pitchpick.local",
    user: "you@pitchpick.local",
    you: "you@pitchpick.local",
    "player@pitchpick.local": "you@pitchpick.local",
    "user@pitchpick.local": "you@pitchpick.local"
  };
  return aliases[identifier] || identifier;
}

function findLoginUser(data, identifier) {
  return data.users.find((item) => (
    String(item.email || "").toLowerCase() === identifier ||
    String(item.id || "").toLowerCase() === identifier ||
    String(item.displayName || "").toLowerCase() === identifier
  ));
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) throw new Error("Enter a valid email.");
  return email;
}

function normalizeDisplayName(value) {
  const displayName = String(value || "").trim();
  if (displayName.length < 2) throw new Error("Name must be at least 2 characters.");
  return displayName;
}

function normalizeUserRole(value) {
  const role = String(value || "PLAYER").trim().toUpperCase();
  if (!["ADMIN", "PLAYER"].includes(role)) throw new Error("Role must be ADMIN or PLAYER.");
  return role;
}

function normalizePassword(value) {
  const password = String(value || "").trim();
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  return password;
}

export async function submitPicks(store, input) {
  const { userId = "user_you", matchDayId = "md_12", selectedCardIds, answers, scorePrediction } = input;

  return store.update((data) => {
    refreshMatchdayStatuses(data);
    const matchday = mustFind(data.matchdays, matchDayId, "Matchday");
    if (isLocked(matchday)) throw new Error("This matchday is locked. Picks can no longer be edited.");

    const set = data.playerCardSets.find((item) => item.matchDayId === matchDayId && item.userId === userId);
    if (!set) throw new Error("No generated card set found for this player.");
    const uniqueSelectedCardIds = [...new Set(selectedCardIds || [])];
    if (!Array.isArray(selectedCardIds) || uniqueSelectedCardIds.length !== selectedCardIds.length) {
      throw new Error("Selected prediction cards must be unique.");
    }
    if (uniqueSelectedCardIds.length < MIN_SELECTED_CARDS || uniqueSelectedCardIds.length > MAX_SELECTED_CARDS) {
      throw new Error(`Select ${MIN_SELECTED_CARDS} to ${MAX_SELECTED_CARDS} prediction cards.`);
    }

    const ownedCards = data.playerCards.filter((card) => card.playerCardSetId === set.id);
    const ownedCardIds = new Set(ownedCards.map((card) => card.predictionCardId));
    uniqueSelectedCardIds.forEach((cardId) => {
      if (!ownedCardIds.has(cardId)) throw new Error(`Card ${cardId} is not assigned to this player.`);
      if (!["YES", "NO"].includes(answers?.[cardId])) throw new Error(`Card ${cardId} needs a Yes or No answer.`);
    });

    ownedCards.forEach((playerCard) => {
      const selected = uniqueSelectedCardIds.includes(playerCard.predictionCardId);
      playerCard.selected = selected;
      playerCard.playerAnswer = selected ? answers[playerCard.predictionCardId] : null;
      playerCard.answeredAt = selected ? new Date().toISOString() : null;
    });

    const match = mustFind(data.tournamentMatches, scorePrediction.tournamentMatchId, "Match");
    const existing = data.scorePredictions.find((item) => item.matchDayId === matchDayId && item.userId === userId);
    const prediction = {
      id: existing?.id || `score_${matchDayId}_${userId}`,
      matchDayId,
      userId,
      tournamentMatchId: match.id,
      predictedHomeScore: clampScore(scorePrediction.predictedHomeScore),
      predictedAwayScore: clampScore(scorePrediction.predictedAwayScore),
      oddsMultiplier: getExactScoreMultiplier(scorePrediction, match, data.oddsSnapshots),
      isExact: null,
      pointsAwarded: 0,
      submittedAt: new Date().toISOString()
    };

    if (existing) Object.assign(existing, prediction);
    else data.scorePredictions.push(prediction);

    data.syncLogs.unshift(log("PLAYER_SUBMIT", "SUCCESS", `${userId} submitted picks.`));
    return { ok: true, message: "Picks submitted.", state: hydrateState(data, userId) };
  });
}

export async function acceptLeagueInvite(store, input) {
  return store.update((data) => {
    ensureDemoScaffold(data);
    const inviteCode = String(input.inviteCode || "").trim();
    if (!inviteCode) throw new Error("Invite code is required.");
    const member = data.leagueMembers.find((item) => item.inviteCode === inviteCode);
    if (!member || member.status === "REMOVED") throw new Error("Invite link is invalid or expired.");
    const league = mustFind(data.leagues, member.leagueId, "League");
    const user = mustFind(data.users, member.userId, "User");
    member.status = "ACTIVE";
    member.joinedAt = member.joinedAt || new Date().toISOString();
    ensureStanding(data, league.id, user.id);
    ensurePlayerCardSet(data, user.id, getTodayMatchday(data).id);
    data.syncLogs.unshift(log("ACCEPT_INVITE", "SUCCESS", `${user.displayName} joined ${league.name}.`));
    return {
      ok: true,
      message: `${user.displayName} joined ${league.name}.`,
      user: publicUser(user),
      state: hydrateState(data, user.id)
    };
  });
}

export async function createLeague(store, input) {
  return store.update((data) => {
    const name = String(input.name || "").trim();
    if (name.length < 3) throw new Error("League name must be at least 3 characters.");
    const id = `league_${Date.now()}`;
    data.leagues.push({
      id,
      name,
      slug: slugify(name),
      seasonName: input.seasonName || "World Cup 2026",
      pairingMode: normalizePairingMode(input.pairingMode),
      createdByUserId: "admin_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    data.syncLogs.unshift(log("CREATE_LEAGUE", "SUCCESS", `Created ${name}.`));
    return { ok: true, leagueId: id, state: hydrateState(data, input.currentUserId) };
  });
}

export async function createUserAccount(store, input) {
  return store.update((data) => {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    const role = normalizeUserRole(input.role);
    const password = normalizePassword(input.password || defaultPasswordForRole(role));
    if (data.users.some((user) => user.email.toLowerCase() === email)) {
      throw new Error("A user with this email already exists.");
    }

    const id = `user_${Date.now()}`;
    const user = {
      id,
      email,
      displayName,
      avatarUrl: `assets/${id}.svg`,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.users.push(user);
    if (role === "PLAYER") ensurePlayerProfile(data, user);
    data.syncLogs.unshift(log("CREATE_USER", "SUCCESS", `Created ${displayName} as ${role}.`));
    return { ok: true, user: publicUser(user), state: hydrateState(data, input.currentUserId) };
  });
}

export async function updateUserAccount(store, input) {
  return store.update((data) => {
    const user = mustFind(data.users, input.userId, "User");
    const role = normalizeUserRole(input.role || user.role);
    if (user.role === "ADMIN" && role !== "ADMIN" && !hasOtherAdmin(data, user.id)) {
      throw new Error("At least one admin user is required.");
    }

    user.displayName = normalizeDisplayName(input.displayName || user.displayName);
    user.role = role;
    const passwordUpdated = Boolean(String(input.password || "").trim());
    if (String(input.password || "").trim()) {
      user.passwordHash = hashPassword(normalizePassword(input.password));
    } else {
      ensureUserPassword(user);
    }
    user.updatedAt = new Date().toISOString();
    if (role === "PLAYER") ensurePlayerProfile(data, user);
    data.syncLogs.unshift(log("UPDATE_USER", "SUCCESS", `Updated ${user.displayName}.`));
    return {
      ok: true,
      message: passwordUpdated ? `Password reset for ${user.displayName}.` : `Updated ${user.displayName}.`,
      passwordUpdated,
      user: publicUser(user),
      state: hydrateState(data, input.currentUserId)
    };
  });
}

export async function updateOwnAccount(store, input) {
  return store.update((data) => {
    const user = mustFind(data.users, input.currentUserId, "User");
    user.displayName = normalizeDisplayName(input.displayName || user.displayName);
    const passwordUpdated = Boolean(String(input.password || "").trim());
    if (String(input.password || "").trim()) {
      user.passwordHash = hashPassword(normalizePassword(input.password));
    } else {
      ensureUserPassword(user);
    }
    user.updatedAt = new Date().toISOString();
    if (user.role === "PLAYER") ensurePlayerProfile(data, user);
    data.syncLogs.unshift(log("UPDATE_ACCOUNT", "SUCCESS", `${user.displayName} updated account settings.`));
    return {
      ok: true,
      message: passwordUpdated ? "Password updated." : "Account updated.",
      passwordUpdated,
      user: publicUser(user),
      state: hydrateState(data, user.id)
    };
  });
}

export async function updateLeague(store, input) {
  return store.update((data) => {
    const league = mustFind(data.leagues, input.leagueId, "League");
    const name = String(input.name || "").trim();
    if (name.length < 3) throw new Error("League name must be at least 3 characters.");
    league.name = name;
    league.slug = slugify(name);
    league.seasonName = String(input.seasonName || league.seasonName || "World Cup 2026").trim();
    league.pairingMode = normalizePairingMode(input.pairingMode, league.pairingMode || "MIXED");
    league.updatedAt = new Date().toISOString();
    data.syncLogs.unshift(log("UPDATE_LEAGUE", "SUCCESS", `Updated ${league.name}.`));
    return { ok: true, leagueId: league.id, state: hydrateState(data, input.currentUserId) };
  });
}

export async function invitePlayer(store, input) {
  return store.update(async (data) => {
    const leagueId = input.leagueId || "league_1";
    const league = mustFind(data.leagues, leagueId, "League");
    const email = normalizeEmail(input.email);

    let user = data.users.find((item) => item.email.toLowerCase() === email);
    if (!user) {
      const id = `user_${Date.now()}`;
      user = {
        id,
        email,
        displayName: normalizeDisplayName(input.displayName || email.split("@")[0]),
        avatarUrl: `assets/${id}.svg`,
        role: "PLAYER",
        passwordHash: hashPassword("player123"),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.users.push(user);
    }

    const inviteCode = makeInviteCode(leagueId, user.id);
    upsertLeagueMember(data, {
      leagueId,
      userId: user.id,
      status: "INVITED",
      joinedAt: null,
      inviteCode
    });
    ensureStanding(data, leagueId, user.id);
    ensurePlayerCardSet(data, user.id);
    const appUrl = input.appUrl || "http://localhost:4173";
    const inviteLink = `${appUrl}/?invite=${encodeURIComponent(inviteCode)}`;
    const emailResult = await sendInviteEmail({
      to: email,
      displayName: user.displayName,
      leagueName: league.name,
      inviteLink
    });

    data.emailOutbox ||= [];
    data.emailOutbox.unshift({
      id: `email_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      to: email,
      displayName: user.displayName,
      leagueId,
      leagueName: league.name,
      subject: emailResult.subject,
      inviteLink,
      provider: emailResult.provider,
      status: emailResult.status,
      providerMessageId: emailResult.providerMessageId,
      createdAt: new Date().toISOString()
    });
    data.syncLogs.unshift(log("INVITE_PLAYER", "SUCCESS", `Invited ${email} to ${league.name} via ${emailResult.provider}.`));
    return {
      ok: true,
      message: emailResult.provider === "mock"
        ? "Invite created in local Email Outbox."
        : "Invite email sent.",
      inviteLink,
      emailStatus: emailResult.status,
      state: hydrateState(data, input.currentUserId)
    };
  });
}

export async function addLeagueMember(store, input) {
  return store.update((data) => {
    const league = mustFind(data.leagues, input.leagueId, "League");
    const user = mustFind(data.users, input.userId, "User");
    if (user.role !== "PLAYER") throw new Error("Only player users can join a league.");
    upsertLeagueMember(data, {
      leagueId: league.id,
      userId: user.id,
      status: "ACTIVE",
      joinedAt: new Date().toISOString(),
      inviteCode: null
    });
    ensureStanding(data, league.id, user.id);
    ensurePlayerCardSet(data, user.id);
    data.syncLogs.unshift(log("ADD_MEMBER", "SUCCESS", `Added ${user.displayName} to ${league.name}.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function updateLeagueMemberStatus(store, input) {
  return store.update((data) => {
    const league = mustFind(data.leagues, input.leagueId, "League");
    const user = mustFind(data.users, input.userId, "User");
    const status = ["ACTIVE", "INVITED", "REMOVED"].includes(input.status) ? input.status : null;
    if (!status) throw new Error("Member status must be ACTIVE, INVITED, or REMOVED.");
    const member = data.leagueMembers.find((item) => item.leagueId === league.id && item.userId === user.id);
    if (!member) throw new Error(`${user.displayName} is not in ${league.name}.`);
    member.status = status;
    member.joinedAt = status === "ACTIVE" ? (member.joinedAt || new Date().toISOString()) : member.joinedAt;
    if (status === "INVITED" && !member.inviteCode) member.inviteCode = makeInviteCode(league.id, user.id);
    data.syncLogs.unshift(log("UPDATE_MEMBER", "SUCCESS", `${user.displayName} is now ${status} in ${league.name}.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function syncFixtures(store, provider, input = {}) {
  const plan = await store.update((data) => {
    ensureDemoScaffold(data);
    const syncAll = input.scope === "all" && typeof provider.getCompetitionFixtures === "function";
    const matchDayId = input.matchDayId || "md_12";
    const matchday = syncAll ? null : mustFind(data.matchdays, matchDayId, "Matchday");
    return { syncAll, matchDayId, date: matchday?.date };
  });

  const fixtures = plan.syncAll
    ? await provider.getCompetitionFixtures()
    : await provider.getFixturesByDate(plan.date);

  return store.update((data) => {
    if (plan.syncAll) {
      upsertCompetitionFixtures(data, fixtures);
    } else {
      fixtures.forEach((fixture) => upsertTournamentMatch(data, fixture, plan.matchDayId));
      updateMatchdayFromMatches(data, plan.matchDayId);
    }

    data.syncLogs.unshift(log("SYNC_FIXTURES", "SUCCESS", `Synced ${fixtures.length} fixtures${plan.syncAll ? " across the tournament" : ""}.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function syncOdds(store, provider, input = {}) {
  const plan = await store.update((data) => {
    ensureDemoScaffold(data);
    const matches = selectStoredFixturesForOdds(data, input);
    if (!matches.length) throw new Error("Sync fixtures before syncing odds.");
    const useCompetitionOdds = input.scope === "all" && typeof provider.getCompetitionOdds === "function";
    return {
      matches: matches.map(projectFixtureForOddsSync),
      dates: getFixtureDates(matches),
      useCompetitionOdds
    };
  });
  const rawOdds = plan.useCompetitionOdds
    ? await provider.getCompetitionOdds()
    : await fetchOddsForStoredFixtures(provider, plan.dates);
  const targetMatchIds = new Set(plan.matches.map((match) => match.id));

  return store.update((data) => {
    const resolver = createMatchResolver(plan.matches);
    const capturedAt = Date.now();
    const providerOdds = rawOdds.map((odd, index) => {
      const tournamentMatchId = resolver(odd);
      if (!targetMatchIds.has(tournamentMatchId)) return null;
      return {
        ...odd,
        id: createOddsSnapshotId(tournamentMatchId, odd, index, capturedAt),
        tournamentMatchId,
        sourceFixtureDate: odd.sourceFixtureDate || getAppDateKey(odd.commenceAt)
      };
    }).filter(Boolean);
    const nextOdds = withCompleteCorrectScoreOdds(plan.matches, providerOdds, capturedAt);
    const nextKeys = new Set(nextOdds.map(oddsSnapshotKey));
    const coveredCorrectScoreKeys = new Set(nextOdds
      .filter((odd) => odd.marketKey === "CORRECT_SCORE")
      .map(correctScoreOutcomeKey));

    data.oddsSnapshots = data.oddsSnapshots.filter((odd) => (
      !nextKeys.has(oddsSnapshotKey(odd)) &&
      !coveredCorrectScoreKeys.has(correctScoreOutcomeKey(odd))
    ));
    data.oddsSnapshots.push(...nextOdds);
    const oddsSource = plan.useCompetitionOdds
      ? "using one bulk competition odds fetch"
      : `across ${plan.dates.length} date${plan.dates.length === 1 ? "" : "s"}`;
    data.syncLogs.unshift(log(
      "SYNC_ODDS",
      "SUCCESS",
      `Synced ${nextOdds.length} odds snapshots for ${plan.matches.length} stored fixtures ${oddsSource}${rawOdds.length > providerOdds.length ? ` (${rawOdds.length - providerOdds.length} unmatched)` : ""}.`
    ));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function initializeTournamentData(store, providers, input = {}) {
  const fixtureProvider = providers.fixtureProvider || providers;
  const oddsProvider = providers.oddsProvider || providers;

  await syncFixtures(store, fixtureProvider, { ...input, scope: "all" });
  await syncOdds(store, oddsProvider, { ...input, scope: "all" });

  return store.update((data) => {
    const summary = summarizeTournamentData(data);
    data.syncLogs.unshift(log(
      "INITIAL_DATA_LOAD",
      "SUCCESS",
      `Initial database loaded with ${summary.matchdays} matchdays, ${summary.matches} matches, and ${summary.oddsSnapshots} odds snapshots.`
    ));
    return {
      ok: true,
      message: "Initial tournament database loaded.",
      summary,
      state: hydrateState(data, input.currentUserId)
    };
  });
}

export async function syncDailyTournamentData(store, providers, input = {}) {
  const fixtureProvider = providers.fixtureProvider || providers;
  const oddsProvider = providers.oddsProvider || providers;
  const date = input.date || getAppDateKey();
  const target = await store.update((data) => {
    ensureDemoScaffold(data);
    if (!data.tournamentMatches.length) {
      throw new Error("Run the initial database load before running a daily update.");
    }
    const matchday = data.matchdays.find((item) => item.date === date);
    if (!matchday) return { date, matchDayId: null };
    const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
    return { date, matchDayId: matchday.id, matchCount: matches.length };
  });

  if (!target.matchDayId) {
    return store.update((data) => {
      data.syncLogs.unshift(log("DAILY_DATA_UPDATE", "SUCCESS", `No stored World Cup matches found for ${target.date}.`));
      return {
        ok: true,
        skipped: true,
        message: `No stored World Cup matches found for ${target.date}.`,
        summary: summarizeTournamentData(data),
        state: hydrateState(data, input.currentUserId)
      };
    });
  }

  await syncFixtures(store, fixtureProvider, { ...input, matchDayId: target.matchDayId });
  await syncOdds(store, oddsProvider, { ...input, matchDayId: target.matchDayId });

  return store.update((data) => {
    const finalized = scoreMatchdayIfFinished(data, target.matchDayId);
    const summary = summarizeTournamentData(data);
    data.syncLogs.unshift(log(
      "DAILY_DATA_UPDATE",
      "SUCCESS",
      `Updated ${target.matchCount} stored matches for ${target.date}.${finalized ? " Final scores were calculated." : ""}`
    ));
    return {
      ok: true,
      message: `Daily tournament data updated for ${target.date}.${finalized ? " Final scores calculated." : ""}`,
      summary,
      state: hydrateState(data, input.currentUserId)
    };
  });
}

export async function updateMatchScoresForMatchday(store, provider, input = {}) {
  const matchDayId = input.matchDayId || "md_12";
  await syncFixtures(store, provider, { ...input, matchDayId, scope: undefined });
  if (provider.supportsMatchEvents && typeof provider.getMatchEvents === "function") {
    await syncMatchEventsForMatchday(store, provider, matchDayId);
  }

  return store.update((data) => {
    const matchday = mustFind(data.matchdays, matchDayId, "Matchday");
    const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchDayId);
    const finishedCount = matches.filter((match) => match.status === "FINISHED").length;
    const finalized = scoreMatchdayIfFinished(data, matchDayId);
    const scoreText = matches.length
      ? `${finishedCount}/${matches.length} matches finished`
      : "no matches found";
    const message = `Updated WC match scores for ${matchday.name}: ${scoreText}.${finalized ? " Final scores calculated." : ""}`;
    data.syncLogs.unshift(log("UPDATE_MATCH_SCORES", "SUCCESS", message));
    return {
      ok: true,
      message,
      state: hydrateState(data, input.currentUserId)
    };
  });
}

async function syncMatchEventsForMatchday(store, provider, matchDayId) {
  const targets = await store.update((data) => (
    data.tournamentMatches
      .filter((match) => match.matchDayId === matchDayId)
      .map((match) => ({
        id: match.id,
        externalId: match.externalId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
        firstGoalMinute: match.firstGoalMinute,
        firstGoalTeam: match.firstGoalTeam,
        redCardShown: match.redCardShown,
        topScorerName: getTopScorerCardName(data, match.id) || match.topScorerName,
        topScorerScored: match.topScorerScored
      }))
  ));

  const eventUpdates = [];
  for (const match of targets) {
    const events = await provider.getMatchEvents(match.externalId || match.id);
    eventUpdates.push({
      matchId: match.id,
      metadata: summarizeMatchEvents(match, events)
    });
  }

  return store.update((data) => {
    eventUpdates.forEach((update) => {
      const match = data.tournamentMatches.find((item) => item.id === update.matchId);
      if (!match) return;
      Object.assign(match, update.metadata, {
        matchEventsUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
    return { ok: true };
  });
}

export async function syncLiveData(store, providers, input = {}) {
  const fixtureProvider = providers.fixtureProvider || providers;
  const oddsProvider = providers.oddsProvider || providers;
  const syncMode = input.sync || "both";
  const matchDayIds = await store.update((data) => {
    ensureDemoScaffold(data);
    refreshMatchdayStatuses(data);
    if (input.matchDayId) return [input.matchDayId];
    return data.matchdays
      .filter((matchday) => ["OPEN", "LOCKED", "SCORING"].includes(matchday.status))
      .map((matchday) => matchday.id);
  });

  const results = [];
  if (["fixtures", "both"].includes(syncMode)) {
    try {
      if (!input.matchDayId && typeof fixtureProvider.getCompetitionFixtures === "function") {
        await syncFixtures(store, fixtureProvider, { ...input, scope: "all" });
        results.push({ matchDayId: "all", type: "fixtures", status: "SUCCESS" });
      } else {
        for (const matchDayId of matchDayIds) {
          await syncFixtures(store, fixtureProvider, { ...input, matchDayId });
          results.push({ matchDayId, type: "fixtures", status: "SUCCESS" });
        }
      }
    } catch (error) {
      results.push({ matchDayId: input.matchDayId || "all", type: "fixtures", status: "ERROR", message: error.message });
    }
  }

  if (["odds", "both"].includes(syncMode)) {
    try {
      if (!input.matchDayId) {
        await syncOdds(store, oddsProvider, { ...input, scope: "all" });
        results.push({ matchDayId: "all", type: "odds", status: "SUCCESS" });
      } else {
        for (const matchDayId of matchDayIds) {
          await syncOdds(store, oddsProvider, { ...input, matchDayId });
          results.push({ matchDayId, type: "odds", status: "SUCCESS" });
        }
      }
    } catch (error) {
      results.push({ matchDayId: input.matchDayId || "all", type: "odds", status: "ERROR", message: error.message });
    }
  }

  const failures = results.filter((result) => result.status === "ERROR");
  if (failures.length === results.length && results.length) {
    throw new Error(`Live sync failed: ${failures.map((result) => `${result.type} ${result.matchDayId}: ${result.message}`).join("; ")}`);
  }

  const finalized = await store.update((data) => {
    const finalizedMatchDayIds = autoFinalizeFinishedMatchdays(data, matchDayIds);
    if (finalizedMatchDayIds.length) {
      const names = finalizedMatchDayIds.map((matchDayId) => (
        data.matchdays.find((matchday) => matchday.id === matchDayId)?.name || matchDayId
      ));
      data.syncLogs.unshift(log("AUTO_FINALIZE_MATCHDAY", "SUCCESS", `Auto-finalized ${names.join(", ")} after all matches finished.`));
    }
    return finalizedMatchDayIds;
  });

  return {
    ok: true,
    message: `Live sync complete for ${matchDayIds.length} matchday${matchDayIds.length === 1 ? "" : "s"}.${finalized.length ? ` Auto-finalized ${finalized.length}.` : ""}`,
    results,
    finalizedMatchDayIds: finalized,
    state: await getAppState(store, input.currentUserId || "user_you")
  };
}

function upsertCompetitionFixtures(data, fixtures) {
  const byDate = new Map();
  fixtures
    .filter((fixture) => fixture.kickoffAt)
    .forEach((fixture) => {
      const date = getAppDateKey(fixture.kickoffAt);
      if (!date) return;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(fixture);
    });

  [...byDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .forEach(([date, dayFixtures]) => {
      const matchday = ensureMatchdayForFixtures(data, date, dayFixtures);
      dayFixtures.forEach((fixture) => upsertTournamentMatch(data, fixture, matchday.id));
      updateMatchdayFromMatches(data, matchday.id);
    });
}

function selectStoredFixturesForOdds(data, input) {
  if (input.matchDayId) {
    mustFind(data.matchdays, input.matchDayId, "Matchday");
    return data.tournamentMatches.filter((match) => match.matchDayId === input.matchDayId && match.kickoffAt);
  }

  if (input.scope === "all") {
    return data.tournamentMatches.filter((match) => match.kickoffAt);
  }

  const matchDayId = input.matchDayId || "md_12";
  mustFind(data.matchdays, matchDayId, "Matchday");
  return data.tournamentMatches.filter((match) => match.matchDayId === matchDayId && match.kickoffAt);
}

function projectFixtureForOddsSync(match) {
  return {
    id: match.id,
    externalId: match.externalId,
    matchDayId: match.matchDayId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt
  };
}

function getFixtureDates(matches) {
  return [...new Set(matches
    .map((match) => getAppDateKey(match.kickoffAt))
    .filter(Boolean))]
    .sort();
}

async function fetchOddsForStoredFixtures(provider, fixtureDates) {
  const batches = [];
  for (const date of fixtureDates) {
    const rows = await provider.getOddsByDate(date);
    batches.push(...rows.map((row) => ({ ...row, sourceFixtureDate: date })));
  }
  return batches;
}

function createOddsSnapshotId(tournamentMatchId, odd, index, capturedAt) {
  return [
    "odds",
    cleanId(tournamentMatchId),
    cleanId(odd.provider || "provider"),
    cleanId(odd.bookmaker || "book"),
    cleanId(odd.marketKey),
    cleanId(odd.outcomeName),
    index,
    capturedAt
  ].join("_");
}

function withCompleteCorrectScoreOdds(matches, providerOdds, capturedAt) {
  const nextOdds = [...providerOdds];
  const existingScorelines = new Set(nextOdds
    .filter((odd) => odd.marketKey === "CORRECT_SCORE")
    .map(correctScoreOutcomeKey));
  const capturedIso = new Date(capturedAt).toISOString();

  matches.forEach((match) => {
    createCorrectScorePrices().forEach(([score, price], scoreIndex) => {
      const key = correctScoreOutcomeKey({
        tournamentMatchId: match.id,
        marketKey: "CORRECT_SCORE",
        outcomeName: score
      });
      if (existingScorelines.has(key)) return;

      const odd = {
        tournamentMatchId: match.id,
        provider: "pitchpick-generated",
        marketKey: "CORRECT_SCORE",
        bookmaker: "World Cup 26 Prediction",
        outcomeName: score,
        priceDecimal: price,
        priceAmerican: null,
        impliedProbability: Number((1 / price).toFixed(4)),
        sourceFixtureDate: getAppDateKey(match.kickoffAt),
        rawData: { generated: true, reason: "Missing correct-score bookmaker quote" },
        capturedAt: capturedIso
      };
      nextOdds.push({
        ...odd,
        id: createOddsSnapshotId(match.id, odd, scoreIndex, capturedAt)
      });
      existingScorelines.add(key);
    });
  });

  return nextOdds;
}

function oddsSnapshotKey(odd) {
  return [
    odd.tournamentMatchId,
    odd.provider || "",
    odd.bookmaker || "",
    odd.marketKey || "",
    odd.outcomeName || ""
  ].join("::");
}

function correctScoreOutcomeKey(odd) {
  if (odd.marketKey !== "CORRECT_SCORE") return "";
  return [
    odd.tournamentMatchId,
    odd.marketKey,
    normalizeScoreOutcomeName(odd.outcomeName)
  ].join("::");
}

function normalizeScoreOutcomeName(value) {
  const match = String(value || "").match(/(\d+)\s*-\s*(\d+)/);
  return match ? `${Number(match[1])}-${Number(match[2])}` : String(value || "").trim();
}

function summarizeTournamentData(data) {
  const correctScoreOdds = data.oddsSnapshots.filter((odd) => odd.marketKey === "CORRECT_SCORE");
  return {
    matchdays: data.matchdays.length,
    matches: data.tournamentMatches.length,
    oddsSnapshots: data.oddsSnapshots.length,
    correctScoreOdds: correctScoreOdds.length,
    generatedCorrectScoreOdds: correctScoreOdds.filter((odd) => odd.provider === "pitchpick-generated").length
  };
}

function ensureMatchdayForFixtures(data, date, fixtures) {
  const stage = getStageInfo(fixtures);
  const firstKickoff = fixtures
    .map((fixture) => new Date(fixture.kickoffAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const lockAt = firstKickoff
    ? new Date(firstKickoff).toISOString()
    : `${date}T00:00:00.000Z`;
  const existing = data.matchdays.find((matchday) => matchday.date === date && matchday.externalProvider === "football-data") ||
    data.matchdays.find((matchday) => matchday.date === date);
  const matchday = existing || {
    id: `md_${date.replaceAll("-", "")}`,
    createdAt: new Date().toISOString()
  };

  Object.assign(matchday, {
    name: `${stage.label} · ${formatShortDate(date)}`,
    date,
    lockAt,
    status: matchday.status || "SCHEDULED",
    phase: stage.key,
    phaseLabel: stage.label,
    phaseSort: stage.sort,
    externalProvider: "football-data",
    updatedAt: new Date().toISOString()
  });

  if (!existing) data.matchdays.push(matchday);
  return matchday;
}

function upsertTournamentMatch(data, fixture, matchDayId) {
  const existing = data.tournamentMatches.find((match) => (
    match.externalProvider === fixture.externalProvider &&
    match.externalId === fixture.externalId
  )) || data.tournamentMatches.find((match) => match.externalId === fixture.externalId);
  const id = existing?.id || `match_${cleanId(fixture.externalProvider || "provider")}_${cleanId(fixture.externalId)}`;
  const next = {
    ...fixture,
    id,
    matchDayId,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  ["firstGoalMinute", "firstGoalTeam", "redCardShown", "topScorerName", "topScorerScored"].forEach((field) => {
    if (next[field] == null && existing?.[field] != null) next[field] = existing[field];
  });
  if (existing) Object.assign(existing, next);
  else data.tournamentMatches.push(next);
}

function updateMatchdayFromMatches(data, matchDayId) {
  const matchday = data.matchdays.find((item) => item.id === matchDayId);
  if (!matchday) return;
  const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchDayId);
  if (!matches.length) return;
  const stage = getStageInfo(matches);
  const firstKickoff = matches
    .map((match) => new Date(match.kickoffAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  if (firstKickoff) matchday.lockAt = new Date(firstKickoff).toISOString();
  matchday.phase = stage.key;
  matchday.phaseLabel = stage.label;
  matchday.phaseSort = stage.sort;
  matchday.status = deriveMatchdayStatus(matchday, matches);
  matchday.updatedAt = new Date().toISOString();
}

function refreshMatchdayStatuses(data) {
  const now = new Date();
  data.matchdays.forEach((matchday) => {
    const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
    if (matchday.status === "FINAL" && !hasFutureKickoff(matchday, matches, now)) return;
    const nextStatus = matches.length ? deriveMatchdayStatus(matchday, matches, now) : deriveMatchdayStatus(matchday, [], now);
    if (matchday.status !== nextStatus) {
      matchday.status = nextStatus;
      matchday.updatedAt = new Date().toISOString();
    }
  });
}

function deriveMatchdayStatus(matchday, matches, now = new Date()) {
  const firstKickoff = getFirstKickoffTime(matches);
  if (Number.isFinite(firstKickoff) && firstKickoff > now.getTime()) {
    return matchday.date === getLocalDateKey(now) ? "OPEN" : "SCHEDULED";
  }
  if (!matches.length) {
    if (new Date(matchday.lockAt) <= now) return "LOCKED";
    return matchday.date === getLocalDateKey(now) ? "OPEN" : "SCHEDULED";
  }
  if (matches.every((match) => match.status === "FINISHED")) {
    return matchday.status === "FINAL" ? "FINAL" : "SCORING";
  }
  if (matches.some((match) => match.status === "LIVE")) return "SCORING";
  if (new Date(matchday.lockAt) <= now) return "LOCKED";
  return matchday.date === getLocalDateKey(now) ? "OPEN" : "SCHEDULED";
}

function hasFutureKickoff(matchday, matches, now = new Date()) {
  const firstKickoff = getFirstKickoffTime(matches);
  const fallbackLock = new Date(matchday.lockAt).getTime();
  const kickoff = Number.isFinite(firstKickoff) ? firstKickoff : fallbackLock;
  return Number.isFinite(kickoff) && kickoff > now.getTime();
}

function getFirstKickoffTime(matches) {
  return matches
    .map((match) => new Date(match.kickoffAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
}

function getStageInfo(fixtures) {
  const fixture = fixtures.find((item) => item.stage) || fixtures[0] || {};
  const stage = String(fixture.stage || "GROUP_STAGE");
  const round = fixture.matchdayNumber || fixture.matchday || 1;
  const labels = {
    GROUP_STAGE: [`group-${round}`, `Group Stage Round ${round}`, 10 + Number(round || 0)],
    LAST_32: ["round-of-32", "Round of 32", 40],
    ROUND_OF_32: ["round-of-32", "Round of 32", 40],
    LAST_16: ["round-of-16", "Round of 16", 50],
    ROUND_OF_16: ["round-of-16", "Round of 16", 50],
    QUARTER_FINALS: ["quarterfinals", "Quarterfinals", 60],
    SEMI_FINALS: ["semifinals", "Semifinals", 70],
    THIRD_PLACE: ["third-place", "Third Place", 80],
    FINAL: ["final", "Final", 90]
  };
  const [key, label, sort] = labels[stage] || [slugify(stage), titleize(stage), 30];
  return { key, label, sort };
}

function createMatchResolver(matches, matchDayId) {
  const scopedMatches = matchDayId ? matches.filter((match) => match.matchDayId === matchDayId) : matches;
  const matchesById = new Map(scopedMatches.map((match) => [match.id, match.id]));
  const matchesByExternal = new Map(scopedMatches.map((match) => [match.externalId, match.id]));
  const byTeamAndDate = new Map();

  scopedMatches.forEach((match) => {
    const date = getAppDateKey(match.kickoffAt);
    const home = normalizeTeamName(match.homeTeam);
    const away = normalizeTeamName(match.awayTeam);
    if (!date || !home || !away) return;
    byTeamAndDate.set(`${date}:${home}:${away}`, match.id);
    byTeamAndDate.set(`${date}:${away}:${home}`, match.id);
  });

  return (odd) => {
    if (matchesById.has(odd.tournamentMatchId)) return matchesById.get(odd.tournamentMatchId);
    if (matchesByExternal.has(odd.tournamentMatchId)) return matchesByExternal.get(odd.tournamentMatchId);

    const date = getAppDateKey(odd.commenceAt);
    const home = normalizeTeamName(odd.homeTeam);
    const away = normalizeTeamName(odd.awayTeam);
    return byTeamAndDate.get(`${date}:${home}:${away}`) || null;
  };
}

function normalizeTeamName(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases = {
    usa: "unitedstates",
    usmnt: "unitedstates",
    unitedstatesofamerica: "unitedstates",
    korearepublic: "southkorea",
    republicofkorea: "southkorea",
    iriran: "iran"
  };
  return aliases[normalized] || normalized;
}

function formatShortDate(date) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function cleanId(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function summarizeMatchEvents(match, events = []) {
  const sortedEvents = [...events].sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
  const goalEvents = sortedEvents
    .filter(isGoalEvent)
    .map((event) => ({
      event,
      minute: Number.isFinite(Number(event.minute)) ? Number(event.minute) : null,
      side: inferEventTeamSide(match, event),
      playerName: event.playerName || event.rawData?.player?.name || event.rawData?.player_name || null
    }))
    .filter((event) => event.side);
  const firstGoal = goalEvents[0] || null;
  const totalGoals = Number(match.homeScore || 0) + Number(match.awayScore || 0);
  const hasEvents = events.length > 0;
  const topScorerKey = normalizePersonName(match.topScorerName);
  const topScorerScored = topScorerKey
    ? goalEvents.some((event) => normalizePersonName(event.playerName) === topScorerKey)
    : null;

  return {
    firstGoalMinute: firstGoal?.minute ?? (totalGoals === 0 ? null : match.firstGoalMinute ?? null),
    firstGoalTeam: firstGoal?.side ?? (totalGoals === 0 ? "NONE" : match.firstGoalTeam ?? null),
    redCardShown: hasEvents ? sortedEvents.some(isRedCardEvent) : (totalGoals === 0 && match.status === "FINISHED" ? false : match.redCardShown ?? null),
    topScorerScored: topScorerKey && (hasEvents || totalGoals === 0)
      ? topScorerScored
      : match.topScorerScored ?? null
  };
}

function isGoalEvent(event) {
  const type = normalizeEventText(event.type);
  const detail = normalizeEventText(event.detail);
  return type.includes("goal") || detail.includes("goal");
}

function isRedCardEvent(event) {
  const text = `${normalizeEventText(event.type)} ${normalizeEventText(event.detail)}`;
  return text.includes("red") && text.includes("card");
}

function inferEventTeamSide(match, event) {
  const side = String(event.teamSide || "").trim().toUpperCase();
  if (["HOME", "AWAY"].includes(side)) return side;
  const teamName = event.teamName || event.rawData?.team?.name || event.rawData?.participant_name || event.rawData?.participant?.name || "";
  const normalizedTeam = normalizeTeamName(teamName);
  if (!normalizedTeam) return null;
  if (normalizedTeam === normalizeTeamName(match.homeTeam)) return "HOME";
  if (normalizedTeam === normalizeTeamName(match.awayTeam)) return "AWAY";
  return null;
}

function normalizeEventText(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ");
}

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getTopScorerCardName(data, tournamentMatchId) {
  return data.predictionCards.find((card) => (
    card.tournamentMatchId === tournamentMatchId &&
    card.cardType === "TOP_SCORER_SCORES" &&
    card.gradingRule?.scorerName
  ))?.gradingRule.scorerName || null;
}

function titleize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateCardsForMatchday(store, input) {
  return store.update((data) => {
    refreshMatchdayStatuses(data);
    const matchdays = getCardTargetMatchdays(data, input);
    const generated = [];
    const skipped = [];

    matchdays.forEach((matchday) => {
      const cards = buildCardsForMatchday(data, matchday.id);
      if (!cards.length) {
        skipped.push(matchday.name);
        return;
      }
      data.predictionCards = data.predictionCards.filter((card) => card.matchDayId !== matchday.id);
      data.predictionCards.push(...cards);
      rebuildPlayerCardsForMatchday(data, matchday.id);
      generated.push({ matchday, cards });
    });

    if (!generated.length) throw new Error(input.scope === "season" ? "No future matchdays with games are available for card generation." : "No card data found for this matchday.");
    const scopeText = input.scope === "season" ? "season prediction cards" : "prediction cards";
    const skippedText = skipped.length ? ` Skipped ${skipped.length} matchday${skipped.length === 1 ? "" : "s"} without games.` : "";
    const message = `Generated ${generated.reduce((sum, item) => sum + item.cards.length, 0)} ${scopeText} for ${generated.length} matchday${generated.length === 1 ? "" : "s"}.${skippedText}`;
    data.syncLogs.unshift(log("GENERATE_CARDS", "SUCCESS", message));
    return { ok: true, message, state: hydrateState(data, input.currentUserId) };
  });
}

function buildCardsForMatchday(data, matchDayId) {
  const matches = data.tournamentMatches
    .filter((match) => match.matchDayId === matchDayId)
    .map(projectMatchForCardGeneration);
  if (!matches.length) return [];
  const scopedCards = createCardsFromOdds(matchDayId, matches, data.oddsSnapshots, `${matchDayId}_scoped_${Date.now()}`);
  const templateCards = scopedCards.length < CARD_SET_SIZE
    ? createCardPool(matchDayId, matches, data.oddsSnapshots)
    : [];
  return normalizeGeneratedCards(matchDayId, mergeGeneratedCards(scopedCards, templateCards));
}

function projectMatchForCardGeneration(match) {
  return {
    id: match.id,
    externalProvider: match.externalProvider,
    externalId: match.externalId,
    matchDayId: match.matchDayId,
    matchdayNumber: match.matchdayNumber,
    stage: match.stage,
    group: match.group,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeTeamCode: match.homeTeamCode,
    awayTeamCode: match.awayTeamCode,
    kickoffAt: match.kickoffAt
  };
}

function mergeGeneratedCards(...cardLists) {
  const seen = new Set();
  const cards = [];
  cardLists.flat().forEach((card) => {
    const key = generatedCardKey(card);
    if (seen.has(key) || cards.length >= CARD_SET_SIZE) return;
    seen.add(key);
    cards.push(card);
  });
  return cards;
}

function normalizeGeneratedCards(matchDayId, cards) {
  const now = new Date().toISOString();
  const prefix = matchDayId === "md_12" ? "card" : `card_${matchDayId}`;
  return cards.slice(0, CARD_SET_SIZE).map((card, index) => ({
    ...card,
    id: `${prefix}_${index + 1}`,
    matchDayId,
    displayIndex: index + 1,
    createdAt: card.createdAt || now,
    updatedAt: now
  }));
}

function generatedCardKey(card) {
  return getCardMeaningKey(card);
}

function getCardTargetMatchdays(data, input) {
  if (input.scope === "season") {
    const now = new Date();
    return data.matchdays
      .slice()
      .sort(sortMatchdaysForSchedule)
      .filter((matchday) => {
        if (matchday.status === "FINAL") return false;
        const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
        return matches.length > 0 && hasFutureKickoff(matchday, matches, now);
      });
  }
  const matchday = mustFind(data.matchdays, input.matchDayId || "md_12", "Matchday");
  const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
  if (matches.length && !hasFutureKickoff(matchday, matches)) {
    throw new Error("Generate prediction cards before kickoff. This matchday already has match results or has started.");
  }
  return [matchday];
}

export async function generatePairingsForMatchday(store, input) {
  return store.update((data) => {
    const leagueId = input.leagueId || "league_1";
    const league = mustFind(data.leagues, leagueId, "League");
    if (input.pairingMode) league.pairingMode = normalizePairingMode(input.pairingMode, league.pairingMode || "MIXED");
    const matchdays = getPairingTargetMatchdays(data, input);
    const userIds = data.leagueMembers
      .filter((member) => member.leagueId === leagueId && member.status === "ACTIVE")
      .map((member) => member.userId);
    if (userIds.length < 2) throw new Error("At least two active league members are needed to generate matchups.");

    const generated = [];
    const skipped = [];
    matchdays.forEach((matchday, matchdayIndex) => {
      const hasFinalContest = data.headToHeadContests.some((contest) => (
        contest.leagueId === leagueId &&
        contest.matchDayId === matchday.id &&
        contest.status === "FINAL"
      ));
      if (matchday.status === "FINAL" || hasFinalContest) {
        skipped.push(matchday.name);
        return;
      }

      data.headToHeadContests = data.headToHeadContests.filter((contest) => !(
        contest.leagueId === leagueId &&
        contest.matchDayId === matchday.id
      ));
      const seedText = input.shuffle || input.shuffleSeed
        ? `${input.shuffleSeed || Date.now()}_${matchday.id}`
        : input.seedText || "";
      const contests = createContests(leagueId, matchday.id, userIds, league.pairingMode, {
        seedText,
        modeIndex: input.scope === "season" ? matchdayIndex : null
      });
      data.headToHeadContests.push(...contests);
      generated.push({ matchday, contests });
    });

    const modeSummary = generated
      .flatMap((item) => item.contests.map((contest) => contest.mode))
      .reduce((counts, mode) => ({ ...counts, [mode]: (counts[mode] || 0) + 1 }), {});
    const modeText = Object.entries(modeSummary).map(([mode, count]) => `${count} ${mode}`).join(", ") || league.pairingMode;
    const scopeText = input.scope === "season" ? "season matchups" : "matchups";
    const skippedText = skipped.length ? ` Skipped ${skipped.length} finalized matchday${skipped.length === 1 ? "" : "s"}.` : "";
    const message = `Generated ${generated.reduce((sum, item) => sum + item.contests.length, 0)} ${scopeText} for ${league.name} (${modeText}).${skippedText}`;
    data.syncLogs.unshift(log("GENERATE_PAIRINGS", "SUCCESS", message));
    return { ok: true, message, state: hydrateState(data, input.currentUserId) };
  });
}

function getPairingTargetMatchdays(data, input) {
  if (input.scope === "season") {
    return data.matchdays.slice().sort(sortMatchdaysForSchedule);
  }
  return [mustFind(data.matchdays, input.matchDayId || "md_12", "Matchday")];
}

export async function lockMatchday(store, input) {
  return store.update((data) => {
    const matchday = mustFind(data.matchdays, input.matchDayId || "md_12", "Matchday");
    matchday.status = "LOCKED";
    matchday.updatedAt = new Date().toISOString();
    data.syncLogs.unshift(log("LOCK_MATCHDAY", "SUCCESS", `${matchday.name} locked.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function rescoreMatchday(store, input) {
  return store.update((data) => {
    scoreMatchday(data, input.matchDayId || "md_12", input.leagueId || "league_1");
    data.syncLogs.unshift(log("SCORE_MATCHDAY", "SUCCESS", "Matchday scored idempotently."));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function finalizeMatchday(store, input) {
  return store.update((data) => {
    scoreMatchdayForLeagues(data, input.matchDayId || "md_12");
    const matchday = mustFind(data.matchdays, input.matchDayId || "md_12", "Matchday");
    matchday.status = "FINAL";
    matchday.updatedAt = new Date().toISOString();
    data.syncLogs.unshift(log("FINALIZE_MATCHDAY", "SUCCESS", `${matchday.name} finalized.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function voidCard(store, input) {
  return store.update((data) => {
    const card = mustFind(data.predictionCards, input.cardId, "Prediction card");
    card.status = "VOID";
    card.voidReason = input.reason || "Voided by admin.";
    card.updatedAt = new Date().toISOString();
    data.syncLogs.unshift(log("VOID_CARD", "SUCCESS", `${card.title} voided.`));
    return { ok: true, state: hydrateState(data, input.currentUserId) };
  });
}

export async function exportStandingsCsv(store, leagueId, currentUserId = "user_you") {
  const data = await store.read();
  const currentUser = data.users.find((user) => user.id === currentUserId);
  if (!canAccessLeague(data, currentUser, leagueId)) throw new Error("League access required.");
  const rows = hydrateStandings(data, leagueId);
  return [
    "rank,player,leaguePoints,fantasyPointsFor,cardAccuracy,scoreDifference,exactScorePoints,exactScoresCorrect",
    ...rows.map((row, index) => [
      index + 1,
      row.displayName,
      row.leaguePoints,
      row.fantasyPointsFor,
      row.cardAccuracy,
      row.scoreDifference,
      row.exactScorePoints,
      row.exactScoresCorrect
    ].join(","))
  ].join("\n");
}

function scoreMatchday(data, matchDayId, leagueId) {
  const matchdayScores = calculateMatchdayScores(data, matchDayId, { mutate: true });
  data.headToHeadContests
    .filter((contest) => contest.leagueId === leagueId && contest.matchDayId === matchDayId)
    .forEach((contest) => updateContestScore(contest, matchdayScores.playerTotals));

  rebuildLeagueStandingsFromFinalContests(data, leagueId, new Map([[matchDayId, matchdayScores]]));
}

function scoreMatchdayForLeagues(data, matchDayId, leagueIds = allLeagueIds(data)) {
  uniqueUserIds(leagueIds).forEach((leagueId) => scoreMatchday(data, matchDayId, leagueId));
}

function autoFinalizeFinishedMatchdays(data, matchDayIds) {
  return uniqueUserIds(matchDayIds).filter((matchDayId) => scoreMatchdayIfFinished(data, matchDayId));
}

function scoreMatchdayIfFinished(data, matchDayId, leagueIds = allLeagueIds(data)) {
  const matchday = data.matchdays.find((item) => item.id === matchDayId);
  const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchDayId);
  if (!matchday || !matches.length || matches.some((match) => match.status !== "FINISHED")) return false;
  scoreMatchdayForLeagues(data, matchDayId, leagueIds);
  matchday.status = "FINAL";
  matchday.updatedAt = new Date().toISOString();
  return true;
}

function allLeagueIds(data) {
  return data.leagues.map((league) => league.id);
}

function calculateMatchdayScores(data, matchDayId, options = {}) {
  const matches = new Map(data.tournamentMatches.map((match) => [match.id, match]));
  const cards = new Map(data.predictionCards.map((card) => [card.id, card]));
  const playerTotals = new Map();
  const cardStats = new Map();
  const exactStats = new Map();
  const submittedUsers = new Set();

  data.playerCardSets
    .filter((set) => set.matchDayId === matchDayId)
    .forEach((set) => {
      let total = 0;
      let cardCorrect = 0;
      let cardAttempted = 0;
      const playerCards = data.playerCards.filter((playerCard) => playerCard.playerCardSetId === set.id);
      const selectedCards = playerCards.filter((playerCard) => playerCard.selected);
      const submitted = Boolean(data.scorePredictions.find((prediction) => (
        prediction.matchDayId === matchDayId &&
        prediction.userId === set.userId &&
        prediction.submittedAt
      ))) && selectedCards.length >= MIN_SELECTED_CARDS;

      if (!submitted) {
        if (options.mutate) {
          playerCards.forEach((playerCard) => {
            playerCard.isCorrect = null;
            playerCard.pointsAwarded = 0;
          });
        }
        playerTotals.set(set.userId, 0);
        cardStats.set(set.userId, { cardCorrect: 0, cardAttempted: 0 });
        return;
      }

      submittedUsers.add(set.userId);
      playerCards.forEach((playerCard) => {
        const card = cards.get(playerCard.predictionCardId);
        const match = matches.get(card?.tournamentMatchId);
        if (playerCard.selected && card) {
          const grade = gradeCard(card, match);
          const answerCorrect = grade.isCorrect == null ? null : (
            (playerCard.playerAnswer === card.expectedAnswer) === grade.isCorrect
          );
          const pointsAwarded = answerCorrect == null
            ? 0
            : answerCorrect ? CARD_POINTS_CORRECT : CARD_POINTS_INCORRECT;
          if (options.mutate) {
            playerCard.isCorrect = answerCorrect;
            playerCard.pointsAwarded = pointsAwarded;
          }
          if (answerCorrect != null && card.status !== "VOID") {
            cardAttempted += 1;
            if (answerCorrect) cardCorrect += 1;
          }
          total += pointsAwarded;
        } else {
          if (options.mutate) {
            playerCard.isCorrect = null;
            playerCard.pointsAwarded = 0;
          }
        }
      });
      playerTotals.set(set.userId, total);
      cardStats.set(set.userId, { cardCorrect, cardAttempted });
    });

  data.scorePredictions
    .filter((prediction) => prediction.matchDayId === matchDayId && submittedUsers.has(prediction.userId))
    .forEach((prediction) => {
      const match = matches.get(prediction.tournamentMatchId);
      const grade = gradeExactPrediction(prediction, match, data.oddsSnapshots);
      if (options.mutate) Object.assign(prediction, grade);
      playerTotals.set(prediction.userId, (playerTotals.get(prediction.userId) || 0) + grade.pointsAwarded);
      exactStats.set(prediction.userId, {
        exactScoresCorrect: grade.isExact ? 1 : 0,
        exactScorePoints: grade.pointsAwarded
      });
    });

  return { playerTotals, cardStats, exactStats };
}

function updateContestScore(contest, playerTotals) {
  const aUsers = uniqueUserIds(contest.participants.filter((part) => part.side === "A").map((part) => part.userId));
  const bUsers = uniqueUserIds(contest.participants.filter((part) => part.side === "B").map((part) => part.userId));
  contest.participantAScore = normalizedSideScore(aUsers, bUsers, playerTotals);
  contest.participantBScore = bUsers.length ? normalizedSideScore(bUsers, aUsers, playerTotals) : 0;
  contest.status = "FINAL";
  contest.result = contest.participantAScore === contest.participantBScore
    ? "DRAW"
    : contest.participantAScore > contest.participantBScore ? "A_WIN" : "B_WIN";
  contest.updatedAt = new Date().toISOString();
}

function rebuildLeagueStandingsFromFinalContests(data, leagueId, scoreCache = new Map()) {
  const leagueUserIds = data.leagueMembers
    .filter((member) => member.leagueId === leagueId && member.status === "ACTIVE")
    .map((member) => member.userId);
  data.leagueStandings = data.leagueStandings.filter((standing) => standing.leagueId !== leagueId);
  data.leagueStandings.push(...createStandings(leagueId, leagueUserIds));
  const countedUserMatchdays = new Set();

  data.headToHeadContests
    .filter((contest) => contest.leagueId === leagueId && contest.status === "FINAL")
    .sort((a, b) => {
      const matchdaySort = sortMatchdaysForSchedule(
        data.matchdays.find((matchday) => matchday.id === a.matchDayId) || { date: "", name: "" },
        data.matchdays.find((matchday) => matchday.id === b.matchDayId) || { date: "", name: "" }
      );
      if (matchdaySort) return matchdaySort;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0) ||
        String(a.id).localeCompare(String(b.id));
    })
    .forEach((contest) => {
      if (!scoreCache.has(contest.matchDayId)) {
        scoreCache.set(contest.matchDayId, calculateMatchdayScores(data, contest.matchDayId));
      }
      const { cardStats, exactStats } = scoreCache.get(contest.matchDayId);
      updateSide(data, leagueId, contest, "A", contest.participantAScore, contest.participantBScore, cardStats, exactStats, countedUserMatchdays);
      updateSide(data, leagueId, contest, "B", contest.participantBScore, contest.participantAScore, cardStats, exactStats, countedUserMatchdays);
    });
}

function updateSide(data, leagueId, contest, side, scoreFor, scoreAgainst, cardStats, exactStats, countedUserMatchdays = new Set()) {
  const participants = uniqueParticipants(contest.participants.filter((part) => part.side === side));
  participants.forEach((part) => {
    const countedKey = `${contest.matchDayId}::${part.userId}`;
    if (countedUserMatchdays.has(countedKey)) return;
    const standing = data.leagueStandings.find((row) => row.leagueId === leagueId && row.userId === part.userId);
    if (!standing) return;
    countedUserMatchdays.add(countedKey);
    standing.played += 1;
    standing.fantasyPointsFor += scoreFor;
    standing.fantasyPointsAgainst += scoreAgainst;
    standing.scoreDifference += scoreFor - scoreAgainst;
    const result = contest.result;
    const won = (side === "A" && result === "A_WIN") || (side === "B" && result === "B_WIN");
    const drawn = result === "DRAW";
    standing.won += won ? 1 : 0;
    standing.drawn += drawn ? 1 : 0;
    standing.lost += !won && !drawn ? 1 : 0;
    standing.leaguePoints += won ? 3 : drawn ? 1 : 0;
    standing.cardCorrect += cardStats.get(part.userId)?.cardCorrect || 0;
    standing.cardAttempted += cardStats.get(part.userId)?.cardAttempted || 0;
    standing.exactScoresCorrect += exactStats.get(part.userId)?.exactScoresCorrect || 0;
    standing.exactScorePoints += exactStats.get(part.userId)?.exactScorePoints || 0;
    standing.updatedAt = new Date().toISOString();
  });
}

function hydrateState(data, currentUserId = "user_you") {
  ensureDemoScaffold(data);
  refreshMatchdayStatuses(data);
  const matchday = getTodayMatchday(data);
  data.users.forEach(ensureUserPassword);
  const currentUser = data.users.find((user) => user.id === currentUserId) || data.users.find((user) => user.id === "user_you");
  const admin = currentUser.role === "ADMIN";
  const visibleLeagueIds = visibleLeagueIdsForUser(data, currentUser);
  const visibleUserIds = visibleUserIdsForUser(data, currentUser, visibleLeagueIds);
  const hydratedLeagues = hydrateLeagues(data, visibleLeagueIds, { activeMembersOnly: !admin });
  const league = hydratedLeagues.find((item) => item.id === selectLeagueForUser(data, currentUser)?.id) ||
    hydratedLeagues[0] ||
    emptyLeague();
  ensurePlayableCardSetsForUser(data, currentUser.id);
  const cardSet = data.playerCardSets.find((set) => set.matchDayId === matchday.id && set.userId === currentUser.id);
  const playerCards = data.playerCards
    .filter((playerCard) => playerCard.playerCardSetId === cardSet?.id)
    .map((playerCard) => ({
      ...playerCard,
      card: data.predictionCards.find((card) => card.id === playerCard.predictionCardId)
    }));
  const scorePrediction = data.scorePredictions.find((prediction) => prediction.matchDayId === matchday.id && prediction.userId === currentUser.id);
  const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
  const userScopedAssignments = currentUser.role === "ADMIN" ? null : currentUser.id;

  return {
    currentUser: publicUser(currentUser),
    adminUser: admin ? publicUser(data.users.find((user) => user.role === "ADMIN")) : null,
    users: data.users.filter((user) => admin || visibleUserIds.has(user.id)).map(publicUser),
    profiles: data.playerProfiles.filter((profile) => admin || visibleUserIds.has(profile.userId)),
    leagues: hydratedLeagues,
    leagueMembers: data.leagueMembers.filter((member) => (
      visibleLeagueIds.has(member.leagueId) &&
      (admin || member.status === "ACTIVE")
    )),
    league,
    matchdays: data.matchdays
      .slice()
      .sort(sortMatchdaysForSchedule),
    todayMatchdayId: matchday.id,
    todayDate: getLocalDateKey(),
    matchdaySummaries: hydrateMatchdaySummaries(data, league.id, currentUser.id),
    submissionChecks: currentUser.role === "ADMIN" ? hydrateSubmissionChecks(data, league.id) : [],
    matchday,
    matches,
    tournamentSummary: summarizeTournamentData(data),
    playerCards,
    scorePrediction,
    contests: hydrateContests(data, league.id, matchday.id),
    seasonContests: hydrateContests(data, null, null, { leagueIds: visibleLeagueIds }),
    matchupAssignments: hydrateMatchupAssignments(data, league.id, userScopedAssignments),
    standings: hydrateStandings(data, league.id),
    syncLogs: admin ? data.syncLogs.slice(0, 20) : [],
    emailOutbox: admin ? (data.emailOutbox || []).slice(0, 20) : []
  };
}

function selectLeagueForUser(data, user) {
  if (!user || user.role === "ADMIN") return data.leagues[0];
  const membership = data.leagueMembers.find((member) => member.userId === user.id && member.status === "ACTIVE");
  return data.leagues.find((league) => league.id === membership?.leagueId) || data.leagues[0];
}

function visibleLeagueIdsForUser(data, user) {
  if (!user) return new Set();
  if (user.role === "ADMIN") return new Set(data.leagues.map((league) => league.id));
  const leagueIds = data.leagueMembers
    .filter((member) => member.userId === user.id && member.status === "ACTIVE")
    .map((member) => member.leagueId);
  return new Set(leagueIds);
}

function visibleUserIdsForUser(data, user, leagueIds = visibleLeagueIdsForUser(data, user)) {
  if (!user) return new Set();
  if (user.role === "ADMIN") return new Set(data.users.map((item) => item.id));
  const userIds = data.leagueMembers
    .filter((member) => leagueIds.has(member.leagueId) && member.status === "ACTIVE")
    .map((member) => member.userId);
  userIds.push(user.id);
  return new Set(userIds);
}

function canAccessLeague(data, user, leagueId) {
  return visibleLeagueIdsForUser(data, user).has(leagueId);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    hasPassword: Boolean(passwordHash)
  };
}

function hydrateLeagues(data, leagueIds = new Set(data.leagues.map((league) => league.id)), options = {}) {
  return data.leagues.filter((league) => leagueIds.has(league.id)).map((league) => {
    const members = data.leagueMembers.filter((member) => (
      member.leagueId === league.id &&
      (options.activeMembersOnly ? member.status === "ACTIVE" : member.status !== "REMOVED")
    ));
    const contests = data.headToHeadContests.filter((contest) => contest.leagueId === league.id);
    return {
      ...league,
      memberCount: members.length,
      activeMemberCount: members.filter((member) => member.status === "ACTIVE").length,
      invitedMemberCount: members.filter((member) => member.status === "INVITED").length,
      contestCount: contests.length,
      standings: hydrateStandings(data, league.id)
    };
  });
}

function emptyLeague() {
  return {
    id: "__no_active_league__",
    name: "No active league",
    slug: "no-active-league",
    seasonName: "",
    pairingMode: "MIXED",
    memberCount: 0,
    activeMemberCount: 0,
    invitedMemberCount: 0,
    contestCount: 0,
    standings: []
  };
}

function hydrateMatchdaySummaries(data, leagueId, userId) {
  const today = getLocalDateKey();
  return data.matchdays
    .slice()
    .sort(sortMatchdaysForSchedule)
    .map((matchday) => {
      const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
      const predictionCards = data.predictionCards.filter((card) => card.matchDayId === matchday.id);
      const cardSet = data.playerCardSets.find((set) => set.matchDayId === matchday.id && set.userId === userId);
      const playerCards = data.playerCards
        .filter((playerCard) => playerCard.playerCardSetId === cardSet?.id)
        .map((playerCard) => ({
          ...playerCard,
          card: data.predictionCards.find((card) => card.id === playerCard.predictionCardId)
        }));
      const scorePrediction = data.scorePredictions.find((prediction) => prediction.matchDayId === matchday.id && prediction.userId === userId);
      const contests = hydrateContests(data, leagueId, matchday.id);
      const userContest = contests.find((contest) => contest.participants.some((part) => part.userId === userId));
      const userPart = userContest?.participants.find((part) => part.userId === userId);
      const userSide = userPart?.side;
      const matchupAssignment = userContest && userPart
        ? hydrateMatchupAssignment(userContest, userPart)
        : null;
      const teammateNames = userContest
        ? userContest.participants
          .filter((part) => part.side === userSide && part.userId !== userId)
          .map((part) => part.user?.displayName || part.userId)
        : [];
      const opponentNames = userContest
        ? userContest.participants
          .filter((part) => part.side !== userSide)
          .map((part) => part.user?.displayName || part.userId)
        : [];
      const cardPoints = playerCards.reduce((sum, card) => sum + (card.pointsAwarded || 0), 0);
      const exactPoints = scorePrediction?.pointsAwarded || 0;
      const userScore = userSide === "A" ? userContest?.participantAScore : userContest?.participantBScore;
      const opponentScore = userSide === "A" ? userContest?.participantBScore : userContest?.participantAScore;

      return {
        ...matchday,
        isToday: matchday.date === today,
        matches,
        predictionCards,
        predictionCardCount: predictionCards.length,
        playerCards,
        selectedCards: playerCards.filter((card) => card.selected),
        scorePrediction,
        contests,
        userContest,
        userContestId: userContest?.id || null,
        matchupAssignment,
        teammateNames,
        opponentNames,
        userSide,
        cardPoints,
        exactPoints,
        totalPoints: Number((cardPoints + exactPoints).toFixed(1)),
        userScore: userScore ?? 0,
        opponentScore: opponentScore ?? 0,
        resultLabel: getContestResultLabel(userContest, userSide)
      };
    });
}

function hydrateSubmissionChecks(data, leagueId) {
  const members = data.leagueMembers
    .filter((member) => member.leagueId === leagueId && member.status === "ACTIVE")
    .map((member) => ({
      member,
      user: data.users.find((user) => user.id === member.userId)
    }))
    .filter((entry) => entry.user);

  return data.matchdays
    .slice()
    .sort(sortMatchdaysForSchedule)
    .map((matchday) => {
      const rows = members.map(({ member, user }) => {
        const cardSet = data.playerCardSets.find((set) => set.matchDayId === matchday.id && set.userId === user.id);
        const playerCards = data.playerCards.filter((card) => card.playerCardSetId === cardSet?.id);
        const selectedCards = playerCards.filter((card) => card.selected);
        const scorePrediction = data.scorePredictions.find((prediction) => prediction.matchDayId === matchday.id && prediction.userId === user.id);
        const submitted = Boolean(scorePrediction?.submittedAt) && selectedCards.length >= MIN_SELECTED_CARDS;
        return {
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          memberStatus: member.status,
          hasCardSet: Boolean(cardSet),
          cardCount: playerCards.length,
          selectedCount: selectedCards.length,
          requiredCount: MIN_SELECTED_CARDS,
          hasExactScore: Boolean(scorePrediction),
          submitted,
          submittedAt: scorePrediction?.submittedAt || null,
          exactScore: scorePrediction
            ? `${scorePrediction.predictedHomeScore}-${scorePrediction.predictedAwayScore}`
            : null
        };
      });

      return {
        matchDayId: matchday.id,
        submittedCount: rows.filter((row) => row.submitted).length,
        missingCount: rows.filter((row) => !row.submitted).length,
        totalCount: rows.length,
        rows
      };
    });
}

function getTodayMatchday(data) {
  const today = getLocalDateKey();
  const sorted = data.matchdays.slice().sort(sortMatchdaysForSchedule);
  return sorted.find((matchday) => matchday.date === today && matchday.status !== "FINAL") ||
    sorted.find((matchday) => matchday.status === "SCORING") ||
    sorted.find((matchday) => matchday.date >= today && matchday.status !== "FINAL") ||
    sorted.filter((matchday) => matchday.status !== "FINAL").at(-1) ||
    sorted.at(-1);
}

function getLocalDateKey(date = new Date()) {
  return getAppDateKey(date);
}

function getAppDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(DATE_KEY_FORMATTER
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

function sortMatchdaysForSchedule(a, b) {
  return (a.phaseSort || 0) - (b.phaseSort || 0) ||
    new Date(a.date) - new Date(b.date) ||
    a.name.localeCompare(b.name);
}

function getContestResultLabel(contest, userSide) {
  if (!contest || contest.status !== "FINAL") return contest?.status || "SCHEDULED";
  if (contest.result === "DRAW") return "DRAW";
  if ((contest.result === "A_WIN" && userSide === "A") || (contest.result === "B_WIN" && userSide === "B")) return "WIN";
  return "LOSS";
}

function hydrateContests(data, leagueId, matchDayId, options = {}) {
  return data.headToHeadContests
    .filter((contest) => (
      (!options.leagueIds || options.leagueIds.has(contest.leagueId)) &&
      (!leagueId || contest.leagueId === leagueId) &&
      (!matchDayId || contest.matchDayId === matchDayId)
    ))
    .map((contest) => ({
      ...contest,
      participants: contest.participants.map((part) => ({
        ...part,
        user: data.users.find((user) => user.id === part.userId),
        projectedScore: estimateStoredProjectedScore(data, contest.matchDayId, part.userId)
      }))
    }));
}

function hydrateMatchupAssignments(data, leagueId, userId) {
  return hydrateContests(data, leagueId)
    .flatMap((contest) => contest.participants
      .filter((part) => !userId || part.userId === userId)
      .map((part) => hydrateMatchupAssignment(contest, part)));
}

function hydrateMatchupAssignment(contest, part) {
  return {
    id: part.id,
    matchupId: contest.id,
    contestId: contest.id,
    leagueId: contest.leagueId,
    matchDayId: contest.matchDayId,
    userId: part.userId,
    side: part.side,
    status: contest.status
  };
}

function estimateStoredProjectedScore(data, matchDayId, userId) {
  const set = data.playerCardSets.find((item) => item.matchDayId === matchDayId && item.userId === userId);
  const playerCards = data.playerCards.filter((card) => card.playerCardSetId === set?.id);
  const selectedCards = playerCards.filter((card) => card.selected);
  const scorePrediction = data.scorePredictions.find((prediction) => prediction.matchDayId === matchDayId && prediction.userId === userId);
  if (!scorePrediction || !selectedCards.length) return 0;
  const exactScoreBoost = Number((Number(scorePrediction.oddsMultiplier || 0) * 5).toFixed(1));
  return Number((selectedCards.length * CARD_POINTS_CORRECT + exactScoreBoost).toFixed(1));
}

function hydrateStandings(data, leagueId) {
  const activeMemberIds = activeLeagueMemberIds(data, leagueId);
  return data.leagueStandings
    .filter((standing) => standing.leagueId === leagueId && activeMemberIds.has(standing.userId))
    .map((standing) => {
      const user = data.users.find((item) => item.id === standing.userId);
      return {
        ...standing,
        displayName: user?.displayName || standing.userId,
        cardAccuracy: standing.cardAttempted ? Number((standing.cardCorrect / standing.cardAttempted * 100).toFixed(1)) : 0
      };
    })
    .sort((a, b) => (
      b.leaguePoints - a.leaguePoints ||
      b.fantasyPointsFor - a.fantasyPointsFor ||
      b.cardAccuracy - a.cardAccuracy ||
      b.scoreDifference - a.scoreDifference ||
      b.exactScorePoints - a.exactScorePoints ||
      b.exactScoresCorrect - a.exactScoresCorrect
    ));
}

function activeLeagueMemberIds(data, leagueId) {
  return new Set(data.leagueMembers
    .filter((member) => member.leagueId === leagueId && member.status === "ACTIVE")
    .map((member) => member.userId));
}

function sumScores(userIds, playerTotals) {
  return Number(userIds.reduce((sum, userId) => sum + (playerTotals.get(userId) || 0), 0).toFixed(1));
}

function uniqueUserIds(userIds) {
  return [...new Set(userIds.filter(Boolean))];
}

function uniqueParticipants(participants) {
  const seen = new Set();
  return participants.filter((part) => {
    if (!part.userId || seen.has(part.userId)) return false;
    seen.add(part.userId);
    return true;
  });
}

function normalizedSideScore(sideUserIds, opposingUserIds, playerTotals) {
  if (!sideUserIds.length) return 0;
  const uniqueSideUserIds = uniqueUserIds(sideUserIds);
  const uniqueOpposingUserIds = uniqueUserIds(opposingUserIds);
  const sideTotal = sumScores(uniqueSideUserIds, playerTotals);
  const playerBaseline = Math.max(uniqueSideUserIds.length, uniqueOpposingUserIds.length || uniqueSideUserIds.length);
  return Number((sideTotal * (playerBaseline / uniqueSideUserIds.length)).toFixed(1));
}

function upsertLeagueMember(data, memberInput) {
  const existing = data.leagueMembers.find((member) => member.leagueId === memberInput.leagueId && member.userId === memberInput.userId);
  if (existing) {
    existing.status = memberInput.status;
    existing.joinedAt = memberInput.joinedAt;
    existing.inviteCode = memberInput.inviteCode;
    return existing;
  }

  const member = {
    id: `member_${memberInput.leagueId}_${memberInput.userId}`,
    leagueId: memberInput.leagueId,
    userId: memberInput.userId,
    status: memberInput.status,
    joinedAt: memberInput.joinedAt,
    inviteCode: memberInput.inviteCode
  };
  data.leagueMembers.push(member);
  return member;
}

function ensurePlayerProfile(data, user) {
  let profile = data.playerProfiles.find((item) => item.userId === user.id);
  if (profile) {
    profile.nickname = user.displayName;
    profile.updatedAt = new Date().toISOString();
    return profile;
  }

  profile = {
    id: `profile_${user.id}`,
    userId: user.id,
    nickname: user.displayName,
    favoriteTeam: "World Cup",
    country: "US",
    timezone: "America/Los_Angeles",
    metadata: { createdByAdmin: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.playerProfiles.push(profile);
  return profile;
}

function hasOtherAdmin(data, userId) {
  return data.users.some((user) => user.id !== userId && user.role === "ADMIN");
}

function makeInviteCode(leagueId, userId) {
  return Buffer.from(`${leagueId}:${userId}:${Date.now()}`).toString("base64url");
}

function ensureStanding(data, leagueId, userId) {
  const existing = data.leagueStandings.find((standing) => standing.leagueId === leagueId && standing.userId === userId);
  if (existing) return existing;

  const standing = {
    id: `standing_${leagueId}_${userId}`,
    leagueId,
    userId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    leaguePoints: 0,
    fantasyPointsFor: 0,
    fantasyPointsAgainst: 0,
    cardCorrect: 0,
    cardAttempted: 0,
    exactScoresCorrect: 0,
    scoreDifference: 0,
    exactScorePoints: 0,
    updatedAt: new Date().toISOString()
  };
  data.leagueStandings.push(standing);
  return standing;
}

function ensurePlayerCardSet(data, userId, matchDayId = "md_12") {
  let set = data.playerCardSets.find((item) => item.matchDayId === matchDayId && item.userId === userId);
  if (!set) {
    set = {
      id: `set_${matchDayId}_${userId}`,
      matchDayId,
      userId,
      generatedAt: new Date().toISOString()
    };
    data.playerCardSets.push(set);
  }

  const validCardIds = new Set(data.predictionCards
    .filter((card) => card.matchDayId === matchDayId)
    .map((card) => card.id));
  data.playerCards = data.playerCards.filter((card) => (
    card.playerCardSetId !== set.id ||
    validCardIds.has(card.predictionCardId)
  ));

  const assignedIds = new Set(
    data.playerCards
      .filter((card) => card.playerCardSetId === set.id)
      .map((card) => card.predictionCardId)
  );
  const assignedCount = assignedIds.size;
  shuffle(data.predictionCards
    .filter((card) => card.matchDayId === matchDayId)
    .filter((card) => !assignedIds.has(card.id)), `${matchDayId}_${userId}`)
    .slice(0, Math.max(0, CARD_SET_SIZE - assignedCount))
    .forEach((card) => {
      data.playerCards.push({
        id: `pc_${set.id}_${card.id}`,
        playerCardSetId: set.id,
        predictionCardId: card.id,
        selected: false,
        playerAnswer: null,
        isCorrect: null,
        pointsAwarded: 0,
        answeredAt: null
      });
    });

  return set;
}

function ensurePlayableCardSetsForUser(data, userId) {
  data.matchdays
    .filter((matchday) => matchday.status !== "FINAL")
    .forEach((matchday) => {
      const hasGeneratedCards = data.predictionCards.some((card) => card.matchDayId === matchday.id);
      if (hasGeneratedCards) ensurePlayerCardSet(data, userId, matchday.id);
    });
}

function rebuildPlayerCardsForMatchday(data, matchDayId) {
  const activeUserIds = [...new Set(data.leagueMembers
    .filter((member) => member.status !== "REMOVED")
    .map((member) => member.userId)
    .concat(data.playerCardSets
      .filter((set) => set.matchDayId === matchDayId)
      .map((set) => set.userId)))];

  activeUserIds.forEach((userId) => {
    const set = data.playerCardSets.find((item) => item.matchDayId === matchDayId && item.userId === userId) || {
      id: `set_${matchDayId}_${userId}`,
      matchDayId,
      userId,
      generatedAt: new Date().toISOString()
    };
    if (!data.playerCardSets.some((item) => item.id === set.id)) data.playerCardSets.push(set);

    data.playerCards = data.playerCards.filter((card) => card.playerCardSetId !== set.id);
    shuffle(data.predictionCards.filter((card) => card.matchDayId === matchDayId), `${matchDayId}_${userId}`)
      .slice(0, CARD_SET_SIZE)
      .forEach((card) => {
        data.playerCards.push({
          id: `pc_${set.id}_${card.id}`,
          playerCardSetId: set.id,
          predictionCardId: card.id,
          selected: false,
          playerAnswer: null,
          isCorrect: null,
          pointsAwarded: 0,
          answeredAt: null
        });
      });
  });
}

function ensureDemoScaffold(data) {
  ensureDemoMatchdayHistory(data);
  refreshMatchdayStatuses(data);
  ensurePlayableMatchday(data);
  refreshMatchdayStatuses(data);
  ensureCurrentCardRules(data);
}

function ensureCurrentCardRules(data) {
  data.matchdays
    .filter((matchday) => matchday.status !== "FINAL")
    .forEach((matchday) => {
      const cards = data.predictionCards.filter((card) => card.matchDayId === matchday.id);
      if (cards.length < CARD_SET_SIZE) {
        const matches = data.tournamentMatches.filter((match) => match.matchDayId === matchday.id);
        const generatedCards = createCardPool(matchday.id, matches, data.oddsSnapshots);
        const existingIds = new Set(data.predictionCards.map((card) => card.id));
        data.predictionCards.push(...generatedCards.filter((card) => !existingIds.has(card.id)));
      }

      const userIds = [...new Set(data.leagueMembers
        .filter((member) => member.status !== "REMOVED")
        .map((member) => member.userId))];
      userIds.forEach((userId) => ensurePlayerCardSet(data, userId, matchday.id));
    });
}

function ensurePlayableMatchday(data) {
  const today = getLocalDateKey();
  if (data.matchdays.some((matchday) => matchday.date === today && matchday.status !== "FINAL")) return;
  if (data.matchdays.some((matchday) => matchday.date >= today && ["OPEN", "SCHEDULED", "SCORING"].includes(matchday.status))) return;
  if (data.matchdays.some((matchday) => matchday.externalProvider === "football-data")) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const date = today;
  const firstKickoff = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const matchDayId = `md_live_${date.replaceAll("-", "")}_${data.matchdays.length + 1}`;
  if (data.matchdays.some((matchday) => matchday.id === matchDayId)) return;

  data.matchdays.push({
    id: matchDayId,
    name: "Today Matchday",
    date,
    lockAt: firstKickoff,
    status: "OPEN",
    createdAt: nowIso,
    updatedAt: nowIso
  });

  const matches = createPlayableMatches(matchDayId, now);
  data.tournamentMatches.push(...matches);
  data.oddsSnapshots.push(...createPlayableCorrectScoreOdds(matches, nowIso));

  const cards = createCardPool(matchDayId, matches);
  data.predictionCards.push(...cards);

  data.leagues.forEach((league) => {
    const userIds = data.leagueMembers
      .filter((member) => member.leagueId === league.id && member.status === "ACTIVE")
      .map((member) => member.userId);
    userIds.forEach((userId) => ensurePlayerCardSet(data, userId, matchDayId));
    if (userIds.length && !data.headToHeadContests.some((contest) => contest.leagueId === league.id && contest.matchDayId === matchDayId)) {
      data.headToHeadContests.push(...createContests(league.id, matchDayId, userIds, league.pairingMode));
    }
  });

  data.syncLogs.unshift(log("SEED_TODAY", "SUCCESS", "Created an open matchday for today's player view."));
}

function createPlayableMatches(matchDayId, now) {
  const base = [
    ["match_bra_mar", "Brazil", "Morocco", "BRA", "MAR", 2, "Vinicius Junior"],
    ["match_arg_jpn", "Argentina", "Japan", "ARG", "JPN", 5, "Lionel Messi"],
    ["match_ger_can", "Germany", "Canada", "GER", "CAN", 8, "Jamal Musiala"],
    ["match_esp_crc", "Spain", "Costa Rica", "ESP", "CRC", 11, "Alvaro Morata"]
  ];

  return base.map(([baseId, homeTeam, awayTeam, homeTeamCode, awayTeamCode, hoursFromNow, topScorerName], index) => ({
    id: `${baseId}_${matchDayId}`,
    externalProvider: "mock",
    externalId: `fix_${matchDayId}_${index + 1}`,
    matchDayId,
    homeTeam,
    awayTeam,
    homeTeamCode,
    awayTeamCode,
    kickoffAt: new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    firstGoalMinute: null,
    firstGoalTeam: null,
    redCardShown: null,
    topScorerName,
    topScorerScored: null,
    rawData: { seed: "today", topScorerName },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }));
}

function createPlayableCorrectScoreOdds(matches, capturedAt) {
  return matches.flatMap((match) => createCorrectScorePrices().map(([score, price]) => ({
    id: `odds_${match.id}_CORRECT_SCORE_${score.replace(/\W/g, "_")}`,
    tournamentMatchId: match.id,
    provider: "mock",
    marketKey: "CORRECT_SCORE",
    bookmaker: "MockBook",
    outcomeName: score,
    priceDecimal: price,
    priceAmerican: null,
    impliedProbability: Number((1 / price).toFixed(4)),
    rawData: { seed: "today" },
    capturedAt
  })));
}

function createCorrectScorePrices() {
  const scores = [];
  for (let home = 0; home <= 5; home += 1) {
    for (let away = 0; away <= 5; away += 1) {
      const total = home + away;
      const drawPenalty = home === away ? 1.2 : 0;
      const blowoutPenalty = Math.abs(home - away) * 1.35;
      scores.push([`${home}-${away}`, Number((5.8 + total * 1.25 + drawPenalty + blowoutPenalty).toFixed(1))]);
    }
  }
  return scores;
}

function ensureDemoMatchdayHistory(data) {
  if (data.matchdays.some((matchday) => matchday.id === "md_11")) return;

  const now = new Date().toISOString();
  data.matchdays.push({
    id: "md_11",
    name: "Matchday 11",
    date: "2026-06-10",
    lockAt: "2026-06-10T20:00:00.000Z",
    status: "FINAL",
    createdAt: now,
    updatedAt: now
  });

  const historyMatches = [
    {
      id: "match_fra_mex",
      externalProvider: "mock",
      externalId: "fix_fra_mex",
      matchDayId: "md_11",
      homeTeam: "France",
      awayTeam: "Mexico",
      homeTeamCode: "FRA",
      awayTeamCode: "MEX",
      kickoffAt: "2026-06-10T20:00:00.000Z",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 0,
      firstGoalMinute: 22,
      firstGoalTeam: "HOME",
      redCardShown: false,
      topScorerName: "Kylian Mbappe",
      topScorerScored: true,
      rawData: { seed: "history", topScorerName: "Kylian Mbappe" },
      createdAt: now,
      updatedAt: now
    },
    {
      id: "match_eng_usa",
      externalProvider: "mock",
      externalId: "fix_eng_usa",
      matchDayId: "md_11",
      homeTeam: "England",
      awayTeam: "United States",
      homeTeamCode: "ENG",
      awayTeamCode: "USA",
      kickoffAt: "2026-06-10T23:00:00.000Z",
      status: "FINISHED",
      homeScore: 1,
      awayScore: 1,
      firstGoalMinute: 39,
      firstGoalTeam: "AWAY",
      redCardShown: false,
      topScorerName: "Harry Kane",
      topScorerScored: false,
      rawData: { seed: "history", topScorerName: "Harry Kane" },
      createdAt: now,
      updatedAt: now
    }
  ];
  data.tournamentMatches.push(...historyMatches);

  const historyOdds = createCorrectScorePrices().map(([score, price]) => ({
    id: `odds_match_fra_mex_CORRECT_SCORE_${score.replace(/\W/g, "_")}`,
    tournamentMatchId: "match_fra_mex",
    provider: "mock",
    marketKey: "CORRECT_SCORE",
    bookmaker: "MockBook",
    outcomeName: score,
    priceDecimal: price,
    priceAmerican: null,
    impliedProbability: Number((1 / price).toFixed(4)),
    rawData: { seed: "history" },
    capturedAt: now
  }));
  data.oddsSnapshots.push(...historyOdds);

  const historyCards = [
    historyCard(1, "TOTAL_GOALS_OVER", "Over 1.5 Goals", "Will France vs Mexico have over 1.5 total goals?", "match_fra_mex", { threshold: 1.5 }),
    historyCard(2, "CLEAN_SHEET", "France Clean Sheet", "Will France keep a clean sheet?", "match_fra_mex", {}),
    historyCard(3, "FIRST_GOAL_BEFORE", "First Goal Before 30", "Will the first goal happen before minute 30?", "match_fra_mex", { minute: 30 }),
    historyCard(4, "BOTH_TEAMS_SCORE", "Both Teams Score", "Will both teams score in England vs USA?", "match_eng_usa", {}),
    historyCard(5, "TOTAL_GOALS_UNDER", "Under 3.5 Goals", "Will England vs USA have under 3.5 goals?", "match_eng_usa", { threshold: 3.5 }),
    historyCard(6, "WIN_MARGIN", "France by 2+", "Will France win by 2 or more goals?", "match_fra_mex", { team: "HOME", marginAtLeast: 2 }),
    historyCard(7, "WEAKER_TEAM_SCORES", "Mexico Scores", "Will Mexico score at least 1 goal?", "match_fra_mex", { weakerTeam: "AWAY", scoresAtLeast: 1 }),
    historyCard(8, "TOTAL_GOALS_OVER", "England vs USA Over 2.5", "Will England vs USA have over 2.5 goals?", "match_eng_usa", { threshold: 2.5 }),
    historyCard(9, "BOTH_TEAMS_SCORE", "France-Mexico BTTS", "Will France and Mexico both score?", "match_fra_mex", {})
  ];
  data.predictionCards.push(...historyCards);

  const historySet = {
    id: "set_md_11_user_you",
    matchDayId: "md_11",
    userId: "user_you",
    generatedAt: now
  };
  data.playerCardSets.push(historySet);
  const selectedHistoryCardIds = new Set(["old_card_1", "old_card_2", "old_card_3", "old_card_4", "old_card_6"]);
  data.playerCards.push(...historyCards.map((card) => {
    const selected = selectedHistoryCardIds.has(card.id);
    const correct = selected && card.id !== "old_card_4";
    return {
      id: `pc_${historySet.id}_${card.id}`,
      playerCardSetId: historySet.id,
      predictionCardId: card.id,
      selected,
      playerAnswer: selected ? "YES" : null,
      isCorrect: selected ? correct : null,
      pointsAwarded: correct ? 10 : 0,
      answeredAt: selected ? now : null
    };
  }));

  data.scorePredictions.push({
    id: "score_md_11_user_you",
    matchDayId: "md_11",
    userId: "user_you",
    tournamentMatchId: "match_fra_mex",
    predictedHomeScore: 2,
    predictedAwayScore: 0,
    oddsMultiplier: 7.1,
    isExact: true,
    pointsAwarded: 35.5,
    submittedAt: now
  });

  data.headToHeadContests.push({
    id: "contest_md_11_1",
    leagueId: "league_1",
    matchDayId: "md_11",
    mode: "SOLO",
    status: "FINAL",
    participantAName: "user_you",
    participantBName: "user_maya",
    participantAScore: 75.5,
    participantBScore: 58,
    result: "A_WIN",
    participants: [
      { id: "part_md_11_1_a", side: "A", userId: "user_you" },
      { id: "part_md_11_1_b", side: "B", userId: "user_maya" }
    ],
    createdAt: now,
    updatedAt: now
  });

  data.syncLogs.unshift(log("SEED_HISTORY", "SUCCESS", "Added historical Matchday 11 results."));
}

function historyCard(index, cardType, title, questionText, tournamentMatchId, gradingRule) {
  return {
    id: `old_card_${index}`,
    matchDayId: "md_11",
    tournamentMatchId,
    cardType,
    title,
    questionText,
    expectedAnswer: "YES",
    gradingRule,
    estimatedProbability: index % 2 === 0 ? 0.49 : 0.52,
    difficultyLabel: "Balanced",
    sourceOddsSnapshotIds: [],
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mustFind(items, id, label) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${label} not found.`);
  return item;
}

function isLocked(matchday) {
  return ["LOCKED", "SCORING", "FINAL"].includes(matchday.status) || new Date(matchday.lockAt) <= new Date();
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 12) throw new Error("Exact score must be a whole number from 0 to 12.");
  return score;
}

function log(type, status, message) {
  return {
    id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type,
    status,
    message,
    rawData: {},
    createdAt: new Date().toISOString()
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
