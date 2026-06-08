export function createOddsApiProvider(apiKey = process.env.ODDS_API_KEY) {
  if (!apiKey) throw new Error("ODDS_API_KEY is required for odds-api provider.");
  const baseUrl = "https://api.the-odds-api.com/v4";
  const preferredSportKey = process.env.ODDS_API_SPORT_KEY;
  const regions = process.env.ODDS_API_REGIONS || "us,uk,eu";
  const featuredMarkets = process.env.ODDS_API_FEATURED_MARKETS || "h2h,totals";
  const extraMarkets = (process.env.ODDS_API_EXTRA_MARKETS || "btts,correct_score")
    .split(",")
    .map((market) => market.trim())
    .filter(Boolean);

  async function call(path) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await fetch(`${baseUrl}${path}${joiner}apiKey=${apiKey}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.message || data.error_code || response.statusText || response.status;
      throw new Error(`The Odds API error: ${message}`);
    }
    return data;
  }

  return {
    async getFixturesByDate() {
      return [];
    },

    async getLiveScores() {
      return [];
    },

    async getOddsByDate(date) {
      const sportKey = preferredSportKey || await findWorldCupSoccerSportKey(call);
      if (!sportKey) return [];

      const events = await call(`/sports/${sportKey}/odds?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(featuredMarkets)}&oddsFormat=decimal`);
      const relevantEvents = filterEventsByDate(events, date);
      const regularOdds = relevantEvents.flatMap(mapEventOdds);
      const extraOdds = await getExtraMarketOdds(call, sportKey, relevantEvents, extraMarkets, regions);

      return [...regularOdds, ...extraOdds];
    },

    async getMatchEvents() {
      return [];
    }
  };
}

async function findWorldCupSoccerSportKey(call) {
  const sports = await call("/sports");
  const soccer = sports.filter((sport) => sport.key.includes("soccer") && sport.active);
  return soccer.find((sport) => sport.key.includes("fifa_world_cup"))?.key ||
    soccer.find((sport) => sport.key.includes("world_cup"))?.key ||
    soccer[0]?.key ||
    null;
}

async function getExtraMarketOdds(call, sportKey, events, markets, regions) {
  const perEvent = await Promise.all(events.map(async (event) => {
    const perMarket = await Promise.all(markets.map(async (market) => {
      try {
        const row = await call(`/sports/${sportKey}/events/${event.id}/odds?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(market)}&oddsFormat=decimal`);
        return mapEventOdds(row);
      } catch {
        return [];
      }
    }));
    return perMarket.flat();
  }));
  return perEvent.flat();
}

function filterEventsByDate(events, date) {
  if (!date) return events || [];
  return (events || []).filter((event) => {
    const eventDate = event.commence_time?.slice(0, 10);
    return eventDate === date;
  });
}

function mapEventOdds(event) {
  return (event.bookmakers || []).flatMap((bookmaker) => (
    (bookmaker.markets || []).flatMap((market) => (
      (market.outcomes || []).map((outcome) => makeOdd(event, bookmaker, market, outcome))
    ))
  ));
}

function makeOdd(event, bookmaker, market, outcome) {
  const priceDecimal = Number(outcome.price);
  return {
    tournamentMatchId: event.id,
    provider: "odds-api",
    marketKey: normalizeMarket(market.key),
    bookmaker: bookmaker.title,
    outcomeName: normalizeOutcomeName(market, outcome),
    priceDecimal,
    priceAmerican: null,
    impliedProbability: priceDecimal ? Number((1 / priceDecimal).toFixed(4)) : null,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceAt: event.commence_time,
    rawData: { event, bookmaker, market, outcome },
    capturedAt: new Date().toISOString()
  };
}

function normalizeMarket(key) {
  if (key === "h2h") return "MATCH_WINNER";
  if (key === "totals") return "TOTAL_GOALS";
  if (key === "btts") return "BOTH_TEAMS_SCORE";
  if (key === "correct_score") return "CORRECT_SCORE";
  return key.toUpperCase();
}

function normalizeOutcomeName(market, outcome) {
  if (market.key === "totals" && outcome.point != null) return `${outcome.name} ${outcome.point}`;
  if (market.key === "correct_score") return String(outcome.name).replace(/\s+/g, "");
  return outcome.name;
}
