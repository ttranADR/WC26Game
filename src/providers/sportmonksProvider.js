export function createSportmonksProvider(apiKey = process.env.SPORTMONKS_KEY) {
  if (!apiKey) throw new Error("SPORTMONKS_KEY is required for sportmonks provider.");
  const baseUrl = "https://api.sportmonks.com/v3/football";

  async function call(path) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await fetch(`${baseUrl}${path}${joiner}api_token=${apiKey}`);
    const data = await response.json();
    if (!response.ok) throw new Error(`Sportmonks error: ${response.status}`);
    return data.data || [];
  }

  return {
    supportsMatchEvents: true,

    async getFixturesByDate(date) {
      const rows = await call(`/fixtures/date/${date}?include=participants;scores;state`);
      return rows.map(mapFixture);
    },

    async getLiveScores(date) {
      return this.getFixturesByDate(date);
    },

    async getOddsByDate(date) {
      const rows = await call(`/fixtures/date/${date}?include=odds;participants`);
      return rows.flatMap(mapOdds);
    },

    async getMatchEvents(matchId) {
      const rows = await call(`/fixtures/${matchId}?include=events`);
      return (rows.events || []).map((event) => ({
        id: String(event.id),
        type: event.type?.name,
        detail: event.type?.name || event.result || event.addition || "",
        teamName: event.participant_name || event.team?.name || event.participant?.name,
        playerName: event.player_name || event.player?.name,
        minute: event.minute,
        rawData: event
      }));
    }
  };
}

function mapFixture(row) {
  const home = row.participants?.find((team) => team.meta?.location === "home") || row.participants?.[0];
  const away = row.participants?.find((team) => team.meta?.location === "away") || row.participants?.[1];
  const score = row.scores || [];
  return {
    externalProvider: "sportmonks",
    externalId: String(row.id),
    homeTeamExternalId: home?.id == null ? null : String(home.id),
    awayTeamExternalId: away?.id == null ? null : String(away.id),
    homeTeam: home?.name || "Home",
    awayTeam: away?.name || "Away",
    homeTeamCode: (home?.short_code || home?.name || "HOM").slice(0, 3).toUpperCase(),
    awayTeamCode: (away?.short_code || away?.name || "AWY").slice(0, 3).toUpperCase(),
    kickoffAt: row.starting_at,
    status: row.state?.state === "FT" ? "FINISHED" : row.state?.state === "LIVE" ? "LIVE" : "SCHEDULED",
    homeScore: score.find((item) => item.description === "CURRENT" && item.score?.participant === "home")?.score?.goals ?? null,
    awayScore: score.find((item) => item.description === "CURRENT" && item.score?.participant === "away")?.score?.goals ?? null,
    firstGoalMinute: null,
    firstGoalTeam: null,
    redCardShown: null,
    topScorerName: null,
    topScorerScored: null,
    rawData: row
  };
}

function mapOdds(row) {
  const { home, away } = getFixtureTeams(row);
  return (row.odds || []).map((odd) => ({
    tournamentMatchId: String(row.id),
    provider: "sportmonks",
    marketKey: normalizeMarket(odd.market_description || odd.market?.name || "ODDS"),
    bookmaker: odd.bookmaker?.name || "Sportmonks",
    outcomeName: odd.label || odd.name || String(odd.value),
    priceDecimal: Number(odd.value),
    priceAmerican: null,
    impliedProbability: Number((1 / Number(odd.value)).toFixed(4)),
    homeTeam: home?.name,
    awayTeam: away?.name,
    homeTeamExternalId: home?.id == null ? null : String(home.id),
    awayTeamExternalId: away?.id == null ? null : String(away.id),
    commenceAt: row.starting_at,
    rawData: odd,
    capturedAt: new Date().toISOString()
  }));
}

function getFixtureTeams(row) {
  const home = row.participants?.find((team) => team.meta?.location === "home") || row.participants?.[0];
  const away = row.participants?.find((team) => team.meta?.location === "away") || row.participants?.[1];
  return { home, away };
}

function normalizeMarket(name) {
  const lower = name.toLowerCase();
  if (lower.includes("correct")) return "CORRECT_SCORE";
  if (lower.includes("winner") || lower.includes("1x2")) return "MATCH_WINNER";
  if (lower.includes("over") || lower.includes("under")) return "TOTAL_GOALS";
  if (lower.includes("both")) return "BOTH_TEAMS_SCORE";
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
