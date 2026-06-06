import { shuffle } from "./random.js";
import { hashPassword } from "./auth.js";

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
  const scores = [
    ["0-0", 7.5], ["1-0", 6.6], ["1-1", 5.8], ["2-1", 6.2],
    ["2-0", 7.1], ["3-1", 9.5], ["0-1", 10.5], ["1-2", 11.5], ["3-0", 12.0]
  ];

  return matches.flatMap((matchItem) => [
    odd(matchItem.id, "MATCH_WINNER", matchItem.homeTeam, 1.7),
    odd(matchItem.id, "MATCH_WINNER", "Draw", 3.4),
    odd(matchItem.id, "MATCH_WINNER", matchItem.awayTeam, 4.8),
    odd(matchItem.id, "TOTAL_GOALS", "Over 2.5", 1.6),
    odd(matchItem.id, "TOTAL_GOALS", "Under 2.5", 2.2),
    odd(matchItem.id, "BOTH_TEAMS_SCORE", "Yes", 1.7),
    odd(matchItem.id, "BOTH_TEAMS_SCORE", "No", 2.0),
    ...scores.map(([score, price]) => odd(matchItem.id, "CORRECT_SCORE", score, price))
  ]);
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

export function createCardPool(matchDayId, matches) {
  const primary = matches[0] || {
    id: "match_bra_mar",
    homeTeam: "Brazil",
    awayTeam: "Morocco",
    homeTeamCode: "BRA",
    awayTeamCode: "MAR"
  };
  const secondary = matches[1] || primary;
  const primaryLabel = `${primary.homeTeam} vs ${primary.awayTeam}`;
  const secondaryLabel = `${secondary.homeTeam} vs ${secondary.awayTeam}`;
  const homeTeam = primary.homeTeam;
  const awayTeam = primary.awayTeam;
  const cardIdPrefix = matchDayId === "md_12" ? "card" : `card_${matchDayId}`;
  const base = [
    ["TOTAL_GOALS_OVER", "Over 2.5 Goals", `Will ${primaryLabel} have over 2.5 total goals?`, primary.id, { threshold: 2.5 }],
    ["WEAKER_TEAM_SCORES", `${awayTeam} Scores`, `Will ${awayTeam} score at least 1 goal?`, primary.id, { weakerTeam: "AWAY", scoresAtLeast: 1 }],
    ["FIRST_GOAL_BEFORE", "First Goal Before 30", `Will the first goal in ${primaryLabel} happen before minute 30?`, primary.id, { minute: 30 }],
    ["BOTH_TEAMS_SCORE", "Both Teams Score", `Will both teams score in ${primaryLabel}?`, primary.id, {}],
    ["CLEAN_SHEET", "Clean Sheet", `Will either team keep a clean sheet in ${primaryLabel}?`, primary.id, {}],
    ["TOTAL_GOALS_OVER", `${primary.homeTeamCode}-${primary.awayTeamCode} Over 1.5`, `Will ${primaryLabel} have over 1.5 total goals?`, primary.id, { threshold: 1.5 }],
    ["WIN_MARGIN", `${homeTeam} by 2+`, `Will ${homeTeam} win by 2 or more goals?`, primary.id, { team: "HOME", marginAtLeast: 2 }],
    ["TOTAL_GOALS_UNDER", "Under 3.5 Goals", `Will ${secondaryLabel} have under 3.5 goals?`, secondary.id, { threshold: 3.5 }],
    ["WEAKER_TEAM_SCORES", "Underdog Scores", `Will ${awayTeam} score at least 1 goal?`, primary.id, { weakerTeam: "AWAY", scoresAtLeast: 1 }]
  ];

  return base.map(([cardType, title, questionText, tournamentMatchId, gradingRule], index) => ({
    id: `${cardIdPrefix}_${index + 1}`,
    matchDayId,
    tournamentMatchId,
    cardType,
    title,
    questionText,
    expectedAnswer: "YES",
    gradingRule,
    estimatedProbability: index % 2 === 0 ? 0.51 : 0.48,
    difficultyLabel: "Balanced",
    sourceOddsSnapshotIds: [],
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function createCardSets(matchDayId, userIds, cards) {
  const sets = [];
  const playerCards = [];

  userIds.forEach((userId) => {
    const playerCardSetId = `set_${matchDayId}_${userId}`;
    sets.push({ id: playerCardSetId, matchDayId, userId, generatedAt: new Date().toISOString() });

    shuffle(cards, `${matchDayId}_${userId}`).slice(0, 9).forEach((card, index) => {
      const selected = userId === "user_you" ? [0, 1, 3, 5, 8].includes(index) : index < 5;
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
