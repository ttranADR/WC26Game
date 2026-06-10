import assert from "node:assert/strict";
import { createCardsFromOdds, createContests, createSeedData } from "../src/seed.js";
import { createOddsApiProvider } from "../src/providers/oddsApiProvider.js";
import { getExactScoreMultiplier, gradeCard, gradeExactPrediction } from "../src/scoring.js";
import {
  finalizeMatchday,
  generateCardsForMatchday,
  generatePairingsForMatchday,
  getAppState,
  loginUser,
  submitPicks,
  syncDailyTournamentData,
  syncOdds
} from "../src/services.js";
import { assertStorageConfiguration, getStorageMode } from "../src/storageConfig.js";

const data = createSeedData();
const match = data.tournamentMatches.find((item) => item.id === "match_bra_mar");
assert.equal(data.predictionCards.length, 12);

const loginData = createSeedData();
const loginStore = createMemoryStore(loginData);
assert.equal((await loginUser(loginStore, { email: "user", password: "player123" })).user.id, "user_you");
assert.equal((await loginUser(loginStore, { email: "user@pitchpick.local", password: "player123" })).user.id, "user_you");
assert.equal((await loginUser(loginStore, { email: "player@pitchpick.local", password: "player123" })).user.id, "user_you");
assert.equal((await loginUser(loginStore, { email: "admin", password: "admin123" })).user.id, "admin_1");

const over = data.predictionCards.find((card) => card.cardType === "TOTAL_GOALS_OVER");
assert.equal(gradeCard(over, match).pointsAwarded, 10);

const draw = data.predictionCards.find((card) => card.cardType === "DRAW" && card.tournamentMatchId === match.id);
assert.equal(gradeCard(draw, match).pointsAwarded, -10);

const exactScoreCard = {
  status: "ACTIVE",
  cardType: "EXACT_SCORE",
  expectedAnswer: "YES",
  gradingRule: { homeScore: 2, awayScore: 1 }
};
assert.equal(gradeCard(exactScoreCard, match).pointsAwarded, 10);

const oddsGeneratedCards = createCardsFromOdds("md_12", data.tournamentMatches, data.oddsSnapshots, "test_odds_cards");
assert.equal(oddsGeneratedCards.length, 12);
assert.ok(oddsGeneratedCards.every((card) => card.sourceOddsSnapshotIds.length === 1));
assert.ok(oddsGeneratedCards.some((card) => card.cardType === "EXACT_SCORE"));
assert.ok(oddsGeneratedCards.every((card) => card.estimatedProbability >= 0.4 && card.estimatedProbability <= 0.6));
assert.ok(data.predictionCards.every((card) => card.estimatedProbability >= 0.4 && card.estimatedProbability <= 0.6));

const pairingUsers = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const soloContests = createContests("league_test", "md_test_solo", pairingUsers.slice(0, 4), "SOLO", { seedText: "pairing_test" });
assert.equal(soloContests.length, 2);
assert.ok(soloContests.every((contest) => (
  contest.mode === "SOLO" &&
  contest.participants.filter((part) => part.side === "A").length === 1 &&
  contest.participants.filter((part) => part.side === "B").length === 1
)));
const oddSoloContests = createContests("league_test", "md_test_solo_odd", pairingUsers.slice(0, 5), "SOLO", { seedText: "pairing_test" });
assert.equal(oddSoloContests.length, 2);
assert.deepEqual(oddSoloContests.map((contest) => [
  contest.participants.filter((part) => part.side === "A").length,
  contest.participants.filter((part) => part.side === "B").length
]), [[1, 1], [1, 2]]);
assert.equal(oddSoloContests.some((contest) => contest.participantBName.includes(" + ")), true);
const duoContests = createContests("league_test", "md_test_duo", pairingUsers, "DUO", { seedText: "pairing_test" });
assert.equal(duoContests.length, 2);
assert.ok(duoContests.every((contest) => (
  contest.mode === "DUO" &&
  contest.participants.filter((part) => part.side === "A").length === 2 &&
  contest.participants.filter((part) => part.side === "B").length === 2
)));
const halfContest = createContests("league_test", "md_test_half", pairingUsers.slice(0, 5), "HALF", { seedText: "pairing_test" });
assert.equal(halfContest.length, 1);
assert.equal(halfContest[0].participants.filter((part) => part.side === "A").length, 3);
assert.equal(halfContest[0].participants.filter((part) => part.side === "B").length, 2);
const mixedContests = createContests("league_test", "md_test_mixed", pairingUsers, "MIXED", { seedText: "pairing_test" });
assert.ok(["SOLO", "DUO", "HALF"].includes(mixedContests[0].mode));
assert.equal(mixedContests[0].requestedMode, "MIXED");
assert.equal(createContests("league_test", "md_test_mixed_1", pairingUsers, "MIXED", { modeIndex: 1 })[0].mode, "DUO");
assert.equal(createContests("league_test", "md_test_mixed_2", pairingUsers, "MIXED", { modeIndex: 2 })[0].mode, "HALF");

const seasonPairingData = createSeedData();
seasonPairingData.matchdays.push({
  id: "md_pairing_future",
  name: "Pairing Future",
  date: "2026-06-14",
  lockAt: "2026-06-14T20:00:00.000Z",
  status: "SCHEDULED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "md_pairing_future_2",
  name: "Pairing Future 2",
  date: "2026-06-15",
  lockAt: "2026-06-15T20:00:00.000Z",
  status: "SCHEDULED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
const seasonPairingStore = createMemoryStore(seasonPairingData);
const seasonPairingResult = await generatePairingsForMatchday(seasonPairingStore, {
  leagueId: "league_1",
  scope: "season",
  pairingMode: "MIXED",
  seedText: "season_pairings",
  currentUserId: "admin_1"
});
assert.match(seasonPairingResult.message, /season matchups/);
assert.ok(seasonPairingData.headToHeadContests.some((contest) => contest.matchDayId === "md_12"));
assert.ok(seasonPairingData.headToHeadContests.some((contest) => contest.matchDayId === "md_pairing_future"));
assert.ok(seasonPairingData.headToHeadContests.some((contest) => contest.matchDayId === "md_pairing_future_2"));
assert.deepEqual(new Set(seasonPairingData.headToHeadContests.map((contest) => contest.mode)), new Set(["SOLO", "DUO", "HALF"]));

const preserveData = createSeedData();
preserveData.matchdays.push({
  id: "md_11",
  name: "Existing History Placeholder",
  date: "2026-06-08",
  lockAt: "2026-06-08T20:00:00.000Z",
  status: "FINAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "md_preserve_old",
  name: "Preserve Old",
  date: "2026-06-09",
  lockAt: "2026-06-09T20:00:00.000Z",
  status: "FINAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
preserveData.headToHeadContests = preserveData.headToHeadContests.filter((contest) => contest.matchDayId !== "md_12");
preserveData.headToHeadContests.push({
  id: "contest_md_preserve_old_1",
  leagueId: "league_1",
  matchDayId: "md_preserve_old",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "FINAL",
  participantAName: "user_you",
  participantBName: "user_maya",
  participantAScore: 10,
  participantBScore: 0,
  result: "A_WIN",
  participants: [
    { id: "part_md_preserve_old_a", side: "A", userId: "user_you" },
    { id: "part_md_preserve_old_b", side: "B", userId: "user_maya" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
const preserveStore = createMemoryStore(preserveData);
const skippedPairingResult = await generatePairingsForMatchday(preserveStore, {
  leagueId: "league_1",
  matchDayId: "md_preserve_old",
  shuffle: true,
  currentUserId: "admin_1"
});
assert.match(skippedPairingResult.message, /Skipped 1 finalized matchday/);
assert.equal(preserveData.headToHeadContests.filter((contest) => contest.matchDayId === "md_preserve_old").length, 1);
await finalizeMatchday(preserveStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const preservedStanding = preserveData.leagueStandings.find((standing) => standing.leagueId === "league_1" && standing.userId === "user_you");
assert.equal(preservedStanding.leaguePoints, 3);
assert.equal(preservedStanding.fantasyPointsFor, 10);

const groupScoreData = createSeedData();
groupScoreData.headToHeadContests = [{
  id: "contest_md_12_group",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "DUO",
  requestedMode: "DUO",
  status: "SCHEDULED",
  participantAName: "user_you + user_maya",
  participantBName: "user_liam + user_noah",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_group_a_1", side: "A", userId: "user_you" },
    { id: "part_md_12_group_a_2", side: "A", userId: "user_maya" },
    { id: "part_md_12_group_b_1", side: "B", userId: "user_liam" },
    { id: "part_md_12_group_b_2", side: "B", userId: "user_noah" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const groupScoreStore = createMemoryStore(groupScoreData);
const groupProjectionState = await getAppState(groupScoreStore, "user_you");
const groupProjectionSummary = groupProjectionState.matchdaySummaries.find((item) => item.id === "md_12");
assert.ok(groupProjectionSummary.userContest.participants.every((part) => Number.isFinite(part.projectedScore)));
await finalizeMatchday(groupScoreStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const groupScoreByUser = new Map(groupScoreData.playerCardSets.filter((set) => set.matchDayId === "md_12").map((set) => {
  const cardPoints = groupScoreData.playerCards
    .filter((card) => card.playerCardSetId === set.id)
    .reduce((sum, card) => sum + (card.pointsAwarded || 0), 0);
  const exactPoints = groupScoreData.scorePredictions.find((prediction) => (
    prediction.matchDayId === set.matchDayId &&
    prediction.userId === set.userId
  ))?.pointsAwarded || 0;
  return [set.userId, cardPoints + exactPoints];
}));
const groupContest = groupScoreData.headToHeadContests[0];
assert.equal(groupContest.participantAScore, groupScoreByUser.get("user_you") + groupScoreByUser.get("user_maya"));
assert.equal(groupContest.participantBScore, groupScoreByUser.get("user_liam") + groupScoreByUser.get("user_noah"));
const groupFinalState = await getAppState(groupScoreStore, "user_you");
const groupFinalSummary = groupFinalState.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(groupFinalSummary.userScore, groupContest.participantAScore);
assert.equal(groupFinalSummary.opponentScore, groupContest.participantBScore);

const fallbackData = createSeedData();
fallbackData.matchdays.push({
  id: "md_no_direct_odds",
  name: "No Direct Odds",
  date: "2026-06-14",
  lockAt: "2026-06-14T20:00:00.000Z",
  status: "SCHEDULED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
fallbackData.tournamentMatches.push({
  id: "match_no_direct_odds",
  externalProvider: "mock",
  externalId: "fix_no_direct_odds",
  matchDayId: "md_no_direct_odds",
  homeTeam: "Portugal",
  awayTeam: "Senegal",
  homeTeamCode: "POR",
  awayTeamCode: "SEN",
  kickoffAt: "2026-06-14T20:00:00.000Z",
  status: "SCHEDULED",
  homeScore: null,
  awayScore: null,
  firstGoalMinute: null,
  rawData: { test: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
const fallbackStore = createMemoryStore(fallbackData);
const fallbackResult = await generateCardsForMatchday(fallbackStore, {
  matchDayId: "md_no_direct_odds",
  currentUserId: "user_you"
});
const fallbackSummary = fallbackResult.state.matchdaySummaries.find((item) => item.id === "md_no_direct_odds");
assert.equal(fallbackSummary.predictionCardCount, 12);
assert.equal(fallbackSummary.playerCards.length, 12);
fallbackData.matchdays.find((item) => item.id === "md_no_direct_odds").status = "FINAL";
fallbackData.tournamentMatches.find((item) => item.id === "match_no_direct_odds").status = "FINISHED";
const refreshedFutureState = await getAppState(fallbackStore, "user_you");
const refreshedFutureSummary = refreshedFutureState.matchdaySummaries.find((item) => item.id === "md_no_direct_odds");
assert.equal(refreshedFutureSummary.status, "SCHEDULED");
const adminFutureState = await getAppState(fallbackStore, "admin_1");
const adminFutureSummary = adminFutureState.matchdaySummaries.find((item) => item.id === "md_no_direct_odds");
assert.equal(adminFutureSummary.playerCards.length, 12);
const adminFutureSubmitResult = await submitPicks(fallbackStore, {
  userId: "admin_1",
  matchDayId: "md_no_direct_odds",
  selectedCardIds: adminFutureSummary.playerCards.slice(0, 5).map((card) => card.predictionCardId),
  answers: Object.fromEntries(adminFutureSummary.playerCards.slice(0, 5).map((card) => [card.predictionCardId, "YES"])),
  scorePrediction: {
    tournamentMatchId: "match_no_direct_odds",
    predictedHomeScore: 2,
    predictedAwayScore: 1
  }
});
assert.equal(adminFutureSubmitResult.message, "Picks submitted.");
const futureSubmitResult = await submitPicks(fallbackStore, {
  userId: "user_you",
  matchDayId: "md_no_direct_odds",
  selectedCardIds: fallbackSummary.playerCards.slice(0, 5).map((card) => card.predictionCardId),
  answers: Object.fromEntries(fallbackSummary.playerCards.slice(0, 5).map((card) => [card.predictionCardId, "YES"])),
  scorePrediction: {
    tournamentMatchId: "match_no_direct_odds",
    predictedHomeScore: 1,
    predictedAwayScore: 0
  }
});
assert.equal(futureSubmitResult.message, "Picks submitted.");

const staleAdminData = createSeedData();
staleAdminData.playerCardSets.push({
  id: "set_md_12_admin_1",
  matchDayId: "md_12",
  userId: "admin_1",
  generatedAt: new Date().toISOString()
});
staleAdminData.playerCards.push({
  id: "pc_set_md_12_admin_1_old_card_1",
  playerCardSetId: "set_md_12_admin_1",
  predictionCardId: "old_card_1",
  selected: false,
  playerAnswer: null,
  isCorrect: null,
  pointsAwarded: 0,
  answeredAt: null
});
const staleAdminStore = createMemoryStore(staleAdminData);
const staleAdminResult = await generateCardsForMatchday(staleAdminStore, {
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const staleAdminSummary = staleAdminResult.state.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(staleAdminSummary.playerCards.length, 12);
assert.ok(staleAdminSummary.playerCards.every((card) => card.card));
assert.equal(staleAdminData.playerCards.some((card) => (
  card.playerCardSetId === "set_md_12_admin_1" &&
  card.predictionCardId === "old_card_1"
)), false);

const exact = gradeExactPrediction({
  predictedHomeScore: 2,
  predictedAwayScore: 1
}, match, data.oddsSnapshots);
assert.equal(exact.isExact, true);
assert.equal(exact.pointsAwarded, Number((exact.oddsMultiplier * 5).toFixed(1)));

const wrong = gradeExactPrediction({
  predictedHomeScore: 1,
  predictedAwayScore: 0
}, match, data.oddsSnapshots);
assert.equal(wrong.isExact, false);
assert.equal(wrong.pointsAwarded, 0);

const fiveFiveMultiplier = data.oddsSnapshots.find((odd) => (
  odd.tournamentMatchId === match.id &&
  odd.marketKey === "CORRECT_SCORE" &&
  odd.outcomeName === "5-5"
)).priceDecimal;
assert.equal(getExactScoreMultiplier({
  predictedHomeScore: 8,
  predictedAwayScore: 5
}, match, data.oddsSnapshots), fiveFiveMultiplier);
assert.equal(getExactScoreMultiplier({
  predictedHomeScore: 8,
  predictedAwayScore: 5
}, match, []), 19.5);
const otherExact = gradeExactPrediction({
  predictedHomeScore: 8,
  predictedAwayScore: 5
}, {
  ...match,
  status: "FINISHED",
  homeScore: 8,
  awayScore: 5
}, data.oddsSnapshots);
assert.equal(otherExact.isExact, true);
assert.equal(otherExact.pointsAwarded, Number((fiveFiveMultiplier * 5).toFixed(1)));

assert.equal(getStorageMode("postgres://example"), "neon");
assert.equal(getStorageMode(""), "local-json");
assert.doesNotThrow(() => assertStorageConfiguration({
  databaseUrl: "postgres://example",
  requireNeonStorage: "true",
  providers: ["football-data", "odds-api"]
}));
assert.throws(() => assertStorageConfiguration({
  databaseUrl: "",
  requireNeonStorage: "",
  providers: ["football-data"]
}), /DATABASE_URL is required/);

const syncData = createSeedData();
const store = createMemoryStore(syncData);
const oddsDates = [];
await syncOdds(store, {
  async getOddsByDate(date) {
    oddsDates.push(date);
    if (date !== "2026-06-12") return [];
    return [{
      tournamentMatchId: "fix_bra_mar",
      provider: "test-odds",
      marketKey: "MATCH_WINNER",
      bookmaker: "TestBook",
      outcomeName: "Brazil",
      priceDecimal: 1.8,
      impliedProbability: 0.5556,
      capturedAt: new Date().toISOString()
    }, {
      tournamentMatchId: "fix_bra_mar",
      provider: "test-odds",
      marketKey: "CORRECT_SCORE",
      bookmaker: "TestBook",
      outcomeName: "0-0",
      priceDecimal: 25,
      impliedProbability: 0.04,
      capturedAt: new Date().toISOString()
    }];
  }
}, { matchDayId: "md_12" });
assert.deepEqual(oddsDates, ["2026-06-12", "2026-06-13"]);
assert.ok(syncData.oddsSnapshots.some((odd) => (
  odd.provider === "test-odds" &&
  odd.tournamentMatchId === "match_bra_mar" &&
  odd.sourceFixtureDate === "2026-06-12"
)));
const brazilCorrectScoreOdds = syncData.oddsSnapshots.filter((odd) => (
  odd.tournamentMatchId === "match_bra_mar" &&
  odd.marketKey === "CORRECT_SCORE"
));
assert.equal(brazilCorrectScoreOdds.length, 36);
assert.equal(brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "0-0")?.priceDecimal, 25);
assert.ok(brazilCorrectScoreOdds.some((odd) => (
  odd.outcomeName === "5-5" &&
  odd.provider === "pitchpick-generated" &&
  odd.priceDecimal > 1
)));

const bulkOddsData = createSeedData();
const bulkOddsStore = createMemoryStore(bulkOddsData);
const bulkOddsCalls = [];
await syncOdds(bulkOddsStore, {
  async getCompetitionOdds() {
    bulkOddsCalls.push("competition");
    return [{
      tournamentMatchId: "fix_bra_mar",
      provider: "bulk-test-odds",
      marketKey: "MATCH_WINNER",
      bookmaker: "TestBook",
      outcomeName: "Brazil",
      priceDecimal: 1.8,
      impliedProbability: 0.5556,
      commenceAt: "2026-06-12T20:00:00.000Z",
      capturedAt: new Date().toISOString()
    }];
  },
  async getOddsByDate() {
    throw new Error("Initial all-fixture odds sync should use the bulk competition odds fetch.");
  }
}, { scope: "all" });
assert.deepEqual(bulkOddsCalls, ["competition"]);
assert.ok(bulkOddsData.oddsSnapshots.some((odd) => (
  odd.provider === "bulk-test-odds" &&
  odd.tournamentMatchId === "match_bra_mar" &&
  odd.sourceFixtureDate === "2026-06-12"
)));

const originalFetch = globalThis.fetch;
const originalOddsApiVersion = process.env.ODDS_API_VERSION;
const originalOddsEventLimit = process.env.ODDS_API_EVENT_LIMIT;
const originalOddsLeague = process.env.ODDS_API_LEAGUE;
const originalOddsBookmakers = process.env.ODDS_API_BOOKMAKERS;
process.env.ODDS_API_VERSION = "v3";
process.env.ODDS_API_EVENT_LIMIT = "2";
process.env.ODDS_API_LEAGUE = "international-fifa-world-cup";
process.env.ODDS_API_BOOKMAKERS = "Bet365";
const eventFetches = [];
const oddsMultiFetches = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  if (parsed.pathname.endsWith("/events")) {
    assert.equal(parsed.searchParams.get("league"), "international-fifa-world-cup");
    assert.equal(parsed.searchParams.get("bookmaker"), "Bet365");
    assert.equal(parsed.searchParams.get("limit"), "2");
    assert.equal(parsed.searchParams.has("from"), false);
    assert.equal(parsed.searchParams.has("to"), false);
    const skip = Number(parsed.searchParams.get("skip") || 0);
    eventFetches.push(skip);
    if (skip === 0) {
      return jsonResponse([{
        id: "event_jun_13",
        home: "Brazil",
        away: "Morocco",
        date: "2026-06-13T20:00:00Z"
      }, {
        id: "event_jun_14",
        home: "Spain",
        away: "Japan",
        date: "2026-06-14T20:00:00Z"
      }]);
    }
    if (skip === 2) {
      return jsonResponse([{
        id: "event_jun_15",
        home: "France",
        away: "Canada",
        date: "2026-06-15T20:00:00Z"
      }]);
    }
    throw new Error(`Unexpected events skip ${skip}`);
  }
  if (parsed.pathname.endsWith("/odds/multi")) {
    assert.equal(parsed.searchParams.get("bookmakers"), "Bet365");
    oddsMultiFetches.push(parsed.searchParams.get("eventIds"));
    return jsonResponse(parsed.searchParams.get("eventIds").split(",").map((eventId) => ({
      id: eventId,
      home: eventId === "event_jun_13" ? "Brazil" : "Spain",
      away: eventId === "event_jun_13" ? "Morocco" : "Japan",
      date: eventId === "event_jun_13" ? "2026-06-13T20:00:00Z" : "2026-06-14T20:00:00Z",
      bookmakers: {
        Bet365: [{
          name: "Correct Score",
          updatedAt: "2026-06-08T19:09:30.941Z",
          odds: [
            { label: "1-1", odds: "7.000" },
            { label: "3-1", odds: "19.000" }
          ]
        }]
      }
    })));
  }
  throw new Error(`Unexpected fetch URL ${url}`);
};
try {
  const provider = createOddsApiProvider("test-key");
  const mappedOdds = await provider.getCompetitionOdds();
  assert.deepEqual(eventFetches, [0, 2]);
  assert.deepEqual(oddsMultiFetches, ["event_jun_13,event_jun_14,event_jun_15"]);
  assert.ok(mappedOdds.some((odd) => (
    odd.marketKey === "CORRECT_SCORE" &&
    odd.outcomeName === "1-1" &&
    odd.priceDecimal === 7 &&
    odd.bookmaker === "Bet365"
  )));
  assert.ok(mappedOdds.some((odd) => (
    odd.marketKey === "CORRECT_SCORE" &&
    odd.outcomeName === "3-1" &&
    odd.priceDecimal === 19
  )));
} finally {
  globalThis.fetch = originalFetch;
  if (originalOddsApiVersion == null) delete process.env.ODDS_API_VERSION;
  else process.env.ODDS_API_VERSION = originalOddsApiVersion;
  if (originalOddsEventLimit == null) delete process.env.ODDS_API_EVENT_LIMIT;
  else process.env.ODDS_API_EVENT_LIMIT = originalOddsEventLimit;
  if (originalOddsLeague == null) delete process.env.ODDS_API_LEAGUE;
  else process.env.ODDS_API_LEAGUE = originalOddsLeague;
  if (originalOddsBookmakers == null) delete process.env.ODDS_API_BOOKMAKERS;
  else process.env.ODDS_API_BOOKMAKERS = originalOddsBookmakers;
}

const dailyData = createSeedData();
const dailyStore = createMemoryStore(dailyData);
const fixtureDates = [];
const dailyOddsDates = [];
const daily = await syncDailyTournamentData(dailyStore, {
  fixtureProvider: {
    async getFixturesByDate(date) {
      fixtureDates.push(date);
      return dailyData.tournamentMatches
        .filter((item) => item.matchDayId === "md_12")
        .map((item) => ({
          externalProvider: item.externalProvider,
          externalId: item.externalId,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          homeTeamCode: item.homeTeamCode,
          awayTeamCode: item.awayTeamCode,
          kickoffAt: item.kickoffAt,
          status: item.status,
          homeScore: item.homeScore,
          awayScore: item.awayScore,
          firstGoalMinute: item.firstGoalMinute,
          rawData: { test: true }
        }));
    }
  },
  oddsProvider: {
    async getOddsByDate(date) {
      dailyOddsDates.push(date);
      return [];
    }
  }
}, { date: "2026-06-12" });
assert.equal(daily.message, "Daily tournament data updated for 2026-06-12.");
assert.deepEqual(fixtureDates, ["2026-06-12"]);
assert.deepEqual(dailyOddsDates, ["2026-06-12", "2026-06-13"]);

console.log("All tests passed.");

function createMemoryStore(data) {
  return {
    async read() {
      return data;
    },
    async write(nextData) {
      Object.assign(data, nextData);
      return data;
    },
    async update(mutator) {
      const result = await mutator(data);
      return result ?? data;
    }
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    }
  };
}
