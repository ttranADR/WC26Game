import assert from "node:assert/strict";
import { createSeedData } from "../src/seed.js";
import { gradeCard, gradeExactPrediction } from "../src/scoring.js";
import { assertStorageConfiguration, getStorageMode } from "../src/storageConfig.js";

const data = createSeedData();
const match = data.tournamentMatches.find((item) => item.id === "match_bra_mar");
assert.equal(data.predictionCards.length, 12);

const over = data.predictionCards.find((card) => card.cardType === "TOTAL_GOALS_OVER");
assert.equal(gradeCard(over, match).pointsAwarded, 10);

const draw = data.predictionCards.find((card) => card.cardType === "DRAW" && card.tournamentMatchId === match.id);
assert.equal(gradeCard(draw, match).pointsAwarded, -10);

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

console.log("All tests passed.");
