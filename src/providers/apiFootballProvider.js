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
    supportsMatchEvents: true,

    async getFixturesByDate(date) {
      const rows = await call(`/fixtures?date=${date}`);
      return rows.map(mapFixture);
    },

    async getLiveScores() {
      const rows = await call("/fixtures?live=all");
      return rows.map(mapFixture);
    },

    async getOddsByDate(date, options = {}) {
      const matches = options.matches || [];
      const dateRows = (await call(`/odds?date=${date}`))
        .map((row) => enrichOddsRowWithStoredFixture(row, matches));
      const teamRows = await fetchOddsRowsByTeamAndDate(call, date, options.matches);
      return dedupeOdds([...dateRows, ...teamRows].flatMap(mapOdds));
    },

    async getOddsByMatchMappings(mappings = []) {
      const rows = await Promise.all((mappings || [])
        .filter((mapping) => (
          mapping.providerMatchId &&
          (!mapping.provider || mapping.provider === "api-football")
        ))
        .map(async (mapping) => {
          try {
            const fixtureRows = await call(`/odds?fixture=${encodeURIComponent(mapping.providerMatchId)}`);
            return fixtureRows.map((row) => enrichOddsRowWithMapping(row, mapping));
          } catch {
            return [];
          }
        }));
      return dedupeOdds(rows.flat().flatMap(mapOdds));
    },

    async getMatchEvents(matchId) {
      const rows = await call(`/fixtures/events?fixture=${matchId}`);
      return rows.map((event, index) => ({
        id: `${matchId}_event_${index + 1}`,
        type: event.type,
        detail: event.detail,
        teamName: event.team?.name,
        playerName: event.player?.name,
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
    homeTeamExternalId: row.teams.home.id == null ? null : String(row.teams.home.id),
    awayTeamExternalId: row.teams.away.id == null ? null : String(row.teams.away.id),
    homeTeam: row.teams.home.name,
    awayTeam: row.teams.away.name,
    homeTeamCode: row.teams.home.name.slice(0, 3).toUpperCase(),
    awayTeamCode: row.teams.away.name.slice(0, 3).toUpperCase(),
    kickoffAt: row.fixture.date,
    status: normalizeStatus(row.fixture.status?.short),
    homeScore: row.goals.home,
    awayScore: row.goals.away,
    firstGoalMinute: null,
    firstGoalTeam: null,
    redCardShown: null,
    topScorerName: null,
    topScorerScored: null,
    rawData: row
  };
}

function mapOdds(row) {
  const homeTeam = row.teams?.home || row.fixture?.teams?.home;
  const awayTeam = row.teams?.away || row.fixture?.teams?.away;
  return row.bookmakers.flatMap((bookmaker) => (
    bookmaker.bets.flatMap((bet) => (
      bet.values.map((value) => ({
        tournamentMatchId: String(row.fixture.id),
        provider: "api-football",
        appMatchId: row.appMatchId,
        providerMatchId: String(row.fixture.id),
        marketKey: normalizeMarket(bet.name),
        bookmaker: bookmaker.name,
        outcomeName: value.value,
        priceDecimal: Number(value.odd),
        priceAmerican: null,
        impliedProbability: Number((1 / Number(value.odd)).toFixed(4)),
        homeTeam: homeTeam?.name,
        awayTeam: awayTeam?.name,
        homeTeamExternalId: homeTeam?.id == null ? null : String(homeTeam.id),
        awayTeamExternalId: awayTeam?.id == null ? null : String(awayTeam.id),
        commenceAt: row.fixture.date,
        rawData: { fixture: row.fixture, bookmaker, bet, value },
        capturedAt: new Date().toISOString()
      }))
    ))
  ));
}

async function fetchOddsRowsByTeamAndDate(call, date, matches = []) {
  const teamIds = [...new Set((matches || [])
    .flatMap((match) => [match.homeTeamExternalId, match.awayTeamExternalId])
    .map((teamId) => String(teamId || "").trim())
    .filter(Boolean))];
  if (!teamIds.length) return [];

  const batches = await Promise.all(teamIds.map(async (teamId) => {
    try {
      const rows = await call(`/odds?date=${date}&team=${encodeURIComponent(teamId)}`);
      return rows.map((row) => enrichOddsRowWithStoredFixture(row, matches, teamId));
    } catch {
      return [];
    }
  }));
  return batches.flat();
}

function enrichOddsRowWithStoredFixture(row, matches = [], teamId = null) {
  if (row.teams?.home?.id != null && row.teams?.away?.id != null) return row;
  const fixtureId = row.fixture?.id == null ? "" : String(row.fixture.id);
  const normalizedTeamId = String(teamId || "").trim();
  const candidateMatches = normalizedTeamId
    ? matches.filter((match) => (
      String(match.homeTeamExternalId || "") === normalizedTeamId ||
      String(match.awayTeamExternalId || "") === normalizedTeamId
    ))
    : matches;
  const match = candidateMatches.find((item) => String(item.externalId || "") === fixtureId) ||
    (candidateMatches.length === 1 ? candidateMatches[0] : null);
  if (!match) return row;

  return {
    ...row,
    fixture: {
      ...row.fixture,
      date: row.fixture?.date || match.kickoffAt
    },
    teams: {
      home: {
        id: match.homeTeamExternalId,
        name: match.homeTeam
      },
      away: {
        id: match.awayTeamExternalId,
        name: match.awayTeam
      }
    }
  };
}

function enrichOddsRowWithMapping(row, mapping) {
  return {
    ...row,
    appMatchId: mapping.appMatchId,
    fixture: {
      ...row.fixture,
      id: row.fixture?.id || mapping.providerMatchId,
      date: row.fixture?.date || mapping.providerKickoffAt
    },
    teams: {
      home: {
        id: mapping.providerHomeTeamExternalId,
        name: mapping.providerHomeTeam
      },
      away: {
        id: mapping.providerAwayTeamExternalId,
        name: mapping.providerAwayTeam
      }
    }
  };
}

function dedupeOdds(odds) {
  const seen = new Set();
  return odds.filter((odd) => {
    const key = [
      odd.provider,
      odd.appMatchId || "",
      odd.providerMatchId || "",
      odd.tournamentMatchId,
      odd.marketKey,
      odd.bookmaker,
      odd.outcomeName,
      odd.homeTeamExternalId || "",
      odd.awayTeamExternalId || ""
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
