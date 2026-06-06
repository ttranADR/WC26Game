export function createOddsApiProvider(apiKey = process.env.ODDS_API_KEY) {
  if (!apiKey) throw new Error("ODDS_API_KEY is required for odds-api provider.");
  const baseUrl = "https://api.the-odds-api.com/v4";

  async function call(path) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await fetch(`${baseUrl}${path}${joiner}apiKey=${apiKey}`);
    const data = await response.json();
    if (!response.ok) throw new Error(`The Odds API error: ${JSON.stringify(data)}`);
    return data;
  }

  return {
    async getFixturesByDate() {
      return [];
    },

    async getLiveScores() {
      return [];
    },

    async getOddsByDate() {
      const sports = await call("/sports");
      const soccer = sports.find((sport) => sport.key.includes("soccer") && sport.active);
      if (!soccer) return [];
      const events = await call(`/sports/${soccer.key}/odds?regions=us,uk,eu&markets=h2h,totals,btts&oddsFormat=decimal`);
      return events.flatMap((event) => (
        event.bookmakers.flatMap((bookmaker) => (
          bookmaker.markets.flatMap((market) => (
            market.outcomes.map((outcome) => ({
              tournamentMatchId: event.id,
              provider: "odds-api",
              marketKey: normalizeMarket(market.key),
              bookmaker: bookmaker.title,
              outcomeName: outcome.name,
              priceDecimal: Number(outcome.price),
              priceAmerican: null,
              impliedProbability: Number((1 / Number(outcome.price)).toFixed(4)),
              rawData: { event, bookmaker, market, outcome },
              capturedAt: new Date().toISOString()
            }))
          ))
        ))
      ));
    },

    async getMatchEvents() {
      return [];
    }
  };
}

function normalizeMarket(key) {
  if (key === "h2h") return "MATCH_WINNER";
  if (key === "totals") return "TOTAL_GOALS";
  if (key === "btts") return "BOTH_TEAMS_SCORE";
  return key.toUpperCase();
}
