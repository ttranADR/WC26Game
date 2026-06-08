import { shuffle } from "./random.js";
import { hashPassword } from "./auth.js";
import { CARD_SET_SIZE, MIN_SELECTED_CARDS } from "./config.js";

export function createSeedData() {
  const now = new Date().toISOString();
  const players = [
    user("admin_1", "admin@pitchpick.local", "Admin", "ADMIN"),
    user("user_you", "you@pitchpick.local", "You", "PLAYER"),
    user("user_maya", "maya@pitchpick.local", "Maya", "PLAYER"),
    user("user_liam", "liam@pitchpick.local", "Liam", "PLAYER"),
    user("user_noah", "noah@pitchpick.local", "Noah", "PLAYER"),
    user("user_ava", "ava@pitchpick.local", "Ava", "PLAYER"),
    user("user_ethan", "ethan@pitchpick.local", "Ethan", "PLAYER"),
    user("user_sofia", "sofia@pitchpick.local", "Sofia", "PLAYER"),
    user("user_omar", "omar@pitchpick.local", "Omar", "PLAYER"),
    user("user_emma", "emma@pitchpick.local", "Emma", "PLAYER"),
    user("user_kenji", "kenji@pitchpick.local", "Kenji", "PLAYER"),
    user("user_lina", "lina@pitchpick.local", "Lina", "PLAYER")
  ];

  const members = players
    .filter((player) => player.role === "PLAYER")
    .map((player) => ({
      id: `member_${player.id}`,
      leagueId: "league_1",
      userId: player.id,
      status: "ACTIVE",
      joinedAt: now
    }));

  const matchday = {
    id: "md_12",
    name: "Matchday 12",
    date: "2026-06-12",
    lockAt: "2026-06-12T20:00:00.000Z",
    status: "OPEN",
    createdAt: now,
    updatedAt: now
  };

  const matches = [
    match("match_bra_mar", "fix_bra_mar", "Brazil", "Morocco", "BRA", "MAR", "2026-06-12T20:00:00.000Z", 2, 1, 18),
    match("match_arg_jpn", "fix_arg_jpn", "Argentina", "Japan", "ARG", "JPN", "2026-06-12T23:00:00.000Z", 1, 1, 43),
    match("match_ger_can", "fix_ger_can", "Germany", "Canada", "GER", "CAN", "2026-06-13T02:00:00.000Z", 3, 0, 12),
    match("match_esp_crc", "fix_esp_crc", "Spain", "Costa Rica", "ESP", "CRC", "2026-06-13T05:00:00.000Z", 2, 0, 36)
  ];

  const odds = createOdds(matches);
  const cards = createCardPool(matchday.id, matches);
  const cardSets = createCardSets(matchday.id, members.map((member) => member.userId), cards);
  const scorePredictions = [
    scorePrediction("score_user_you", "user_you", "match_bra_mar", 2, 1, 6.2),
    scorePrediction("score_user_maya", "user_maya", "match_bra_mar", 1, 1, 5.8),
    scorePrediction("score_user_liam", "user_liam", "match_bra_mar", 3, 1, 9.5)
  ];

  return {
    version: 1,
    updatedAt: now,
    users: players,
    playerProfiles: players.filter((player) => player.role === "PLAYER").map((player) => ({
      id: `profile_${player.id}`,
      userId: player.id,
      nickname: player.displayName,
      favoriteTeam: player.id === "user_you" ? "Brazil" : "World Cup",
      country: "US",
      timezone: "America/Los_Angeles",
      metadata: { seedUser: true },
      createdAt: now,
      updatedAt: now
    })),
    leagues: [{
      id: "league_1",
      name: "Golden Boot League",
      slug: "golden-boot-league",
      seasonName: "World Cup 2026",
      pairingMode: "SOLO",
      createdByUserId: "admin_1",
      createdAt: now,
      updatedAt: now
    }],
    leagueMembers: members,
    matchdays: [matchday],
    tournamentMatches: matches,
    oddsSnapshots: odds,
    predictionCards: cards,
    playerCardSets: cardSets.sets,
    playerCards: cardSets.playerCards,
    scorePredictions,
    headToHeadContests: createContests("league_1", matchday.id, members.map((member) => member.userId), "SOLO"),
    leagueStandings: createStandings("league_1", members.map((member) => member.userId)),
    syncLogs: [{
      id: "log_seed",
      type: "SEED",
      status: "SUCCESS",
      message: "Seeded mock World Cup league with 11 players.",
      rawData: {},
      createdAt: now
    }]
  };
}

function user(id, email, displayName, role) {
  return {
    id,
    email,
    displayName,
    avatarUrl: `assets/${id}.svg`,
    role,
    passwordHash: hashPassword(role === "ADMIN" ? "admin123" : "player123"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function match(id, externalId, homeTeam, awayTeam, homeTeamCode, awayTeamCode, kickoffAt, homeScore, awayScore, firstGoalMinute) {
  return {
    id,
    externalProvider: "mock",
    externalId,
    matchDayId: "md_12",
    homeTeam,
    awayTeam,
    homeTeamCode,
    awayTeamCode,
    kickoffAt,
    status: "FINISHED",
    homeScore,
    awayScore,
    firstGoalMinute,
    rawData: { seed: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createOdds(matches) {
  return matches.flatMap((matchItem) => [
    odd(matchItem.id, "MATCH_WINNER", matchItem.homeTeam, 1.7),
    odd(matchItem.id, "MATCH_WINNER", "Draw", 3.4),
    odd(matchItem.id, "MATCH_WINNER", matchItem.awayTeam, 4.8),
    odd(matchItem.id, "TOTAL_GOALS", "Over 2.5", 1.6),
    odd(matchItem.id, "TOTAL_GOALS", "Under 2.5", 2.2),
    odd(matchItem.id, "BOTH_TEAMS_SCORE", "Yes", 1.7),
    odd(matchItem.id, "BOTH_TEAMS_SCORE", "No", 2.0),
    ...createCorrectScorePrices().map(([score, price]) => odd(matchItem.id, "CORRECT_SCORE", score, price))
  ]);
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

function odd(tournamentMatchId, marketKey, outcomeName, priceDecimal) {
  return {
    id: `odds_${tournamentMatchId}_${marketKey}_${outcomeName.replace(/\W/g, "_")}`,
    tournamentMatchId,
    provider: "mock",
    marketKey,
    bookmaker: "MockBook",
    outcomeName,
    priceDecimal,
    priceAmerican: null,
    impliedProbability: Number((1 / priceDecimal).toFixed(4)),
    rawData: { seed: true },
    capturedAt: new Date().toISOString()
  };
}

export function createCardPool(matchDayId, matches, oddsSnapshots = []) {
  const fallbackMatch = {
    id: "match_bra_mar",
    homeTeam: "Brazil",
    awayTeam: "Morocco",
    homeTeamCode: "BRA",
    awayTeamCode: "MAR"
  };
  const activeMatches = matches.length ? matches : [fallbackMatch];
  const cardIdPrefix = matchDayId === "md_12" ? "card" : `card_${matchDayId}`;
  const perMatch = activeMatches.map((matchItem) => createMatchCardCandidates(matchDayId, matchItem, oddsSnapshots));
  const cards = [];

  for (let round = 0; cards.length < CARD_SET_SIZE && round < 12; round += 1) {
    perMatch.forEach((candidates, matchIndex) => {
      const candidate = candidates[(round + matchIndex * 3) % candidates.length];
      if (cards.length < CARD_SET_SIZE && candidate) cards.push(candidate);
    });
  }

  return cards.slice(0, CARD_SET_SIZE).map((card, index) => ({
    ...card,
    id: `${cardIdPrefix}_${index + 1}`,
    displayIndex: index + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function createMatchCardCandidates(matchDayId, matchItem, oddsSnapshots) {
  const label = `${matchItem.homeTeam} vs ${matchItem.awayTeam}`;
  const homeCode = matchItem.homeTeamCode || matchItem.homeTeam.slice(0, 3).toUpperCase();
  const awayCode = matchItem.awayTeamCode || matchItem.awayTeam.slice(0, 3).toUpperCase();
  const weakerSide = findWeakerSide(matchItem, oddsSnapshots);
  const weakerName = weakerSide === "HOME" ? matchItem.homeTeam : matchItem.awayTeam;
  const candidates = [
    ["WIN_MARGIN", `${homeCode} Win`, `Will ${matchItem.homeTeam} beat ${matchItem.awayTeam}?`, { team: "HOME", marginAtLeast: 1 }, "MATCH_WINNER", matchItem.homeTeam],
    ["WIN_MARGIN", `${awayCode} Win`, `Will ${matchItem.awayTeam} beat ${matchItem.homeTeam}?`, { team: "AWAY", marginAtLeast: 1 }, "MATCH_WINNER", matchItem.awayTeam],
    ["DRAW", `${homeCode}-${awayCode} Draw`, `Will ${label} finish level after regulation?`, {}, "MATCH_WINNER", "Draw"],
    ["TOTAL_GOALS_OVER", "Over 1.5 Goals", `Will ${label} have over 1.5 total goals?`, { threshold: 1.5 }, "TOTAL_GOALS", "Over 1.5"],
    ["TOTAL_GOALS_OVER", "Over 2.5 Goals", `Will ${label} have over 2.5 total goals?`, { threshold: 2.5 }, "TOTAL_GOALS", "Over 2.5"],
    ["TOTAL_GOALS_UNDER", "Under 2.5 Goals", `Will ${label} have under 2.5 total goals?`, { threshold: 2.5 }, "TOTAL_GOALS", "Under 2.5"],
    ["TOTAL_GOALS_UNDER", "Under 3.5 Goals", `Will ${label} have under 3.5 total goals?`, { threshold: 3.5 }, "TOTAL_GOALS", "Under 3.5"],
    ["BOTH_TEAMS_SCORE", "Both Teams Score", `Will both teams score in ${label}?`, {}, "BOTH_TEAMS_SCORE", "Yes"],
    ["CLEAN_SHEET", "Clean Sheet", `Will either team keep a clean sheet in ${label}?`, {}, "BOTH_TEAMS_SCORE", "No"],
    ["WIN_MARGIN", `${homeCode} by 2+`, `Will ${matchItem.homeTeam} win by 2 or more goals?`, { team: "HOME", marginAtLeast: 2 }, "MATCH_WINNER", matchItem.homeTeam],
    ["WEAKER_TEAM_SCORES", `${weakerName} Scores`, `Will ${weakerName} score at least 1 goal?`, { weakerTeam: weakerSide, scoresAtLeast: 1 }, null, null],
    ["FIRST_GOAL_BEFORE", "Early First Goal", `Will the first goal in ${label} happen before minute 30?`, { minute: 30 }, null, null]
  ];

  return candidates.map(([cardType, title, questionText, gradingRule, marketKey, outcomeName], index) => {
    const sourceOdd = marketKey ? findBestOdd(oddsSnapshots, matchItem.id, marketKey, outcomeName) : null;
    return {
      matchDayId,
      tournamentMatchId: matchItem.id,
      cardType,
      title,
      questionText,
      expectedAnswer: "YES",
      gradingRule,
      estimatedProbability: sourceOdd?.impliedProbability || (index % 2 === 0 ? 0.51 : 0.48),
      difficultyLabel: sourceOdd ? difficultyFromProbability(sourceOdd.impliedProbability) : "Balanced",
      sourceOddsSnapshotIds: sourceOdd?.id ? [sourceOdd.id] : [],
      status: "ACTIVE"
    };
  });
}

function findBestOdd(oddsSnapshots, tournamentMatchId, marketKey, outcomeName) {
  return oddsSnapshots
    .filter((odd) => (
      odd.tournamentMatchId === tournamentMatchId &&
      odd.marketKey === marketKey &&
      normalizeOddOutcome(odd.outcomeName) === normalizeOddOutcome(outcomeName)
    ))
    .sort((a, b) => Number(a.priceDecimal) - Number(b.priceDecimal))[0];
}

function normalizeOddOutcome(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findWeakerSide(matchItem, oddsSnapshots) {
  const homeOdd = findBestOdd(oddsSnapshots, matchItem.id, "MATCH_WINNER", matchItem.homeTeam);
  const awayOdd = findBestOdd(oddsSnapshots, matchItem.id, "MATCH_WINNER", matchItem.awayTeam);
  if (homeOdd && awayOdd) return Number(homeOdd.priceDecimal) > Number(awayOdd.priceDecimal) ? "HOME" : "AWAY";
  return "AWAY";
}

function difficultyFromProbability(probability) {
  if (probability >= 0.58) return "Likely";
  if (probability <= 0.36) return "Bold";
  return "Balanced";
}

function createCardSets(matchDayId, userIds, cards) {
  const sets = [];
  const playerCards = [];

  userIds.forEach((userId) => {
    const playerCardSetId = `set_${matchDayId}_${userId}`;
    sets.push({ id: playerCardSetId, matchDayId, userId, generatedAt: new Date().toISOString() });

    shuffle(cards, `${matchDayId}_${userId}`).slice(0, CARD_SET_SIZE).forEach((card, index) => {
      const selected = index < MIN_SELECTED_CARDS;
      playerCards.push({
        id: `pc_${playerCardSetId}_${card.id}`,
        playerCardSetId,
        predictionCardId: card.id,
        selected,
        playerAnswer: selected ? "YES" : null,
        isCorrect: null,
        pointsAwarded: 0,
        answeredAt: selected ? new Date().toISOString() : null
      });
    });
  });

  return { sets, playerCards };
}

function scorePrediction(id, userId, tournamentMatchId, predictedHomeScore, predictedAwayScore, oddsMultiplier) {
  return {
    id,
    matchDayId: "md_12",
    userId,
    tournamentMatchId,
    predictedHomeScore,
    predictedAwayScore,
    oddsMultiplier,
    isExact: null,
    pointsAwarded: 0,
    submittedAt: new Date().toISOString()
  };
}

export function createContests(leagueId, matchDayId, userIds, mode) {
  const shuffled = shuffle(userIds, `${leagueId}_${matchDayId}_${mode}`);
  const contests = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i];
    const b = shuffled[i + 1] || null;
    contests.push({
      id: `contest_${matchDayId}_${i / 2 + 1}`,
      leagueId,
      matchDayId,
      mode,
      status: "SCHEDULED",
      participantAName: a,
      participantBName: b || "Bye",
      participantAScore: 0,
      participantBScore: 0,
      result: null,
      participants: [
        { id: `part_${matchDayId}_${i}_a`, side: "A", userId: a },
        ...(b ? [{ id: `part_${matchDayId}_${i}_b`, side: "B", userId: b }] : [])
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return contests;
}

export function createStandings(leagueId, userIds) {
  return userIds.map((userId) => ({
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
  }));
}
