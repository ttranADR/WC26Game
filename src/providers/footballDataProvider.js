import { DEFAULT_WORLD_CUP_COMPETITION, DEFAULT_WORLD_CUP_SEASON } from "../config.js";

export function createFootballDataProvider({
  apiToken = process.env.FOOTBALL_DATA_TOKEN,
  competition = process.env.FOOTBALL_DATA_COMPETITION || DEFAULT_WORLD_CUP_COMPETITION,
  season = process.env.FOOTBALL_DATA_SEASON || DEFAULT_WORLD_CUP_SEASON
} = {}) {
  if (!apiToken) throw new Error("FOOTBALL_DATA_TOKEN is required for football-data provider.");
  const baseUrl = "https://api.football-data.org/v4";

  async function call(path) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "X-Auth-Token": apiToken }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`football-data.org error: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async function getCompetitionMatches(params = "") {
    const joiner = params ? `&${params}` : "";
    const data = await call(`/competitions/${encodeURIComponent(competition)}/matches?season=${encodeURIComponent(season)}${joiner}`);
    return (data.matches || []).map(mapFixture);
  }

  return {
    async getFixturesByDate(date) {
      return getCompetitionMatches(`dateFrom=${date}&dateTo=${date}`);
    },

    async getCompetitionFixtures() {
      return getCompetitionMatches();
    },

    async getLiveScores(date) {
      return date ? this.getFixturesByDate(date) : getCompetitionMatches("status=LIVE");
    },

    async getOddsByDate() {
      return [];
    },

    async getMatchEvents() {
      return [];
    }
  };
}

function mapFixture(row) {
  return {
    externalProvider: "football-data",
    externalId: String(row.id),
    matchdayNumber: row.matchday,
    stage: row.stage,
    group: row.group,
    homeTeam: row.homeTeam?.name || "TBD",
    awayTeam: row.awayTeam?.name || "TBD",
    homeTeamCode: makeTeamCode(row.homeTeam),
    awayTeamCode: makeTeamCode(row.awayTeam),
    kickoffAt: row.utcDate,
    status: normalizeStatus(row.status),
    homeScore: normalizeScore(row.score?.fullTime?.home),
    awayScore: normalizeScore(row.score?.fullTime?.away),
    firstGoalMinute: null,
    rawData: row
  };
}

function makeTeamCode(team) {
  return (team?.tla || team?.shortName || team?.name || "TBD").slice(0, 3).toUpperCase();
}

function normalizeScore(score) {
  return Number.isInteger(score) ? score : null;
}

function normalizeStatus(status) {
  if (status === "FINISHED") return "FINISHED";
  if (["IN_PLAY", "PAUSED"].includes(status)) return "LIVE";
  if (["POSTPONED", "SUSPENDED", "CANCELLED"].includes(status)) return "POSTPONED";
  return "SCHEDULED";
}
