import { shuffle } from "./random.js";
import { hashPassword } from "./auth.js";
import { CARD_SET_SIZE, MIN_SELECTED_CARDS } from "./config.js";

export const PAIRING_MODES = ["MIXED", "SOLO", "DUO", "HALF"];
const CONTEST_PAIRING_MODES = ["SOLO", "DUO", "HALF"];

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
    match("match_bra_mar", "fix_bra_mar", "Brazil", "Morocco", "BRA", "MAR", "2026-06-12T20:00:00.000Z", 2, 1, 18, "HOME", false, "Vinicius Junior", true),
    match("match_arg_jpn", "fix_arg_jpn", "Argentina", "Japan", "ARG", "JPN", "2026-06-12T23:00:00.000Z", 1, 1, 43, "AWAY", false, "Lionel Messi", false),
    match("match_ger_can", "fix_ger_can", "Germany", "Canada", "GER", "CAN", "2026-06-13T02:00:00.000Z", 3, 0, 12, "HOME", true, "Jamal Musiala", true),
    match("match_esp_crc", "fix_esp_crc", "Spain", "Costa Rica", "ESP", "CRC", "2026-06-13T05:00:00.000Z", 2, 0, 36, "HOME", false, "Alvaro Morata", false)
  ];

  const odds = createOdds(matches);
  const cards = createCardPool(matchday.id, matches);
  const cardSets = createCardSets(matchday.id, members.map((member) => member.userId), cards);
  const scorePredictions = [
    scorePrediction("score_user_you", "user_you", "match_bra_mar", 2, 1, 6.2),
    scorePrediction("score_user_you_match_arg_jpn", "user_you", "match_arg_jpn", 0, 0, 7.0),
    scorePrediction("score_user_you_match_ger_can", "user_you", "match_ger_can", 0, 0, 7.0),
    scorePrediction("score_user_you_match_esp_crc", "user_you", "match_esp_crc", 0, 0, 7.0),
    scorePrediction("score_user_maya", "user_maya", "match_bra_mar", 1, 1, 5.8),
    scorePrediction("score_user_maya_match_arg_jpn", "user_maya", "match_arg_jpn", 0, 0, 7.0),
    scorePrediction("score_user_maya_match_ger_can", "user_maya", "match_ger_can", 0, 0, 7.0),
    scorePrediction("score_user_maya_match_esp_crc", "user_maya", "match_esp_crc", 0, 0, 7.0),
    scorePrediction("score_user_liam", "user_liam", "match_bra_mar", 3, 1, 9.5),
    scorePrediction("score_user_liam_match_arg_jpn", "user_liam", "match_arg_jpn", 0, 0, 7.0),
    scorePrediction("score_user_liam_match_ger_can", "user_liam", "match_ger_can", 0, 0, 7.0),
    scorePrediction("score_user_liam_match_esp_crc", "user_liam", "match_esp_crc", 0, 0, 7.0)
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
      pairingMode: "MIXED",
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

function match(id, externalId, homeTeam, awayTeam, homeTeamCode, awayTeamCode, kickoffAt, homeScore, awayScore, firstGoalMinute, firstGoalTeam, redCardShown, topScorerName, topScorerScored) {
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
    firstGoalTeam,
    redCardShown,
    topScorerName,
    topScorerScored,
    rawData: { seed: true, topScorerName },
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

export function createCardsFromOdds(matchDayId, matches, oddsSnapshots = [], seedText = `${matchDayId}_${Date.now()}`) {
  const matchById = new Map(matches.map((matchItem) => [matchItem.id, matchItem]));
  const candidates = shuffle(oddsSnapshots
    .filter((odd) => matchById.has(odd.tournamentMatchId))
    .map((odd) => createCardFromOdd(matchDayId, matchById.get(odd.tournamentMatchId), odd))
    .filter(Boolean), seedText);

  const picked = [];
  const seen = new Set();
  const marketCounts = new Map();
  const oddsCardTarget = Math.max(MIN_SELECTED_CARDS, CARD_SET_SIZE - 3);
  const marketCaps = new Map([
    ["MATCH_WINNER", 5],
    ["TOTAL_GOALS", 5],
    ["BOTH_TEAMS_SCORE", 4]
  ]);

  for (const card of candidates) {
    if (picked.length >= oddsCardTarget) break;
    const key = getCardMeaningKey(card);
    const marketCount = marketCounts.get(card.sourceMarketKey) || 0;
    const marketCap = marketCaps.get(card.sourceMarketKey) || CARD_SET_SIZE;
    if (seen.has(key) || marketCount >= marketCap) continue;
    picked.push(card);
    seen.add(key);
    marketCounts.set(card.sourceMarketKey, marketCount + 1);
  }

  for (const card of candidates) {
    if (picked.length >= oddsCardTarget) break;
    const key = getCardMeaningKey(card);
    if (seen.has(key)) continue;
    picked.push(card);
    seen.add(key);
  }

  const templateCards = matches
    .flatMap((matchItem) => createMatchCardCandidates(matchDayId, matchItem, oddsSnapshots))
    .filter((card) => !card.sourceOddsSnapshotIds?.length);
  const priorityTemplateCards = ["FIRST_TEAM_TO_SCORE", "RED_CARD", "TOP_SCORER_SCORES"]
    .flatMap((cardType) => shuffle(templateCards.filter((card) => card.cardType === cardType), `${seedText}_${cardType}`).slice(0, 1));
  const priorityKeys = new Set(priorityTemplateCards.map(getCardMeaningKey));
  const templateCandidates = [
    ...priorityTemplateCards,
    ...shuffle(templateCards.filter((card) => !priorityKeys.has(getCardMeaningKey(card))), `${seedText}_templates`)
  ];

  for (const card of templateCandidates) {
    if (picked.length >= CARD_SET_SIZE) break;
    const key = getCardMeaningKey(card);
    if (seen.has(key)) continue;
    picked.push(card);
    seen.add(key);
  }

  return picked.slice(0, CARD_SET_SIZE).map(({ sourceMarketKey, ...card }, index) => ({
    ...card,
    id: `${cardIdPrefix(matchDayId)}_${index + 1}`,
    displayIndex: index + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
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
    id: `${cardIdPrefix(matchDayId)}_${index + 1}`,
    displayIndex: index + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function createCardFromOdd(matchDayId, matchItem, odd) {
  const homeCode = matchItem.homeTeamCode || matchItem.homeTeam.slice(0, 3).toUpperCase();
  const awayCode = matchItem.awayTeamCode || matchItem.awayTeam.slice(0, 3).toUpperCase();
  const label = `${matchItem.homeTeam} vs ${matchItem.awayTeam}`;
  const probability = balancedCardProbability(probabilityFromOdd(odd));
  const base = {
    matchDayId,
    tournamentMatchId: matchItem.id,
    expectedAnswer: "YES",
    estimatedProbability: probability,
    difficultyLabel: difficultyFromProbability(probability),
    sourceOddsSnapshotIds: odd.id ? [odd.id] : [],
    sourceMarketKey: odd.marketKey,
    status: "ACTIVE"
  };
  const outcome = normalizeOddOutcome(odd.outcomeName);
  const homeOutcomes = [matchItem.homeTeam, homeCode].map(normalizeOddOutcome);
  const awayOutcomes = [matchItem.awayTeam, awayCode].map(normalizeOddOutcome);

  if (odd.marketKey === "MATCH_WINNER") {
    if (outcome === "draw" || outcome === "tie") {
      return {
        ...base,
        cardType: "DRAW",
        title: `${homeCode}-${awayCode} Draw`,
        questionText: `Will ${label} finish level after regulation?`,
        gradingRule: {}
      };
    }
    if (homeOutcomes.includes(outcome)) {
      return {
        ...base,
        cardType: "WIN_MARGIN",
        title: `${homeCode} Win`,
        questionText: `Will ${matchItem.homeTeam} beat ${matchItem.awayTeam}?`,
        gradingRule: { team: "HOME", marginAtLeast: 1 }
      };
    }
    if (awayOutcomes.includes(outcome)) {
      return {
        ...base,
        cardType: "WIN_MARGIN",
        title: `${awayCode} Win`,
        questionText: `Will ${matchItem.awayTeam} beat ${matchItem.homeTeam}?`,
        gradingRule: { team: "AWAY", marginAtLeast: 1 }
      };
    }
  }

  if (odd.marketKey === "TOTAL_GOALS") {
    const total = parseGoalTotal(odd.outcomeName);
    if (!total) return null;
    const [side, threshold] = total;
    const over = side === "OVER";
    return {
      ...base,
      cardType: over ? "TOTAL_GOALS_OVER" : "TOTAL_GOALS_UNDER",
      title: `${over ? "Over" : "Under"} ${threshold} Goals`,
      questionText: `Will ${label} have ${over ? "over" : "under"} ${threshold} total goals?`,
      gradingRule: { threshold }
    };
  }

  if (odd.marketKey === "BOTH_TEAMS_SCORE") {
    const yes = ["yes", "y", "true"].includes(outcome);
    const no = ["no", "n", "false"].includes(outcome);
    if (!yes && !no) return null;
    return {
      ...base,
      cardType: yes ? "BOTH_TEAMS_SCORE" : "CLEAN_SHEET",
      title: yes ? "Both Teams Score" : "No BTTS",
      questionText: yes
        ? `Will both teams score in ${label}?`
        : `Will at least one team fail to score in ${label}?`,
      expectedAnswer: "YES",
      gradingRule: {}
    };
  }

  return null;
}

export function getCardMeaningKey(card) {
  if (["TOTAL_GOALS_OVER", "TOTAL_GOALS_UNDER"].includes(card.cardType)) {
    return [card.tournamentMatchId, "TOTAL_GOALS", card.gradingRule?.threshold].join("::");
  }
  if (["BOTH_TEAMS_SCORE", "CLEAN_SHEET"].includes(card.cardType)) {
    return [card.tournamentMatchId, "BOTH_TEAMS_SCORE"].join("::");
  }
  if (card.cardType === "FIRST_TEAM_TO_SCORE") {
    return [card.tournamentMatchId, "FIRST_TEAM_TO_SCORE"].join("::");
  }
  if (card.cardType === "RED_CARD") {
    return [card.tournamentMatchId, "RED_CARD"].join("::");
  }
  if (card.cardType === "TOP_SCORER_SCORES") {
    return [card.tournamentMatchId, "TOP_SCORER_SCORES", normalizeOddOutcome(card.gradingRule?.scorerName)].join("::");
  }
  return [
    card.tournamentMatchId,
    card.cardType,
    card.expectedAnswer,
    JSON.stringify(card.gradingRule)
  ].join("::");
}

function cardIdPrefix(matchDayId) {
  return matchDayId === "md_12" ? "card" : `card_${matchDayId}`;
}

function parseGoalTotal(value) {
  const match = String(value || "").match(/\b(over|under)\s*(\d+(?:\.\d+)?)\b/i);
  if (!match) return null;
  return [match[1].toUpperCase(), Number(match[2])];
}

function probabilityFromOdd(odd) {
  const implied = Number(odd.impliedProbability);
  if (Number.isFinite(implied) && implied > 0 && implied < 1) return implied;
  const price = Number(odd.priceDecimal);
  if (Number.isFinite(price) && price > 1) return Number((1 / price).toFixed(4));
  return 0.5;
}

function balancedCardProbability(value) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return 0.5;
  if (probability < 0.4) return Number((0.4 + probability * 0.5).toFixed(4));
  if (probability > 0.6) return Number((0.6 - (Math.min(1, probability) - 0.6) * 0.25).toFixed(4));
  return Number(probability.toFixed(4));
}

function createMatchCardCandidates(matchDayId, matchItem, oddsSnapshots) {
  const label = `${matchItem.homeTeam} vs ${matchItem.awayTeam}`;
  const homeCode = matchItem.homeTeamCode || matchItem.homeTeam.slice(0, 3).toUpperCase();
  const awayCode = matchItem.awayTeamCode || matchItem.awayTeam.slice(0, 3).toUpperCase();
  const weakerSide = findWeakerSide(matchItem, oddsSnapshots);
  const weakerName = weakerSide === "HOME" ? matchItem.homeTeam : matchItem.awayTeam;
  const firstScoreSide = findFavoredSide(matchItem, oddsSnapshots);
  const firstScoreName = firstScoreSide === "HOME" ? matchItem.homeTeam : matchItem.awayTeam;
  const firstScoreCode = firstScoreSide === "HOME" ? homeCode : awayCode;
  const featuredScorerName = getFeaturedScorerName(matchItem, firstScoreSide);
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
    ["FIRST_TEAM_TO_SCORE", `${firstScoreCode} Scores First`, `Will ${firstScoreName} score first in ${label}?`, { team: firstScoreSide }, null, null],
    ["RED_CARD", "Red Card", `Will ${label} have a red card?`, {}, null, null],
    ...(featuredScorerName ? [["TOP_SCORER_SCORES", `${featuredScorerName} Scores`, `Will ${featuredScorerName} score in ${label}?`, { scorerName: featuredScorerName }, null, null]] : []),
    ["WIN_MARGIN", `${homeCode} by 2+`, `Will ${matchItem.homeTeam} win by 2 or more goals?`, { team: "HOME", marginAtLeast: 2 }, "MATCH_WINNER", matchItem.homeTeam],
    ["WEAKER_TEAM_SCORES", `${weakerName} Scores`, `Will ${weakerName} score at least 1 goal?`, { weakerTeam: weakerSide, scoresAtLeast: 1 }, null, null],
    ["FIRST_GOAL_BEFORE", "Early First Goal", `Will the first goal in ${label} happen before minute 30?`, { minute: 30 }, null, null]
  ];

  const cards = candidates.map(([cardType, title, questionText, gradingRule, marketKey, outcomeName], index) => {
    const sourceOdd = marketKey ? findBestOdd(oddsSnapshots, matchItem.id, marketKey, outcomeName) : null;
    const probability = balancedCardProbability(sourceOdd?.impliedProbability ?? (index % 2 === 0 ? 0.51 : 0.48));
    return {
      matchDayId,
      tournamentMatchId: matchItem.id,
      cardType,
      title,
      questionText,
      expectedAnswer: "YES",
      gradingRule,
      estimatedProbability: probability,
      difficultyLabel: difficultyFromProbability(probability),
      sourceOddsSnapshotIds: sourceOdd?.id ? [sourceOdd.id] : [],
      sourceMarketKey: marketKey || "QUESTION_TEMPLATE",
      status: "ACTIVE"
    };
  });

  const seen = new Set();
  return cards.filter((card) => {
    const key = getCardMeaningKey(card);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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

function findFavoredSide(matchItem, oddsSnapshots) {
  const homeOdd = findBestOdd(oddsSnapshots, matchItem.id, "MATCH_WINNER", matchItem.homeTeam);
  const awayOdd = findBestOdd(oddsSnapshots, matchItem.id, "MATCH_WINNER", matchItem.awayTeam);
  if (homeOdd && awayOdd) return Number(homeOdd.priceDecimal) <= Number(awayOdd.priceDecimal) ? "HOME" : "AWAY";
  return "HOME";
}

function getFeaturedScorerName(matchItem, preferredSide = "HOME") {
  const preferredTeam = preferredSide === "AWAY" ? matchItem.awayTeam : matchItem.homeTeam;
  const fallbackTeam = preferredSide === "AWAY" ? matchItem.homeTeam : matchItem.awayTeam;
  return scorerForTeam(preferredTeam) || scorerForTeam(fallbackTeam);
}

function scorerForTeam(teamName) {
  const scorers = new Map([
    ["argentina", "Lionel Messi"],
    ["brazil", "Vinicius Junior"],
    ["canada", "Jonathan David"],
    ["costa rica", "Manfred Ugalde"],
    ["czech", "Patrik Schick"],
    ["czech republic", "Patrik Schick"],
    ["england", "Harry Kane"],
    ["france", "Kylian Mbappe"],
    ["germany", "Jamal Musiala"],
    ["japan", "Takumi Minamino"],
    ["korea", "Son Heung-min"],
    ["south korea", "Son Heung-min"],
    ["mexico", "Santiago Gimenez"],
    ["morocco", "Youssef En-Nesyri"],
    ["portugal", "Cristiano Ronaldo"],
    ["rsa", "Percy Tau"],
    ["senegal", "Sadio Mane"],
    ["south africa", "Percy Tau"],
    ["spain", "Alvaro Morata"],
    ["united states", "Christian Pulisic"],
    ["usa", "Christian Pulisic"]
  ]);
  return scorers.get(normalizeOddOutcome(teamName)) || null;
}

function difficultyFromProbability(probability) {
  if (probability >= 0.56) return "Likely";
  if (probability <= 0.44) return "Bold";
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
        playerAnswer: selected ? card.expectedAnswer : null,
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

export function normalizePairingMode(mode, fallback = "MIXED") {
  const value = String(mode || "").trim().toUpperCase();
  if (value === "RANDOM") return "MIXED";
  if (value === "TEAM") return "HALF";
  return PAIRING_MODES.includes(value) ? value : fallback;
}

export function resolveContestMode(leagueId, matchDayId, mode, seedText = "", modeIndex = null) {
  const normalized = normalizePairingMode(mode);
  if (normalized !== "MIXED") return normalized;
  if (Number.isInteger(modeIndex)) return CONTEST_PAIRING_MODES[modeIndex % CONTEST_PAIRING_MODES.length];
  return shuffle(CONTEST_PAIRING_MODES, `${leagueId}_${matchDayId}_mixed_${seedText}`)[0];
}

export function createContests(leagueId, matchDayId, userIds, mode, options = {}) {
  const requestedMode = normalizePairingMode(mode);
  const contestMode = resolveContestMode(leagueId, matchDayId, requestedMode, options.seedText, options.modeIndex);
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  const shuffled = shuffle(uniqueUserIds, `${leagueId}_${matchDayId}_${requestedMode}_${contestMode}_${options.seedText || ""}`);
  const sides = createContestSides(shuffled, contestMode);
  const now = new Date().toISOString();

  return sides.map((side, index) => ({
    id: `contest_${matchDayId}_${index + 1}`,
    leagueId,
    matchDayId,
    mode: contestMode,
    requestedMode,
    status: "SCHEDULED",
    participantAName: side.a.join(" + ") || "Side A",
    participantBName: side.b.join(" + ") || "Bye",
    participantAScore: 0,
    participantBScore: 0,
    result: null,
    participants: [
      ...side.a.map((userId, userIndex) => ({ id: `part_${matchDayId}_${index}_a_${userIndex}`, side: "A", userId })),
      ...side.b.map((userId, userIndex) => ({ id: `part_${matchDayId}_${index}_b_${userIndex}`, side: "B", userId }))
    ],
    createdAt: now,
    updatedAt: now
  }));
}

function createContestSides(userIds, mode) {
  if (!userIds.length) return [];
  if (mode === "HALF") return [splitSide(userIds)];
  if (mode === "SOLO") return createSoloSides(userIds);
  if (mode === "DUO") return createDuoSides(userIds);
  const groupSize = 2;
  const sides = [];

  for (let i = 0; i < userIds.length; i += groupSize) {
    sides.push(splitSide(userIds.slice(i, i + groupSize)));
  }

  return sides;
}

function createDuoSides(userIds) {
  const sides = [];

  for (let i = 0; i < userIds.length;) {
    const remaining = userIds.length - i;
    if (remaining <= 5) {
      sides.push(splitSide(userIds.slice(i)));
      break;
    }

    const groupSize = remaining % 4 === 1 ? 5 : 4;
    sides.push(splitSide(userIds.slice(i, i + groupSize)));
    i += groupSize;
  }

  return sides;
}

function createSoloSides(userIds) {
  if (userIds.length <= 1) return [splitSide(userIds)];
  const sides = [];
  const lastSoloPairStart = userIds.length % 2 === 1 ? userIds.length - 3 : userIds.length;

  for (let i = 0; i < lastSoloPairStart; i += 2) {
    sides.push({ a: [userIds[i]], b: [userIds[i + 1]] });
  }

  if (userIds.length % 2 === 1) {
    const lastThree = userIds.slice(-3);
    sides.push({ a: [lastThree[0]], b: lastThree.slice(1) });
  }

  return sides;
}

function splitSide(userIds) {
  if (userIds.length <= 1) return { a: userIds, b: [] };
  const splitAt = Math.ceil(userIds.length / 2);
  return {
    a: userIds.slice(0, splitAt),
    b: userIds.slice(splitAt)
  };
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
