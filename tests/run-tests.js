import assert from "node:assert/strict";
import { createCardPool, createCardsFromOdds, createContests, createSeedData, createStandings, getCardMeaningKey } from "../src/seed.js";
import { createOddsApiProvider } from "../src/providers/oddsApiProvider.js";
import { createCorrectScorePrices } from "../src/oddsPricing.js";
import { getExactScoreMultiplier, gradeCard, gradeExactPrediction } from "../src/scoring.js";
import {
  finalizeMatchday,
  exportStandingsCsv,
  generateCardsForMatchday,
  generatePairingsForMatchday,
  getAppState,
  getMatchdayOdds,
  loginUser,
  submitPicks,
  syncDailyTournamentData,
  syncFixtures,
  syncLiveData,
  syncOdds,
  updateMatchScoresForMatchday,
  createUserAccount,
  updateOwnAccount,
  updateUserAccount
} from "../src/services.js";
import { assertStorageConfiguration, getStorageMode } from "../src/storageConfig.js";

const data = createSeedData();
const match = data.tournamentMatches.find((item) => item.id === "match_bra_mar");
assert.equal(data.predictionCards.length, 6);
const youSeedSet = data.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_you");
const mayaSeedSet = data.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_maya");
assert.deepEqual(
  data.playerCards.filter((card) => card.playerCardSetId === youSeedSet.id).map((card) => card.predictionCardId),
  data.playerCards.filter((card) => card.playerCardSetId === mayaSeedSet.id).map((card) => card.predictionCardId)
);
const seededFavoriteScoreOdd = data.oddsSnapshots.find((odd) => (
  odd.tournamentMatchId === "match_bra_mar" &&
  odd.marketKey === "CORRECT_SCORE" &&
  odd.outcomeName === "1-0"
));
const seededUnderdogScoreOdd = data.oddsSnapshots.find((odd) => (
  odd.tournamentMatchId === "match_bra_mar" &&
  odd.marketKey === "CORRECT_SCORE" &&
  odd.outcomeName === "0-1"
));
assert.ok(seededFavoriteScoreOdd.priceDecimal < seededUnderdogScoreOdd.priceDecimal);
const exactApiScorePrices = new Map(createCorrectScorePrices({
  id: "match_ger_cur",
  homeTeam: "Germany",
  awayTeam: "Curacao"
}, [{
  tournamentMatchId: "match_ger_cur",
  marketKey: "MATCH_WINNER",
  outcomeName: "Germany",
  priceDecimal: 1.18
}, {
  tournamentMatchId: "match_ger_cur",
  marketKey: "MATCH_WINNER",
  outcomeName: "Curacao",
  priceDecimal: 18
}], [{
  tournamentMatchId: "match_ger_cur",
  marketKey: "CORRECT_SCORE",
  outcomeName: "1-2",
  priceDecimal: 15
}]));
assert.equal(exactApiScorePrices.get("1-2"), 15);

const loginData = createSeedData();
const loginStore = createMemoryStore(loginData);
assert.ok(loginData.users.every((user) => user.email && ["ADMIN", "PLAYER"].includes(user.role) && user.passwordHash));
const playerLogin = await loginUser(loginStore, { email: "user", password: "player123" });
assert.equal(playerLogin.user.id, "user_you");
assert.equal(playerLogin.user.email, "you@pitchpick.local");
assert.equal(playerLogin.user.role, "PLAYER");
assert.equal(playerLogin.user.hasPassword, true);
assert.equal("passwordHash" in playerLogin.user, false);
assert.equal(playerLogin.state.currentUser.role, "PLAYER");
assert.equal(playerLogin.state.currentUser.hasPassword, true);
assert.equal("passwordHash" in playerLogin.state.currentUser, false);
assert.equal((await loginUser(loginStore, { email: "user@pitchpick.local", password: "player123" })).user.id, "user_you");
assert.equal((await loginUser(loginStore, { email: "player@pitchpick.local", password: "player123" })).user.id, "user_you");
const adminLogin = await loginUser(loginStore, { email: "admin", password: "admin123" });
assert.equal(adminLogin.user.id, "admin_1");
assert.equal(adminLogin.user.email, "admin@pitchpick.local");
assert.equal(adminLogin.user.role, "ADMIN");
assert.equal(adminLogin.user.hasPassword, true);
assert.equal("passwordHash" in adminLogin.user, false);
assert.equal(adminLogin.state.currentUser.role, "ADMIN");
assert.ok(adminLogin.state.users.every((user) => user.email && user.role && user.hasPassword && !("passwordHash" in user)));

const accountStore = createMemoryStore(createSeedData());
const createdUser = await createUserAccount(accountStore, {
  currentUserId: "admin_1",
  displayName: "Direct User",
  email: "direct@pitchpick.local",
  role: "PLAYER",
  password: "direct123"
});
assert.equal(createdUser.user.email, "direct@pitchpick.local");
assert.equal(createdUser.user.role, "PLAYER");
assert.equal(createdUser.user.hasPassword, true);
assert.equal("passwordHash" in createdUser.user, false);
assert.equal((await loginUser(accountStore, { email: "direct@pitchpick.local", password: "direct123" })).user.id, createdUser.user.id);
const promotedUser = await updateUserAccount(accountStore, {
  currentUserId: "admin_1",
  userId: createdUser.user.id,
  displayName: "Direct Admin",
  role: "ADMIN",
  password: "direct456"
});
assert.equal(promotedUser.user.displayName, "Direct Admin");
assert.equal(promotedUser.user.role, "ADMIN");
await assert.rejects(() => loginUser(accountStore, { email: "direct@pitchpick.local", password: "direct123" }), /Invalid email or password/);
assert.equal((await loginUser(accountStore, { email: "direct@pitchpick.local", password: "direct456" })).user.role, "ADMIN");
assert.equal((await loginUser(accountStore, { email: "Direct Admin", password: " direct456 " })).user.id, createdUser.user.id);
assert.equal((await loginUser(accountStore, { email: createdUser.user.id, password: "direct456" })).user.id, createdUser.user.id);
const resetPlayer = await updateUserAccount(accountStore, {
  currentUserId: "admin_1",
  userId: "user_maya",
  displayName: "Maya Reset",
  role: "PLAYER",
  password: "maya999"
});
assert.equal(resetPlayer.passwordUpdated, true);
assert.equal((await loginUser(accountStore, { email: "maya@pitchpick.local", password: "maya999" })).user.id, "user_maya");
assert.equal((await loginUser(accountStore, { email: "Maya Reset", password: "maya999" })).user.id, "user_maya");
assert.equal((await loginUser(accountStore, { email: "user_maya", password: "maya999" })).user.id, "user_maya");
const selfUpdated = await updateOwnAccount(accountStore, {
  currentUserId: createdUser.user.id,
  displayName: "Self Updated",
  password: "self789"
});
assert.equal(selfUpdated.user.displayName, "Self Updated");
assert.equal((await loginUser(accountStore, { email: "direct@pitchpick.local", password: "self789" })).user.displayName, "Self Updated");
await assert.rejects(() => updateUserAccount(createMemoryStore(createSeedData()), {
  currentUserId: "admin_1",
  userId: "admin_1",
  displayName: "Former Admin",
  role: "PLAYER"
}), /At least one admin/);

const assignmentState = await getAppState(createMemoryStore(createSeedData()), "user_you");
const assignmentSummary = assignmentState.matchdaySummaries.find((item) => item.id === "md_12");
const splitPayloadData = createSeedData();
const matchdayOddsPayload = await getMatchdayOdds(createMemoryStore(splitPayloadData), { matchDayId: "md_12" });
assert.equal("tournamentMatches" in assignmentState, false);
assert.equal("oddsSnapshots" in assignmentState, false);
assert.equal("correctScoreOdds" in assignmentState, false);
assert.equal(assignmentState.tournamentSummary.matches, splitPayloadData.tournamentMatches.length);
assert.ok(matchdayOddsPayload.correctScoreOdds.length > 0);
assert.ok(matchdayOddsPayload.correctScoreOdds.every((odd) => odd.marketKey === "CORRECT_SCORE"));
assert.equal(assignmentSummary.matchupAssignment.matchupId, assignmentSummary.userContest.id);
assert.equal(assignmentSummary.matchupAssignment.userId, "user_you");
assert.ok(assignmentState.matchupAssignments.some((assignment) => (
  assignment.userId === "user_you" &&
  assignment.matchDayId === "md_12" &&
  assignment.matchupId === assignmentSummary.userContest.id
)));
assert.deepEqual(assignmentState.submissionChecks, []);

const adminSubmissionState = await getAppState(createMemoryStore(createSeedData()), "admin_1");
const md12SubmissionCheck = adminSubmissionState.submissionChecks.find((item) => item.matchDayId === "md_12");
assert.equal(md12SubmissionCheck.totalCount, 11);
assert.equal(md12SubmissionCheck.submittedCount, 0);
assert.equal(md12SubmissionCheck.missingCount, 11);
assert.equal(md12SubmissionCheck.rows.find((row) => row.userId === "user_you").submitted, false);
assert.equal(md12SubmissionCheck.rows.find((row) => row.userId === "user_noah").submitted, false);
assert.equal(md12SubmissionCheck.rows.find((row) => row.userId === "user_noah").selectedCount, 0);
assert.equal(md12SubmissionCheck.rows.find((row) => row.userId === "user_noah").hasExactScore, false);

const multiLeagueData = createSeedData();
multiLeagueData.leagues.push({
  id: "league_2",
  name: "Second League",
  slug: "second-league",
  seasonName: "World Cup 2026",
  pairingMode: "SOLO",
  createdByUserId: "admin_1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
multiLeagueData.leagueMembers = multiLeagueData.leagueMembers.filter((member) => member.userId !== "user_maya");
multiLeagueData.leagueMembers.push({
  id: "member_league_2_user_maya",
  leagueId: "league_2",
  userId: "user_maya",
  status: "ACTIVE",
  joinedAt: new Date().toISOString()
}, {
  id: "member_league_2_user_liam",
  leagueId: "league_2",
  userId: "user_liam",
  status: "ACTIVE",
  joinedAt: new Date().toISOString()
}, {
  id: "member_league_2_user_ava",
  leagueId: "league_2",
  userId: "user_ava",
  status: "INVITED",
  joinedAt: new Date().toISOString()
});
multiLeagueData.leagueStandings.push(...createStandings("league_2", ["user_maya", "user_liam", "user_you", "user_ava"]));
multiLeagueData.headToHeadContests.push({
  id: "contest_md_12_league_2_1",
  leagueId: "league_2",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_maya",
  participantBName: "user_liam",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_league_2_a", side: "A", userId: "user_maya" },
    { id: "part_md_12_league_2_b", side: "B", userId: "user_liam" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
const multiLeagueState = await getAppState(createMemoryStore(multiLeagueData), "user_maya");
const multiLeagueSummary = multiLeagueState.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(multiLeagueState.league.id, "league_2");
assert.deepEqual(multiLeagueState.leagues.map((league) => league.id), ["league_2"]);
assert.deepEqual(multiLeagueState.leagues[0].standings.map((standing) => standing.userId).sort(), ["user_liam", "user_maya"]);
assert.deepEqual(multiLeagueState.standings.map((standing) => standing.userId).sort(), ["user_liam", "user_maya"]);
assert.deepEqual(multiLeagueState.users.map((user) => user.id).sort(), ["user_liam", "user_maya"]);
assert.deepEqual(multiLeagueState.profiles.map((profile) => profile.userId).sort(), ["user_liam", "user_maya"]);
assert.deepEqual(multiLeagueState.leagueMembers.map((member) => `${member.leagueId}:${member.userId}:${member.status}`).sort(), [
  "league_2:user_liam:ACTIVE",
  "league_2:user_maya:ACTIVE"
]);
assert.deepEqual(multiLeagueState.syncLogs, []);
assert.deepEqual(multiLeagueState.emailOutbox, []);
assert.ok(multiLeagueState.seasonContests.every((contest) => contest.leagueId === "league_2"));
assert.equal(multiLeagueSummary.userContest.id, "contest_md_12_league_2_1");
assert.equal(multiLeagueSummary.matchupAssignment.matchupId, "contest_md_12_league_2_1");
assert.ok(multiLeagueSummary.contests.every((contest) => contest.leagueId === "league_2"));
await assert.rejects(() => exportStandingsCsv(createMemoryStore(multiLeagueData), "league_1", "user_maya"), /League access required/);
const scopedCsv = await exportStandingsCsv(createMemoryStore(multiLeagueData), "league_2", "user_maya");
assert.match(scopedCsv, /Maya/);
assert.doesNotMatch(scopedCsv, /You/);
assert.doesNotMatch(scopedCsv, /Ava/);
const invitedLeagueState = await getAppState(createMemoryStore(multiLeagueData), "user_ava");
assert.equal(invitedLeagueState.leagues.some((league) => league.id === "league_2"), false);
const multiLeagueAdminState = await getAppState(createMemoryStore(multiLeagueData), "admin_1");
assert.deepEqual(multiLeagueAdminState.leagues.map((league) => league.id), ["league_1", "league_2"]);

const over = {
  status: "ACTIVE",
  cardType: "TOTAL_GOALS_OVER",
  expectedAnswer: "YES",
  gradingRule: { threshold: 2.5 }
};
assert.equal(gradeCard(over, match).pointsAwarded, 30);
assert.equal(gradeCard(over, {
  ...match,
  homeScore: null,
  awayScore: null
}).voidReason, "Final score is unavailable");

const draw = {
  status: "ACTIVE",
  cardType: "DRAW",
  expectedAnswer: "YES",
  gradingRule: {}
};
assert.equal(gradeCard(draw, match).pointsAwarded, 0);

const exactScoreCard = {
  status: "ACTIVE",
  cardType: "EXACT_SCORE",
  expectedAnswer: "YES",
  gradingRule: { homeScore: 2, awayScore: 1 }
};
assert.equal(gradeCard(exactScoreCard, match).pointsAwarded, 30);
assert.equal(gradeCard({
  status: "ACTIVE",
  cardType: "FIRST_TEAM_TO_SCORE",
  expectedAnswer: "YES",
  gradingRule: { team: "HOME" }
}, match).pointsAwarded, 30);
assert.equal(gradeCard({
  status: "ACTIVE",
  cardType: "FIRST_TEAM_TO_SCORE",
  expectedAnswer: "YES",
  gradingRule: { team: "HOME" }
}, {
  ...match,
  homeScore: "2",
  awayScore: "0",
  firstGoalTeam: null
}).pointsAwarded, 30);
assert.equal(gradeCard({
  status: "ACTIVE",
  cardType: "RED_CARD",
  expectedAnswer: "NO",
  gradingRule: {}
}, match).pointsAwarded, 30);
assert.equal(gradeCard({
  status: "ACTIVE",
  cardType: "TOP_SCORER_SCORES",
  expectedAnswer: "YES",
  gradingRule: { scorerName: match.topScorerName }
}, match).pointsAwarded, 30);

const oddsGeneratedCards = createCardsFromOdds("md_12", data.tournamentMatches, data.oddsSnapshots, "test_odds_cards");
assert.equal(oddsGeneratedCards.length, 6);
assert.ok(oddsGeneratedCards.some((card) => card.sourceOddsSnapshotIds.length === 1));
assert.ok(oddsGeneratedCards.some((card) => card.sourceOddsSnapshotIds.length === 0));
assert.equal(oddsGeneratedCards.some((card) => card.cardType === "EXACT_SCORE"), false);
assert.equal(oddsGeneratedCards.some((card) => /\b\d+\s*-\s*\d+\b/.test(card.questionText)), false);
assert.equal(new Set(oddsGeneratedCards.map(getCardMeaningKey)).size, oddsGeneratedCards.length);
assert.ok(oddsGeneratedCards.every((card) => card.estimatedProbability >= 0.4 && card.estimatedProbability <= 0.6));
assert.ok(data.predictionCards.every((card) => card.estimatedProbability >= 0.4 && card.estimatedProbability <= 0.6));
const templateQuestionCards = createCardPool("md_question_mix", [match], data.oddsSnapshots);
assert.equal(templateQuestionCards.length, 6);
assert.equal(new Set(templateQuestionCards.map(getCardMeaningKey)).size, templateQuestionCards.length);
const resultLoadedCards = createCardPool("md_result_independent", [{
  ...match,
  homeScore: 9,
  awayScore: 9,
  firstGoalMinute: 1,
  firstGoalTeam: "AWAY",
  redCardShown: true,
  topScorerName: "Actual Result Scorer",
  topScorerScored: true,
  rawData: { topScorerName: "Actual Result Scorer" }
}], data.oddsSnapshots);
const resultFreeCards = createCardPool("md_result_independent", [{
  ...match,
  homeScore: null,
  awayScore: null,
  firstGoalMinute: null,
  firstGoalTeam: null,
  redCardShown: null,
  topScorerName: null,
  topScorerScored: null,
  rawData: {}
}], data.oddsSnapshots);
const comparableCardShape = (cards) => cards.map((card) => ({
  cardType: card.cardType,
  title: card.title,
  questionText: card.questionText,
  gradingRule: card.gradingRule,
  meaningKey: getCardMeaningKey(card)
}));
assert.deepEqual(comparableCardShape(resultLoadedCards), comparableCardShape(resultFreeCards));
assert.equal(resultLoadedCards.some((card) => card.questionText.includes("Actual Result Scorer")), false);
const mirroredTotalCards = createCardsFromOdds("md_mirror", [match], [{
  id: "odds_mirror_over",
  tournamentMatchId: match.id,
  marketKey: "TOTAL_GOALS",
  outcomeName: "Over 2.5",
  priceDecimal: 1.8,
  impliedProbability: 0.5556
}, {
  id: "odds_mirror_under",
  tournamentMatchId: match.id,
  marketKey: "TOTAL_GOALS",
  outcomeName: "Under 2.5",
  priceDecimal: 2.1,
  impliedProbability: 0.4762
}], "mirror_test");
assert.equal(mirroredTotalCards.filter((card) => (
  ["TOTAL_GOALS_OVER", "TOTAL_GOALS_UNDER"].includes(card.cardType) &&
  card.gradingRule.threshold === 2.5
)).length, 1);

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
const oddDuoContests = createContests("league_test", "md_test_duo_odd", pairingUsers.slice(0, 5), "DUO", { seedText: "pairing_test" });
assert.equal(oddDuoContests.length, 1);
assert.deepEqual(oddDuoContests.map((contest) => [
  contest.participants.filter((part) => part.side === "A").length,
  contest.participants.filter((part) => part.side === "B").length
]), [[3, 2]]);
assert.equal(oddDuoContests[0].participants.length, 5);
const ninePlayerDuoContests = createContests("league_test", "md_test_duo_nine", [...pairingUsers, "p9"], "DUO", { seedText: "pairing_test" });
assert.equal(ninePlayerDuoContests.length, 2);
assert.deepEqual(ninePlayerDuoContests.map((contest) => contest.participants.length).sort((a, b) => a - b), [4, 5]);
assert.ok(ninePlayerDuoContests.some((contest) => (
  contest.participants.filter((part) => part.side === "A").length === 3 &&
  contest.participants.filter((part) => part.side === "B").length === 2
)));
assert.equal(ninePlayerDuoContests.some((contest) => !contest.participants.some((part) => part.side === "B")), false);
const halfContest = createContests("league_test", "md_test_half", pairingUsers.slice(0, 5), "HALF", { seedText: "pairing_test" });
assert.equal(halfContest.length, 1);
assert.equal(halfContest[0].participants.filter((part) => part.side === "A").length, 3);
assert.equal(halfContest[0].participants.filter((part) => part.side === "B").length, 2);
const mixedContests = createContests("league_test", "md_test_mixed", pairingUsers, "MIXED", { seedText: "pairing_test" });
assert.ok(["SOLO", "DUO", "HALF"].includes(mixedContests[0].mode));
assert.equal(mixedContests[0].requestedMode, "MIXED");
const mixedModeCounts = { SOLO: 0, DUO: 0, HALF: 0 };
for (let index = 0; index < 1000; index += 1) {
  mixedModeCounts[createContests("league_weighted", `md_weighted_${index}`, pairingUsers, "MIXED", {
    seedText: "weighted",
    modeIndex: index
  })[0].mode] += 1;
}
assert.ok(mixedModeCounts.SOLO > mixedModeCounts.DUO);
assert.ok(mixedModeCounts.DUO > mixedModeCounts.HALF);
assert.ok(mixedModeCounts.SOLO > 620 && mixedModeCounts.SOLO < 760);
assert.ok(mixedModeCounts.DUO > 140 && mixedModeCounts.DUO < 280);
assert.ok(mixedModeCounts.HALF > 60 && mixedModeCounts.HALF < 150);

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
assert.ok(seasonPairingData.headToHeadContests.every((contest) => ["SOLO", "DUO", "HALF"].includes(contest.mode)));

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

const opponentProjectionData = createSeedData();
opponentProjectionData.matchdays.find((item) => item.id === "md_12").status = "OPEN";
opponentProjectionData.matchdays.find((item) => item.id === "md_12").lockAt = "2026-12-01T20:00:00.000Z";
opponentProjectionData.tournamentMatches
  .filter((item) => item.matchDayId === "md_12")
  .forEach((item) => {
    item.status = "SCHEDULED";
    item.homeScore = null;
    item.awayScore = null;
  });
opponentProjectionData.scorePredictions = opponentProjectionData.scorePredictions.filter((prediction) => prediction.userId !== "user_noah");
opponentProjectionData.headToHeadContests = [{
  id: "contest_md_12_projection",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_noah",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_projection_a", side: "A", userId: "user_you" },
    { id: "part_md_12_projection_b", side: "B", userId: "user_noah" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const opponentProjectionStore = createMemoryStore(opponentProjectionData);
const opponentProjectionBefore = await getAppState(opponentProjectionStore, "user_you");
const opponentContestBefore = opponentProjectionBefore.matchdaySummaries
  .find((item) => item.id === "md_12")
  .userContest;
assert.equal(opponentContestBefore.participants.find((part) => part.userId === "user_noah").projectedScore, 0);
const noahSet = opponentProjectionData.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_noah");
const noahCards = opponentProjectionData.playerCards.filter((card) => card.playerCardSetId === noahSet.id);
const noahSelectedCardIds = noahCards.slice(0, 2).map((card) => card.predictionCardId);
await submitPicks(opponentProjectionStore, {
  userId: "user_noah",
  matchDayId: "md_12",
  selectedCardIds: noahSelectedCardIds,
  answers: Object.fromEntries(noahSelectedCardIds.map((cardId) => [cardId, "YES"])),
  scorePredictions: buildScorePredictions(opponentProjectionData, "md_12", {
    match_bra_mar: { home: 1, away: 0 }
  })
});
const opponentProjectionAfter = await getAppState(opponentProjectionStore, "user_you");
const opponentContestAfter = opponentProjectionAfter.matchdaySummaries
  .find((item) => item.id === "md_12")
  .userContest;
const noahProjection = opponentContestAfter.participants.find((part) => part.userId === "user_noah").projectedScore;
const noahExactBoost = opponentProjectionData.scorePredictions.filter((prediction) => (
  prediction.matchDayId === "md_12" &&
  prediction.userId === "user_noah"
)).reduce((sum, prediction) => sum + prediction.oddsMultiplier * 5, 0);
assert.equal(noahProjection, Number((noahSelectedCardIds.length * 30 + noahExactBoost).toFixed(1)));

const shotScoreData = createSeedData();
shotScoreData.matchdays.find((item) => item.id === "md_12").status = "OPEN";
shotScoreData.matchdays.find((item) => item.id === "md_12").lockAt = "2026-12-01T20:00:00.000Z";
shotScoreData.tournamentMatches
  .filter((item) => item.matchDayId === "md_12")
  .forEach((item) => {
    item.status = "SCHEDULED";
    item.homeScore = null;
    item.awayScore = null;
  });
shotScoreData.headToHeadContests = [{
  id: "contest_md_12_shots",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_noah",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_shots_a", side: "A", userId: "user_you" },
    { id: "part_md_12_shots_b", side: "B", userId: "user_noah" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const shotStore = createMemoryStore(shotScoreData);
const shotYouSet = shotScoreData.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_you");
const shotNoahSet = shotScoreData.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_noah");
const shotYouCards = shotScoreData.playerCards.filter((card) => card.playerCardSetId === shotYouSet.id);
const shotNoahCards = shotScoreData.playerCards.filter((card) => card.playerCardSetId === shotNoahSet.id);
const shotNoahSelectedIds = shotNoahCards.slice(0, 2).map((card) => card.predictionCardId);
await submitPicks(shotStore, {
  userId: "user_noah",
  leagueId: "league_1",
  matchDayId: "md_12",
  selectedCardIds: shotNoahSelectedIds,
  answers: Object.fromEntries(shotNoahSelectedIds.map((cardId) => [cardId, "YES"])),
  scorePredictions: buildScorePredictions(shotScoreData, "md_12")
});
const shotYouSelectedIds = shotYouCards.slice(0, 2).map((card) => card.predictionCardId);
const shotMissCardId = shotNoahCards[2].predictionCardId;
await submitPicks(shotStore, {
  userId: "user_you",
  leagueId: "league_1",
  matchDayId: "md_12",
  selectedCardIds: shotYouSelectedIds,
  answers: Object.fromEntries(shotYouSelectedIds.map((cardId) => [cardId, "YES"])),
  cardShotIds: [shotNoahSelectedIds[0], shotMissCardId],
  scorePredictions: buildScorePredictions(shotScoreData, "md_12")
});
await finalizeMatchday(shotStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const savedShots = shotScoreData.cardShots.filter((shot) => shot.shooterUserId === "user_you");
assert.equal(savedShots.length, 2);
assert.equal(savedShots.find((shot) => shot.predictionCardId === shotNoahSelectedIds[0])?.hit, true);
assert.equal(savedShots.find((shot) => shot.predictionCardId === shotNoahSelectedIds[0])?.pointsAwarded, 30);
assert.equal(savedShots.find((shot) => shot.predictionCardId === shotMissCardId)?.hit, false);
assert.equal(savedShots.find((shot) => shot.predictionCardId === shotMissCardId)?.pointsAwarded, -30);
const shotFinalState = await getAppState(shotStore, "user_you");
const shotFinalSummary = shotFinalState.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(shotFinalSummary.canShootCards, true);
assert.equal(shotFinalSummary.shotPoints, 0);

await finalizeMatchday(groupScoreStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const groupContest = groupScoreData.headToHeadContests[0];
assert.equal(groupContest.participantAScore, 0);
assert.equal(groupContest.participantBScore, 0);
const groupFinalState = await getAppState(groupScoreStore, "user_you");
const groupFinalSummary = groupFinalState.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(groupFinalSummary.userScore, groupContest.participantAScore);
assert.equal(groupFinalSummary.opponentScore, groupContest.participantBScore);

const unevenScoreData = createSeedData();
unevenScoreData.headToHeadContests = [{
  id: "contest_md_12_uneven",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_maya + user_liam",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_uneven_a_1", side: "A", userId: "user_you" },
    { id: "part_md_12_uneven_b_1", side: "B", userId: "user_maya" },
    { id: "part_md_12_uneven_b_2", side: "B", userId: "user_liam" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const unevenScoreStore = createMemoryStore(unevenScoreData);
await finalizeMatchday(unevenScoreStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const unevenContest = unevenScoreData.headToHeadContests[0];
assert.equal(unevenContest.participantAScore, 0);
assert.equal(unevenContest.participantBScore, 0);

const noSubmitScoreData = createSeedData();
noSubmitScoreData.headToHeadContests = [{
  id: "contest_md_12_no_submit",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_noah",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_no_submit_a", side: "A", userId: "user_you" },
    { id: "part_md_12_no_submit_b", side: "B", userId: "user_noah" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const noSubmitScoreStore = createMemoryStore(noSubmitScoreData);
await finalizeMatchday(noSubmitScoreStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const noSubmitContest = noSubmitScoreData.headToHeadContests[0];
const noSubmitNoahStanding = noSubmitScoreData.leagueStandings.find((standing) => standing.leagueId === "league_1" && standing.userId === "user_noah");
const noSubmitNoahSet = noSubmitScoreData.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_noah");
assert.equal(noSubmitContest.participantBScore, 0);
assert.equal(noSubmitNoahStanding.played, 1);
assert.equal(noSubmitNoahStanding.leaguePoints, 1);
assert.equal(noSubmitNoahStanding.fantasyPointsFor, 0);
assert.ok(noSubmitScoreData.playerCards
  .filter((card) => card.playerCardSetId === noSubmitNoahSet.id)
  .every((card) => card.pointsAwarded === 0 && card.isCorrect == null));

const negativeCardScoreData = createSeedData();
negativeCardScoreData.headToHeadContests = [{
  id: "contest_md_12_negative_cards",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_noah",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_negative_cards_a", side: "A", userId: "user_you" },
    { id: "part_md_12_negative_cards_b", side: "B", userId: "user_noah" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}];
const negativeYouSet = negativeCardScoreData.playerCardSets.find((set) => set.matchDayId === "md_12" && set.userId === "user_you");
const negativeYouCards = negativeCardScoreData.playerCards.filter((card) => card.playerCardSetId === negativeYouSet.id);
const negativeCardLookup = new Map(negativeCardScoreData.predictionCards.map((card) => [card.id, card]));
const negativeMatchLookup = new Map(negativeCardScoreData.tournamentMatches.map((match) => [match.id, match]));
const wrongSelections = negativeYouCards
  .map((playerCard) => {
    const card = negativeCardLookup.get(playerCard.predictionCardId);
    const grade = gradeCard(card, negativeMatchLookup.get(card?.tournamentMatchId));
    return grade.isCorrect == null ? null : { playerCard, card, grade };
  })
  .filter(Boolean)
  .slice(0, 2);
assert.equal(wrongSelections.length, 2);
negativeYouCards.forEach((playerCard) => {
  playerCard.selected = false;
  playerCard.playerAnswer = null;
});
wrongSelections.forEach(({ playerCard, card, grade }) => {
  playerCard.selected = true;
  playerCard.playerAnswer = grade.isCorrect
    ? card.expectedAnswer === "YES" ? "NO" : "YES"
    : card.expectedAnswer;
});
const negativeExactPredictions = negativeCardScoreData.scorePredictions.filter((prediction) => (
  prediction.matchDayId === "md_12" &&
  prediction.userId === "user_you"
));
negativeExactPredictions.forEach((prediction) => Object.assign(prediction, {
  predictedHomeScore: 12,
  predictedAwayScore: 12,
  submittedAt: new Date().toISOString(),
  pointsAwarded: 0,
  isExact: false
}));
const negativeCardScoreStore = createMemoryStore(negativeCardScoreData);
await finalizeMatchday(negativeCardScoreStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const negativeContest = negativeCardScoreData.headToHeadContests[0];
const negativeYouStanding = negativeCardScoreData.leagueStandings.find((standing) => standing.leagueId === "league_1" && standing.userId === "user_you");
const negativeFinalState = await getAppState(negativeCardScoreStore, "user_you");
const negativeSummary = negativeFinalState.matchdaySummaries.find((item) => item.id === "md_12");
assert.equal(negativeContest.participantAScore, 0);
assert.equal(negativeYouStanding.fantasyPointsFor, 0);
assert.equal(negativeSummary.cardPoints, 0);
assert.equal(negativeSummary.totalPoints, 0);
assert.ok(negativeSummary.playerCards
  .filter((card) => card.selected)
  .every((card) => card.pointsAwarded === 0 && card.isCorrect === false));

const duplicateContestData = createSeedData();
duplicateContestData.scorePredictions = duplicateContestData.scorePredictions.filter((prediction) => prediction.userId === "user_you");
duplicateContestData.headToHeadContests = [{
  id: "contest_md_12_duplicate_old",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_maya",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_duplicate_old_a", side: "A", userId: "user_you" },
    { id: "part_md_12_duplicate_old_b", side: "B", userId: "user_maya" }
  ],
  createdAt: "2026-06-12T01:00:00.000Z",
  updatedAt: "2026-06-12T01:00:00.000Z"
}, {
  id: "contest_md_12_duplicate_new",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_you",
  participantBName: "user_liam",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_duplicate_new_a", side: "A", userId: "user_you" },
    { id: "part_md_12_duplicate_new_b", side: "B", userId: "user_liam" }
  ],
  createdAt: "2026-06-12T02:00:00.000Z",
  updatedAt: "2026-06-12T02:00:00.000Z"
}, {
  id: "contest_md_12_duplicate_participant",
  leagueId: "league_1",
  matchDayId: "md_12",
  mode: "SOLO",
  requestedMode: "SOLO",
  status: "SCHEDULED",
  participantAName: "user_ava",
  participantBName: "user_ethan",
  participantAScore: 0,
  participantBScore: 0,
  result: null,
  participants: [
    { id: "part_md_12_duplicate_participant_a_1", side: "A", userId: "user_ava" },
    { id: "part_md_12_duplicate_participant_a_2", side: "A", userId: "user_ava" },
    { id: "part_md_12_duplicate_participant_b", side: "B", userId: "user_ethan" }
  ],
  createdAt: "2026-06-12T03:00:00.000Z",
  updatedAt: "2026-06-12T03:00:00.000Z"
}];
const duplicateContestStore = createMemoryStore(duplicateContestData);
await finalizeMatchday(duplicateContestStore, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const duplicateYouStanding = duplicateContestData.leagueStandings.find((standing) => standing.leagueId === "league_1" && standing.userId === "user_you");
const duplicateAvaStanding = duplicateContestData.leagueStandings.find((standing) => standing.leagueId === "league_1" && standing.userId === "user_ava");
assert.equal(duplicateYouStanding.played, 1);
assert.equal(duplicateYouStanding.leaguePoints, 1);
assert.equal(duplicateAvaStanding.played, 1);
assert.notEqual(duplicateAvaStanding.played, 2);

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
assert.equal(fallbackSummary.predictionCardCount, 6);
assert.equal(fallbackSummary.playerCards.length, 6);
assert.ok(fallbackData.predictionCards
  .filter((card) => card.matchDayId === "md_no_direct_odds")
  .every((card) => card.tournamentMatchId === "match_no_direct_odds"));
fallbackData.matchdays.find((item) => item.id === "md_no_direct_odds").status = "FINAL";
fallbackData.tournamentMatches.find((item) => item.id === "match_no_direct_odds").status = "FINISHED";
const refreshedFutureState = await getAppState(fallbackStore, "user_you");
const refreshedFutureSummary = refreshedFutureState.matchdaySummaries.find((item) => item.id === "md_no_direct_odds");
assert.equal(refreshedFutureSummary.status, "SCHEDULED");
const adminFutureState = await getAppState(fallbackStore, "admin_1");
const adminFutureSummary = adminFutureState.matchdaySummaries.find((item) => item.id === "md_no_direct_odds");
assert.equal(adminFutureSummary.playerCards.length, 6);
const adminFutureSubmitResult = await submitPicks(fallbackStore, {
  userId: "admin_1",
  matchDayId: "md_no_direct_odds",
  selectedCardIds: adminFutureSummary.playerCards.slice(0, 2).map((card) => card.predictionCardId),
  answers: Object.fromEntries(adminFutureSummary.playerCards.slice(0, 2).map((card) => [card.predictionCardId, "YES"])),
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
  selectedCardIds: fallbackSummary.playerCards.slice(0, 2).map((card) => card.predictionCardId),
  answers: Object.fromEntries(fallbackSummary.playerCards.slice(0, 2).map((card) => [card.predictionCardId, "YES"])),
  scorePrediction: {
    tournamentMatchId: "match_no_direct_odds",
    predictedHomeScore: 1,
    predictedAwayScore: 0
  }
});
assert.equal(futureSubmitResult.message, "Picks submitted.");

const staleAdminData = createSeedData();
staleAdminData.matchdays.find((item) => item.id === "md_12").status = "OPEN";
staleAdminData.matchdays.find((item) => item.id === "md_12").lockAt = "2026-12-01T20:00:00.000Z";
staleAdminData.tournamentMatches
  .filter((item) => item.matchDayId === "md_12")
  .forEach((item) => {
    item.kickoffAt = "2026-12-01T20:00:00.000Z";
    item.status = "SCHEDULED";
    item.homeScore = null;
    item.awayScore = null;
  });
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
assert.equal(staleAdminSummary.playerCards.length, 6);
assert.ok(staleAdminSummary.playerCards.every((card) => card.card));
assert.equal(staleAdminData.playerCards.some((card) => (
  card.playerCardSetId === "set_md_12_admin_1" &&
  card.predictionCardId === "old_card_1"
)), false);

const startedCardData = createSeedData();
startedCardData.matchdays.find((item) => item.id === "md_12").lockAt = "2000-01-01T20:00:00.000Z";
startedCardData.tournamentMatches
  .filter((matchItem) => matchItem.matchDayId === "md_12")
  .forEach((matchItem) => {
    matchItem.kickoffAt = "2000-01-01T20:00:00.000Z";
    matchItem.status = "FINISHED";
  });
await assert.rejects(() => generateCardsForMatchday(createMemoryStore(startedCardData), {
  matchDayId: "md_12",
  currentUserId: "admin_1"
}), /before kickoff/);

const seasonCardData = createSeedData();
seasonCardData.matchdays.forEach((matchday) => {
  matchday.status = "FINAL";
  matchday.date = "2000-01-01";
  matchday.lockAt = "2000-01-01T20:00:00.000Z";
});
seasonCardData.tournamentMatches.forEach((matchItem) => {
  matchItem.status = "FINISHED";
  matchItem.kickoffAt = "2000-01-01T20:00:00.000Z";
});
seasonCardData.matchdays.push({
  id: "md_cards_future_1",
  name: "Cards Future 1",
  date: "2099-06-14",
  lockAt: "2099-06-14T20:00:00.000Z",
  status: "SCHEDULED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "md_cards_future_2",
  name: "Cards Future 2",
  date: "2099-06-15",
  lockAt: "2099-06-15T20:00:00.000Z",
  status: "SCHEDULED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "md_cards_past",
  name: "Cards Past",
  date: "2000-01-02",
  lockAt: "2000-01-02T20:00:00.000Z",
  status: "FINAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
seasonCardData.tournamentMatches.push({
  id: "match_cards_future_1",
  externalProvider: "mock",
  externalId: "fix_cards_future_1",
  matchDayId: "md_cards_future_1",
  homeTeam: "Portugal",
  awayTeam: "Senegal",
  homeTeamCode: "POR",
  awayTeamCode: "SEN",
  kickoffAt: "2099-06-14T20:00:00.000Z",
  status: "SCHEDULED",
  homeScore: null,
  awayScore: null,
  firstGoalMinute: null,
  firstGoalTeam: null,
  redCardShown: null,
  topScorerName: "Cristiano Ronaldo",
  topScorerScored: null,
  rawData: { test: true, topScorerName: "Cristiano Ronaldo" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "match_cards_future_2",
  externalProvider: "mock",
  externalId: "fix_cards_future_2",
  matchDayId: "md_cards_future_2",
  homeTeam: "Spain",
  awayTeam: "Japan",
  homeTeamCode: "ESP",
  awayTeamCode: "JPN",
  kickoffAt: "2099-06-15T20:00:00.000Z",
  status: "SCHEDULED",
  homeScore: null,
  awayScore: null,
  firstGoalMinute: null,
  firstGoalTeam: null,
  redCardShown: null,
  topScorerName: "Alvaro Morata",
  topScorerScored: null,
  rawData: { test: true, topScorerName: "Alvaro Morata" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}, {
  id: "match_cards_past",
  externalProvider: "mock",
  externalId: "fix_cards_past",
  matchDayId: "md_cards_past",
  homeTeam: "Past",
  awayTeam: "Match",
  homeTeamCode: "PAS",
  awayTeamCode: "MAT",
  kickoffAt: "2000-01-02T20:00:00.000Z",
  status: "FINISHED",
  homeScore: 1,
  awayScore: 0,
  firstGoalMinute: 20,
  rawData: { test: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
const seasonCardStore = createMemoryStore(seasonCardData);
const seasonCardResult = await generateCardsForMatchday(seasonCardStore, {
  scope: "season",
  currentUserId: "admin_1"
});
assert.match(seasonCardResult.message, /Generated 12 season prediction cards for 2 matchdays/);
assert.equal(seasonCardData.predictionCards.filter((card) => card.matchDayId === "md_cards_future_1").length, 6);
assert.equal(seasonCardData.predictionCards.filter((card) => card.matchDayId === "md_cards_future_2").length, 6);
assert.equal(seasonCardData.predictionCards.filter((card) => card.matchDayId === "md_cards_past").length, 0);
assert.ok(seasonCardData.predictionCards
  .filter((card) => card.matchDayId === "md_cards_future_1")
  .every((card) => card.tournamentMatchId === "match_cards_future_1"));
assert.ok(seasonCardData.playerCardSets.some((set) => set.matchDayId === "md_cards_future_1" && set.userId === "user_you"));
assert.ok(seasonCardData.playerCards.some((card) => card.playerCardSetId === "set_md_cards_future_2_user_you"));

const exact = gradeExactPrediction({
  predictedHomeScore: 2,
  predictedAwayScore: 1
}, match, data.oddsSnapshots);
assert.equal(exact.isExact, true);
assert.equal(exact.pointsAwarded, Number((exact.oddsMultiplier * 5).toFixed(1)));
const exactWithStringScores = gradeExactPrediction({
  predictedHomeScore: "2",
  predictedAwayScore: "1"
}, {
  ...match,
  homeScore: "2",
  awayScore: "1"
}, data.oddsSnapshots);
assert.equal(exactWithStringScores.isExact, true);
assert.equal(exactWithStringScores.pointsAwarded, Number((exactWithStringScores.oddsMultiplier * 5).toFixed(1)));
const exactWithoutFinalScore = gradeExactPrediction({
  predictedHomeScore: 0,
  predictedAwayScore: 0
}, {
  ...match,
  homeScore: null,
  awayScore: null
}, data.oddsSnapshots);
assert.equal(exactWithoutFinalScore.isExact, false);
assert.equal(exactWithoutFinalScore.pointsAwarded, 0);

const wrong = gradeExactPrediction({
  predictedHomeScore: 1,
  predictedAwayScore: 0
}, match, data.oddsSnapshots);
assert.equal(wrong.isExact, false);
assert.equal(wrong.pointsAwarded, 0);
const missingMatchExact = gradeExactPrediction({
  predictedHomeScore: 2,
  predictedAwayScore: 0,
  oddsMultiplier: 11
}, null, data.oddsSnapshots);
assert.equal(missingMatchExact.oddsMultiplier, 11);
assert.equal(missingMatchExact.isExact, false);
assert.equal(missingMatchExact.pointsAwarded, 0);

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

const autoScoreData = createSeedData();
autoScoreData.scorePredictions.push({
  id: "score_stale_missing_match",
  matchDayId: "md_12",
  userId: "user_noah",
  tournamentMatchId: "missing_match_after_fixture_sync",
  predictedHomeScore: 2,
  predictedAwayScore: 0,
  oddsMultiplier: 11,
  isExact: null,
  pointsAwarded: 0,
  submittedAt: new Date().toISOString()
});
const autoScoreStore = createMemoryStore(autoScoreData);
await updateMatchScoresForMatchday(autoScoreStore, {
  supportsMatchEvents: false,
  async getFixturesByDate() {
    return autoScoreData.tournamentMatches
      .filter((item) => item.matchDayId === "md_12")
      .map((item) => ({
        externalProvider: item.externalProvider,
        externalId: item.externalId,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        homeTeamCode: item.homeTeamCode,
        awayTeamCode: item.awayTeamCode,
        kickoffAt: item.kickoffAt,
        status: "FINISHED",
        homeScore: String(item.homeScore),
        awayScore: String(item.awayScore),
        firstGoalMinute: null,
        firstGoalTeam: null,
        redCardShown: null,
        topScorerName: item.topScorerName,
        topScorerScored: null,
        rawData: { test: true }
      }));
  }
}, {
  leagueId: "league_1",
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
const autoScorePrediction = autoScoreData.scorePredictions.find((prediction) => prediction.userId === "user_you");
const staleScorePrediction = autoScoreData.scorePredictions.find((prediction) => prediction.id === "score_stale_missing_match");
assert.equal(autoScoreData.matchdays.find((item) => item.id === "md_12").status, "FINAL");
assert.equal(autoScorePrediction.isExact, true);
assert.equal(autoScorePrediction.pointsAwarded, Number((autoScorePrediction.oddsMultiplier * 5).toFixed(1)));
assert.equal(staleScorePrediction.isExact, false);
assert.equal(staleScorePrediction.pointsAwarded, 0);
assert.equal(staleScorePrediction.oddsMultiplier, 11);
assert.ok(autoScoreData.headToHeadContests
  .filter((contest) => contest.matchDayId === "md_12" && contest.leagueId === "league_1")
  .every((contest) => contest.status === "FINAL"));
const autoScorePlayerState = await getAppState(autoScoreStore, "user_you");
assert.equal(
  autoScorePlayerState.matchdaySummaries.find((item) => item.id === "md_12").exactPoints,
  autoScorePrediction.pointsAwarded
);

const autoFinalizeData = createSeedData();
autoFinalizeData.matchdays.find((item) => item.id === "md_12").status = "LOCKED";
const autoFinalizeStore = createMemoryStore(autoFinalizeData);
const autoFinalize = await syncLiveData(autoFinalizeStore, {
  fixtureProvider: {
    async getFixturesByDate() {
      return autoFinalizeData.tournamentMatches
        .filter((item) => item.matchDayId === "md_12")
        .map((item) => ({
          externalProvider: item.externalProvider,
          externalId: item.externalId,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          homeTeamCode: item.homeTeamCode,
          awayTeamCode: item.awayTeamCode,
          kickoffAt: item.kickoffAt,
          status: "FINISHED",
          homeScore: item.homeScore,
          awayScore: item.awayScore,
          firstGoalMinute: item.firstGoalMinute,
          firstGoalTeam: item.firstGoalTeam,
          redCardShown: item.redCardShown,
          topScorerName: item.topScorerName,
          topScorerScored: item.topScorerScored,
          rawData: { test: true }
        }));
    }
  },
  oddsProvider: {
    async getOddsByDate() {
      return [];
    }
  }
}, {
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
assert.deepEqual(autoFinalize.finalizedMatchDayIds, ["md_12"]);
assert.match(autoFinalize.message, /Auto-finalized 1/);
assert.equal(autoFinalizeData.matchdays.find((item) => item.id === "md_12").status, "FINAL");
assert.ok(autoFinalizeData.syncLogs.some((item) => item.type === "AUTO_FINALIZE_MATCHDAY"));

assert.equal(getStorageMode("postgres://example"), "neon");
assert.equal(getStorageMode(""), "local-json");
assert.doesNotThrow(() => assertStorageConfiguration({
  databaseUrl: "postgres://example",
  requireNeonStorage: "true",
  providers: ["football-data", "odds-api"]
}));
assert.throws(() => assertStorageConfiguration({
  databaseUrl: "",
  requireNeonStorage: "true",
  providers: ["mock"]
}), /Player accounts, picks, matchup assignments/);
assert.throws(() => assertStorageConfiguration({
  databaseUrl: "",
  requireNeonStorage: "",
  providers: ["football-data"]
}), /DATABASE_URL is required/);

const pacificGroupingData = createSeedData();
const pacificGroupingStore = createMemoryStore(pacificGroupingData);
await syncFixtures(pacificGroupingStore, {
  async getCompetitionFixtures() {
    return [{
      externalProvider: "football-data",
      externalId: "fix_mex_rsa",
      homeTeam: "Mexico",
      awayTeam: "RSA",
      homeTeamCode: "MEX",
      awayTeamCode: "RSA",
      kickoffAt: "2026-06-12T02:00:00.000Z",
      status: "SCHEDULED",
      rawData: {}
    }, {
      externalProvider: "football-data",
      externalId: "fix_kor_cze",
      homeTeam: "Korea",
      awayTeam: "Czech",
      homeTeamCode: "KOR",
      awayTeamCode: "CZE",
      kickoffAt: "2026-06-12T04:00:00.000Z",
      status: "SCHEDULED",
      rawData: {}
    }, {
      externalProvider: "football-data",
      externalId: "fix_por_gha",
      homeTeam: "Portugal",
      awayTeam: "Ghana",
      homeTeamCode: "POR",
      awayTeamCode: "GHA",
      kickoffAt: "2026-06-12T20:00:00.000Z",
      status: "SCHEDULED",
      rawData: {}
    }];
  }
}, { scope: "all", currentUserId: "admin_1" });
const pacificJune11 = pacificGroupingData.matchdays.find((matchday) => matchday.date === "2026-06-11");
assert.ok(pacificJune11);
assert.deepEqual(pacificGroupingData.tournamentMatches
  .filter((matchItem) => matchItem.matchDayId === pacificJune11.id)
  .map((matchItem) => `${matchItem.homeTeam} vs ${matchItem.awayTeam}`)
  .sort(), ["Korea vs Czech", "Mexico vs RSA"]);
const pacificJune12 = pacificGroupingData.matchdays.find((matchday) => (
  matchday.date === "2026-06-12" &&
  pacificGroupingData.tournamentMatches.some((matchItem) => matchItem.matchDayId === matchday.id && matchItem.homeTeam === "Portugal")
));
assert.ok(pacificJune12);
const pacificOddsDates = [];
await syncOdds(pacificGroupingStore, {
  async getOddsByDate(date) {
    pacificOddsDates.push(date);
    return [];
  }
}, { matchDayId: pacificJune11.id, currentUserId: "admin_1" });
assert.deepEqual(pacificOddsDates, ["2026-06-11"]);

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
      priceDecimal: 1.35,
      impliedProbability: 0.7407,
      capturedAt: new Date().toISOString()
    }, {
      tournamentMatchId: "fix_bra_mar",
      provider: "test-odds",
      marketKey: "MATCH_WINNER",
      bookmaker: "TestBook",
      outcomeName: "Draw",
      priceDecimal: 5.2,
      impliedProbability: 0.1923,
      capturedAt: new Date().toISOString()
    }, {
      tournamentMatchId: "fix_bra_mar",
      provider: "test-odds",
      marketKey: "MATCH_WINNER",
      bookmaker: "TestBook",
      outcomeName: "Morocco",
      priceDecimal: 9.5,
      impliedProbability: 0.1053,
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
    }, {
      tournamentMatchId: "fix_bra_mar",
      provider: "test-odds",
      marketKey: "CORRECT_SCORE",
      bookmaker: "TestBook",
      outcomeName: "0-1",
      priceDecimal: 2.1,
      impliedProbability: 0.4762,
      homeTeam: "Morocco",
      awayTeam: "Brazil",
      commenceAt: "2026-06-12T20:00:00.000Z",
      capturedAt: new Date().toISOString()
    }];
  }
}, { matchDayId: "md_12" });
assert.deepEqual(oddsDates, ["2026-06-12"]);
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
assert.equal(brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "1-0")?.priceDecimal, 2.1);
assert.equal(brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "1-0")?.provider, "test-odds");
assert.equal(brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "0-1")?.provider, "pitchpick-generated");
const generatedFavoriteWin = brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "2-0");
const generatedUnderdogWin = brazilCorrectScoreOdds.find((odd) => odd.outcomeName === "0-2");
assert.equal(generatedFavoriteWin?.provider, "pitchpick-generated");
assert.equal(generatedUnderdogWin?.provider, "pitchpick-generated");
assert.ok(generatedFavoriteWin.priceDecimal < generatedUnderdogWin.priceDecimal);
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
        home_team: "Brazil",
        away_team: "Morocco",
        start_time: "2026-06-13T20:00:00Z"
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
      home: eventId === "event_jun_13" ? undefined : "Spain",
      away: eventId === "event_jun_13" ? undefined : "Japan",
      date: eventId === "event_jun_13" ? undefined : "2026-06-14T20:00:00Z",
      bookmakers: {
        Bet365: [{
          name: "correct_score",
          updatedAt: "2026-06-08T19:09:30.941Z",
          odds: [
            { label: "1-1", odds: "7.000" },
            { label: "1-2", odds: "15.000" },
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
    odd.outcomeName === "1-2" &&
    odd.priceDecimal === 15
  )));
  const apiExactOdd = mappedOdds.find((odd) => odd.outcomeName === "1-2" && odd.tournamentMatchId === "event_jun_13");
  assert.equal(apiExactOdd.homeTeam, "Brazil");
  assert.equal(apiExactOdd.awayTeam, "Morocco");
  assert.equal(apiExactOdd.commenceAt, "2026-06-13T20:00:00Z");
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
const scoreUpdateData = createSeedData();
scoreUpdateData.tournamentMatches
  .filter((matchItem) => matchItem.matchDayId === "md_12")
  .forEach((matchItem) => {
    matchItem.status = "SCHEDULED";
    matchItem.homeScore = null;
    matchItem.awayScore = null;
    matchItem.firstGoalMinute = null;
    matchItem.firstGoalTeam = null;
    matchItem.redCardShown = null;
    matchItem.topScorerScored = null;
  });
const scoreUpdateStore = createMemoryStore(scoreUpdateData);
const scoreUpdateDates = [];
const scoreUpdateEventIds = [];
const scoreUpdateResult = await updateMatchScoresForMatchday(scoreUpdateStore, {
  supportsMatchEvents: true,
  async getFixturesByDate(date) {
    scoreUpdateDates.push(date);
    return [{
      externalProvider: "mock",
      externalId: "fix_bra_mar",
      homeTeam: "Brazil",
      awayTeam: "Morocco",
      homeTeamCode: "BRA",
      awayTeamCode: "MAR",
      kickoffAt: `${date}T20:00:00.000Z`,
      status: "FINISHED",
      homeScore: 4,
      awayScore: 2,
      firstGoalMinute: 9,
      rawData: { test: true }
    }];
  },
  async getMatchEvents(matchId) {
    scoreUpdateEventIds.push(matchId);
    return [{
      type: "GOAL",
      teamSide: "HOME",
      playerName: "Vinicius Junior",
      minute: 9
    }, {
      type: "CARD",
      detail: "Red Card",
      teamSide: "AWAY",
      playerName: "Morocco Defender",
      minute: 72
    }];
  }
}, {
  matchDayId: "md_12",
  currentUserId: "admin_1"
});
assert.deepEqual(scoreUpdateDates, ["2026-06-12"]);
assert.deepEqual(scoreUpdateEventIds, ["fix_bra_mar", "fix_arg_jpn", "fix_ger_can", "fix_esp_crc"]);
assert.match(scoreUpdateResult.message, /Updated WC match scores for Matchday 12/);
const updatedBrazilMatch = scoreUpdateData.tournamentMatches.find((item) => item.id === "match_bra_mar");
assert.equal(updatedBrazilMatch.status, "FINISHED");
assert.equal(updatedBrazilMatch.homeScore, 4);
assert.equal(updatedBrazilMatch.awayScore, 2);
assert.equal(updatedBrazilMatch.firstGoalMinute, 9);
assert.equal(updatedBrazilMatch.firstGoalTeam, "HOME");
assert.equal(updatedBrazilMatch.redCardShown, true);
assert.equal(updatedBrazilMatch.topScorerScored, true);

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
assert.equal(daily.message, "Daily tournament data updated for 2026-06-12. Final scores calculated.");
assert.deepEqual(fixtureDates, ["2026-06-12"]);
assert.deepEqual(dailyOddsDates, ["2026-06-12"]);

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

function getMatchdayScoreTotals(data, matchDayId) {
  return new Map(data.playerCardSets.filter((set) => set.matchDayId === matchDayId).map((set) => {
    const cardPoints = data.playerCards
      .filter((card) => card.playerCardSetId === set.id)
      .reduce((sum, card) => sum + (card.pointsAwarded || 0), 0);
    const exactPoints = data.scorePredictions.filter((prediction) => (
      prediction.matchDayId === set.matchDayId &&
      prediction.userId === set.userId
    )).reduce((sum, prediction) => sum + (prediction.pointsAwarded || 0), 0);
    return [set.userId, cardPoints + exactPoints];
  }));
}

function buildScorePredictions(data, matchDayId, scoresByMatchId = {}) {
  return data.tournamentMatches
    .filter((matchItem) => matchItem.matchDayId === matchDayId)
    .map((matchItem) => {
      const score = scoresByMatchId[matchItem.id] || { home: 0, away: 0 };
      return {
        tournamentMatchId: matchItem.id,
        predictedHomeScore: score.home,
        predictedAwayScore: score.away
      };
    });
}

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    }
  };
}
