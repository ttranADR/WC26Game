const MAX_SCORELINE_GOALS = 5;
const NEUTRAL_WIN_ODD = 3.2;
const NEUTRAL_DRAW_ODD = 3.4;
const MIN_PRICE = 1.2;
const MAX_PRICE = 75;

export function createCorrectScorePrices(match = {}, oddsSnapshots = [], exactScoreOdds = oddsSnapshots) {
  const strength = inferMatchWinnerStrength(match, oddsSnapshots);
  const exactPrices = getExactScorePrices(match, exactScoreOdds);
  const scores = [];

  for (let home = 0; home <= MAX_SCORELINE_GOALS; home += 1) {
    for (let away = 0; away <= MAX_SCORELINE_GOALS; away += 1) {
      const score = `${home}-${away}`;
      const exactPrice = exactPrices.get(score);
      if (exactPrice) {
        scores.push([score, exactPrice]);
        continue;
      }

      const total = home + away;
      const drawPenalty = home === away ? 1.2 : 0;
      const blowoutPenalty = Math.abs(home - away) * 1.35;
      const basePrice = 5.8 + total * 1.25 + drawPenalty + blowoutPenalty;
      const resultFactor = getResultFactor(home, away, strength);
      scores.push([score, normalizePrice(basePrice * resultFactor)]);
    }
  }

  return scores;
}

function getExactScorePrices(match, oddsSnapshots) {
  const prices = new Map();
  oddsSnapshots
    .filter((odd) => (
      odd.marketKey === "CORRECT_SCORE" &&
      (!match.id || String(odd.tournamentMatchId) === String(match.id))
    ))
    .forEach((odd) => {
      const score = normalizeScoreOutcome(odd.outcomeName);
      const price = Number(odd.priceDecimal);
      if (score && Number.isFinite(price) && price > 1) prices.set(score, price);
    });
  return prices;
}

function inferMatchWinnerStrength(match, oddsSnapshots) {
  const winnerOdds = oddsSnapshots.filter((odd) => (
    odd.marketKey === "MATCH_WINNER" &&
    (!match.id || String(odd.tournamentMatchId) === String(match.id))
  ));
  const homePrice = findOutcomePrice(winnerOdds, match.homeTeam);
  const awayPrice = findOutcomePrice(winnerOdds, match.awayTeam);
  const drawPrice = findOutcomePrice(winnerOdds, "Draw");
  const winFactors = getWinFactors(homePrice, awayPrice);

  return {
    homeWin: winFactors.home,
    awayWin: winFactors.away,
    draw: drawPrice ? boundedFactor(drawPrice / NEUTRAL_DRAW_ODD, 0.75, 1.85) : 1
  };
}

function findOutcomePrice(odds, outcomeName) {
  const target = normalizeOutcomeName(outcomeName);
  if (!target) return null;
  const odd = odds.find((item) => (
    normalizeOutcomeName(item.outcomeName) === target &&
    Number.isFinite(Number(item.priceDecimal)) &&
    Number(item.priceDecimal) > 1
  ));
  return odd ? Number(odd.priceDecimal) : null;
}

function getWinFactors(homePrice, awayPrice) {
  if (homePrice && awayPrice) {
    const baseline = Math.sqrt(homePrice * awayPrice);
    return {
      home: boundedFactor(homePrice / baseline),
      away: boundedFactor(awayPrice / baseline)
    };
  }

  if (homePrice) {
    const home = boundedFactor(homePrice / NEUTRAL_WIN_ODD);
    return { home, away: reciprocalFactor(home) };
  }

  if (awayPrice) {
    const away = boundedFactor(awayPrice / NEUTRAL_WIN_ODD);
    return { home: reciprocalFactor(away), away };
  }

  return { home: 1, away: 1 };
}

function getResultFactor(homeScore, awayScore, strength) {
  if (homeScore > awayScore) return strength.homeWin;
  if (awayScore > homeScore) return strength.awayWin;
  return strength.draw;
}

function boundedFactor(priceRatio, min = 0.55, max = 2.75) {
  return clamp(Math.sqrt(Math.max(priceRatio, 0.01)), min, max);
}

function reciprocalFactor(factor) {
  return clamp(1 / factor, 0.55, 2.75);
}

function normalizePrice(value) {
  return Number(clamp(value, MIN_PRICE, MAX_PRICE).toFixed(1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOutcomeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeScoreOutcome(value) {
  const match = String(value || "").match(/(\d+)\s*-\s*(\d+)/);
  return match ? `${Number(match[1])}-${Number(match[2])}` : "";
}
