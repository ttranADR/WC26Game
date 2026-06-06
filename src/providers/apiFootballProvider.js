export function createApiFootballProvider(apiKey = process.env.API_FOOTBALL_KEY) {
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is required for api-football provider.");
  const baseUrl = "https://v3.football.api-sports.io";

  async function call(path) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await response.json();
    if (!response.ok || data.errors?.length) {
      throw new Error(`API-Football error: ${JSON.stringify(data.errors || response.status)}`);
    }
    return data.response || [];
  }

  return {
    async getFixturesByDate(date) {
      const rows = await call(`/fixtures?date=${date}`);
      return rows.map(mapFixture);
    },

    async getLiveScores() {
      const rows = await call("/fixtures?live=all");
      return rows.map(mapFixture);
    },

    async getOddsByDate(date) {
      const rows = await call(`/odds?date=${date}`);
      return rows.flatMap(mapOdds);
    },

    async getMatchEvents(matchId) {
      const rows = await call(`/fixtures/events?fixture=${matchId}`);
      return rows.map((event, index) => ({
        id: `${matchId}_event_${index + 1}`,
        type: event.type,
        detail: event.detail,
        minute: event.time?.elapsed,
        rawData: event
      }));
    }
  };
}

function mapFixture(row) {
  return {
    externalProvider: "api-football",
    externalId: String(row.fixture.id),
    homeTeam: row.teams.home.name,
    awayTeam: row.teams.away.name,
    homeTeamCode: row.teams.home.name.slice(0, 3).toUpperCase(),
    awayTeamCode: row.teams.away.name.slice(0, 3).toUpperCase(),
    kickoffAt: row.fixture.date,
    status: normalizeStatus(row.fixture.status?.short),
    homeScore: row.goals.home,
    awayScore: row.goals.away,
    firstGoalMinute: null,
    rawData: row
  };
}

function mapOdds(row) {
  return row.bookmakers.flatMap((bookmaker) => (
    bookmaker.bets.flatMap((bet) => (
      bet.values.map((value) => ({
        tournamentMatchId: String(row.fixture.id),
        provider: "api-football",
        marketKey: normalizeMarket(bet.name),
        bookmaker: bookmaker.name,
        outcomeName: value.value,
        priceDecimal: Number(value.odd),
        priceAmerican: null,
        impliedProbability: Number((1 / Number(value.odd)).toFixed(4)),
        rawData: { fixture: row.fixture, bookmaker, bet, value },
        capturedAt: new Date().toISOString()
      }))
    ))
  ));
}

function normalizeStatus(status) {
  if (["FT", "AET", "PEN"].includes(status)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P"].includes(status)) return "LIVE";
  if (["PST", "CANC", "ABD"].includes(status)) return "POSTPONED";
  return "SCHEDULED";
}

function normalizeMarket(name) {
  const lower = name.toLowerCase();
  if (lower.includes("correct score")) return "CORRECT_SCORE";
  if (lower.includes("match winner")) return "MATCH_WINNER";
  if (lower.includes("over/under") || lower.includes("goals")) return "TOTAL_GOALS";
  if (lower.includes("both teams")) return "BOTH_TEAMS_SCORE";
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
