import assert from "node:assert/strict";
import { createCardsFromOdds, createSeedData } from "../src/seed.js";
import { gradeCard, gradeExactPrediction } from "../src/scoring.js";
import { generateCardsForMatchday, getAppState, submitPicks, syncDailyTournamentData, syncOdds } from "../src/services.js";
import { assertStorageConfiguration, getStorageMode } from "../src/storageConfig.js";

const data = createSeedData();
const match = data.tournamentMatches.find((item) => item.id === "match_bra_mar");
assert.equal(data.predictionCards.length, 12);

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
