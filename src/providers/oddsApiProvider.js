export function createOddsApiProvider(apiKey = process.env.ODDS_API_KEY) {
  if (!apiKey) throw new Error("ODDS_API_KEY is required for odds-api provider.");
  const version = process.env.ODDS_API_VERSION || "v3";
  if (version === "v3") return createOddsApiIoV3Provider(apiKey);
  return createTheOddsApiV4Provider(apiKey);
}

function createTheOddsApiV4Provider(apiKey) {
  const baseUrl = process.env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4";
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

function createOddsApiIoV3Provider(apiKey) {
  const baseUrl = process.env.ODDS_API_BASE_URL || "https://api.odds-api.io/v3";
  const sport = process.env.ODDS_API_SPORT || "football";
  const league = process.env.ODDS_API_LEAGUE || "international-fifa-world-cup";
  const status = process.env.ODDS_API_EVENT_STATUS || "pending,live";
  const limit = Number(process.env.ODDS_API_EVENT_LIMIT || 50);
  const bookmakers = process.env.ODDS_API_BOOKMAKERS || "Bet365";

  async function call(path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("apiKey", apiKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    });

    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.message || data.error || data.error_code || response.statusText || response.status;
      throw new Error(`Odds-API.io v3 error: ${message}`);
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
      const { from, to } = makeDateRange(date);
      const events = await call("/events", {
        sport,
        league,
        status,
        from,
        to,
        limit
      });
      const eventRows = Array.isArray(events) ? events : events.data || events.events || [];
      if (!eventRows.length) return [];

      const chunks = chunk(eventRows, 10);
      const oddsRows = [];
      for (const eventChunk of chunks) {
        const eventIds = eventChunk.map((event) => event.id).filter(Boolean).join(",");
        if (!eventIds) continue;
        const rows = await call("/odds/multi", { eventIds, bookmakers });
        oddsRows.push(...(Array.isArray(rows) ? rows : rows.data || rows.events || []));
      }

      return oddsRows.flatMap(mapOddsApiIoV3EventOdds);
    },

    async getMatchEvents() {
      return [];
    }
  };
}

function makeDateRange(date) {
  const start = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    from: start.toISOString().replace(".000Z", "Z"),
    to: end.toISOString().replace(".000Z", "Z")
  };
}

function mapOddsApiIoV3EventOdds(event) {
  return Object.entries(event.bookmakers || {}).flatMap(([bookmaker, markets]) => (
    (Array.isArray(markets) ? markets : []).flatMap((market) => mapOddsApiIoV3Market(event, bookmaker, market))
  ));
}

function mapOddsApiIoV3Market(event, bookmaker, market) {
  const marketKey = normalizeV3Market(market.name || market.market || market.type);
  if (!marketKey) return [];

  return (market.odds || market.outcomes || []).flatMap((row) => {
    if (marketKey === "MATCH_WINNER") return mapV3MatchWinner(event, bookmaker, market, row);
    if (marketKey === "TOTAL_GOALS") return mapV3Totals(event, bookmaker, market, row);
    if (marketKey === "BOTH_TEAMS_SCORE") return mapV3BothTeamsScore(event, bookmaker, market, row);
    if (marketKey === "CORRECT_SCORE") return mapV3CorrectScore(event, bookmaker, market, row);
    return [];
  });
}

function mapV3MatchWinner(event, bookmaker, market, row) {
  return [
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", event.home, row.home),
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", "Draw", row.draw),
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", event.away, row.away)
  ].filter(Boolean);
}

function mapV3Totals(event, bookmaker, market, row) {
  const line = row.max ?? row.hdp ?? row.line ?? row.total ?? row.points;
  return [
    makeV3Odd(event, bookmaker, market, "TOTAL_GOALS", `Over ${line}`, row.over),
    makeV3Odd(event, bookmaker, market, "TOTAL_GOALS", `Under ${line}`, row.under)
  ].filter(Boolean);
}

function mapV3BothTeamsScore(event, bookmaker, market, row) {
  return [
    makeV3Odd(event, bookmaker, market, "BOTH_TEAMS_SCORE", "Yes", row.yes ?? row.Yes),
    makeV3Odd(event, bookmaker, market, "BOTH_TEAMS_SCORE", "No", row.no ?? row.No)
  ].filter(Boolean);
}

function mapV3CorrectScore(event, bookmaker, market, row) {
  const directScore = row.score || row.label || row.name || row.outcome || row.result || row.value;
  const directPrice = row.odds || row.odd || row.price || row.decimal;
  const direct = makeV3Odd(event, bookmaker, market, "CORRECT_SCORE", normalizeScoreOutcome(directScore), directPrice);
  const keyed = Object.entries(row)
    .filter(([key]) => /^\d+\s*-\s*\d+$/.test(key))
    .map(([score, price]) => makeV3Odd(event, bookmaker, market, "CORRECT_SCORE", normalizeScoreOutcome(score), price))
    .filter(Boolean);
  return direct ? [direct, ...keyed] : keyed;
}

function makeV3Odd(event, bookmaker, market, marketKey, outcomeName, price) {
  const priceDecimal = Number(price);
  if (!outcomeName || !Number.isFinite(priceDecimal) || priceDecimal <= 1) return null;
  return {
    tournamentMatchId: String(event.id),
    provider: "odds-api-v3",
    marketKey,
    bookmaker,
    outcomeName,
    priceDecimal,
    priceAmerican: null,
    impliedProbability: Number((1 / priceDecimal).toFixed(4)),
    homeTeam: event.home,
    awayTeam: event.away,
    commenceAt: event.date,
    rawData: { event, market },
    capturedAt: new Date().toISOString()
  };
}

function normalizeV3Market(name) {
  const normalized = String(name || "").toLowerCase();
  if (["ml", "moneyline", "match winner", "match result", "1x2"].some((item) => normalized.includes(item))) return "MATCH_WINNER";
  if (["over/under", "totals", "total"].some((item) => normalized.includes(item))) return "TOTAL_GOALS";
  if (["both teams to score", "btts"].some((item) => normalized.includes(item))) return "BOTH_TEAMS_SCORE";
  if (normalized.includes("correct score")) return "CORRECT_SCORE";
  return null;
}

function normalizeScoreOutcome(value) {
  const match = String(value || "").match(/(\d+)\s*-\s*(\d+)/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
