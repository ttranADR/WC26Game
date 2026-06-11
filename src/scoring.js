import { CARD_POINTS_CORRECT, CARD_POINTS_INCORRECT } from "./config.js";

const DEFAULT_OTHER_SCORE_MULTIPLIER = 19.5;

export function gradeCard(card, match) {
  if (card.status === "VOID") {
    return { isCorrect: null, pointsAwarded: 0, voidReason: card.voidReason || "Voided by admin" };
  }

  if (!match || match.status !== "FINISHED") {
    return { isCorrect: null, pointsAwarded: 0, voidReason: "Match is not final" };
  }

  const home = match.homeScore;
  const away = match.awayScore;
  const total = home + away;
  let result;

  switch (card.cardType) {
    case "TOTAL_GOALS_OVER":
      result = total > card.gradingRule.threshold;
      break;
    case "TOTAL_GOALS_UNDER":
      result = total < card.gradingRule.threshold;
      break;
    case "WIN_MARGIN":
      result = card.gradingRule.team === "HOME"
        ? home - away >= card.gradingRule.marginAtLeast
        : away - home >= card.gradingRule.marginAtLeast;
      break;
    case "WEAKER_TEAM_SCORES":
      result = card.gradingRule.weakerTeam === "HOME" ? home >= 1 : away >= 1;
      break;
    case "FIRST_TEAM_TO_SCORE":
      if (home + away === 0) {
        result = false;
        break;
      }
      if (!["HOME", "AWAY"].includes(match.firstGoalTeam)) {
        return { isCorrect: null, pointsAwarded: 0, voidReason: "First scoring team is unavailable" };
      }
      result = match.firstGoalTeam === card.gradingRule.team;
      break;
    case "FIRST_GOAL_BEFORE":
      if (match.firstGoalMinute == null) {
        return { isCorrect: null, pointsAwarded: 0, voidReason: "First goal timing is unavailable" };
      }
      result = match.firstGoalMinute < card.gradingRule.minute;
      break;
    case "RED_CARD":
      if (match.redCardShown == null) {
        return { isCorrect: null, pointsAwarded: 0, voidReason: "Red-card data is unavailable" };
      }
      result = Boolean(match.redCardShown);
      break;
    case "TOP_SCORER_SCORES":
      if (match.topScorerScored == null) {
        return { isCorrect: null, pointsAwarded: 0, voidReason: "Top-scorer result is unavailable" };
      }
      result = Boolean(match.topScorerScored);
      break;
    case "BOTH_TEAMS_SCORE":
      result = home >= 1 && away >= 1;
      break;
    case "CLEAN_SHEET":
      result = home === 0 || away === 0;
      break;
    case "DRAW":
      result = home === away;
      break;
    case "EXACT_SCORE":
      result = home === card.gradingRule.homeScore && away === card.gradingRule.awayScore;
      break;
    default:
      return { isCorrect: null, pointsAwarded: 0, voidReason: "Unsupported grading rule" };
  }

  const expectedYes = card.expectedAnswer === "YES";
  const isCorrect = result === expectedYes;
  return { isCorrect, pointsAwarded: isCorrect ? CARD_POINTS_CORRECT : CARD_POINTS_INCORRECT };
}

export function getFallbackExactMultiplier(prediction, match, odds = []) {
  const winnerMarket = odds.filter((odd) => odd.marketKey === "MATCH_WINNER");
  const totalGoals = prediction.predictedHomeScore + prediction.predictedAwayScore;
  let outcomeName = "Draw";
  if (prediction.predictedHomeScore > prediction.predictedAwayScore) outcomeName = match.homeTeam;
  if (prediction.predictedAwayScore > prediction.predictedHomeScore) outcomeName = match.awayTeam;

  const winnerOdd = winnerMarket.find((odd) => odd.outcomeName === outcomeName);
  let multiplier = winnerOdd?.priceDecimal || 2.2;
  if (totalGoals <= 1) multiplier += 0.2;
  if (totalGoals >= 4) multiplier += 0.3;
  return Math.max(1, Math.min(8, Number(multiplier.toFixed(1))));
}

export function getExactScoreMultiplier(prediction, match, odds = []) {
  const score = `${prediction.predictedHomeScore}-${prediction.predictedAwayScore}`;
  const exact = odds.find((odd) => (
    odd.tournamentMatchId === match.id &&
    odd.marketKey === "CORRECT_SCORE" &&
    odd.outcomeName === score
  ));
  if (exact) return Number(exact.priceDecimal);

  const otherScore = odds.find((odd) => (
    odd.tournamentMatchId === match.id &&
    odd.marketKey === "CORRECT_SCORE" &&
    odd.outcomeName === "5-5"
  ));
  return otherScore ? Number(otherScore.priceDecimal) : DEFAULT_OTHER_SCORE_MULTIPLIER;
}

export function gradeExactPrediction(prediction, match, odds = []) {
  const multiplier = getExactScoreMultiplier(prediction, match, odds);
  const isExact = match.status === "FINISHED" &&
    prediction.predictedHomeScore === match.homeScore &&
    prediction.predictedAwayScore === match.awayScore;
  return {
    oddsMultiplier: multiplier,
    isExact,
    pointsAwarded: isExact ? Number((5 * multiplier).toFixed(1)) : 0
  };
}
