export function createOddsApiProvider(apiKey = process.env.ODDS_API_KEY) {
  if (!apiKey) throw new Error("ODDS_API_KEY is required for odds-api provider.");
  const baseUrl = "https://api.the-odds-api.com/v4";
  const preferredSportKey = process.env.ODDS_API_SPORT_KEY;

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

    async getOddsByDate(date) {
      const sportKey = preferredSportKey || await findWorldCupSoccerSportKey(call);
      if (!sportKey) return [];

      const events = await call(`/sports/${sportKey}/odds?regions=us,uk,eu&markets=h2h,totals,btts&oddsFormat=decimal`);
      const relevantEvents = filterEventsByDate(events, date);
      const regularOdds = relevantEvents.flatMap(mapEventOdds);
      const correctScoreOdds = await getCorrectScoreOdds(call, sportKey, relevantEvents, date);

      return [...regularOdds, ...correctScoreOdds];
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

async function getCorrectScoreOdds(call, sportKey, events, date) {
  try {
    const rows = await call(`/sports/${sportKey}/odds?regions=us,uk,eu&markets=correct_score&oddsFormat=decimal`);
    return filterEventsByDate(rows, date).flatMap(mapEventOdds);
  } catch {
    const perEvent = await Promise.all(events.map(async (event) => {
      try {
        const row = await call(`/sports/${sportKey}/events/${event.id}/odds?regions=us,uk,eu&markets=correct_score&oddsFormat=decimal`);
        return mapEventOdds(row);
      } catch {
        return [];
      }
    }));
    return perEvent.flat();
  }
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
