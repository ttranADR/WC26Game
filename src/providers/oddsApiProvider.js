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
    supportsMatchEvents: false,

    async getFixturesByDate(date) {
      const sportKey = preferredSportKey || await findWorldCupSoccerSportKey(call);
      if (!sportKey) return [];

      const events = await call(`/sports/${sportKey}/events`);
      return filterEventsByDate(events, date).map(mapTheOddsApiEventFixture);
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

    async getOddsByMatchMappings(mappings = []) {
      const sportKey = preferredSportKey || await findWorldCupSoccerSportKey(call);
      if (!sportKey) return [];

      const markets = [...new Set([
        ...featuredMarkets.split(",").map((market) => market.trim()).filter(Boolean),
        ...extraMarkets
      ])].join(",");
      const rows = await Promise.all((mappings || [])
        .filter((mapping) => (
          mapping.providerMatchId &&
          (!mapping.provider || mapping.provider === "odds-api")
        ))
        .map(async (mapping) => {
          try {
            const row = await call(`/sports/${sportKey}/events/${mapping.providerMatchId}/odds?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal`);
            return mapEventOdds(enrichTheOddsApiEventWithMapping(row, mapping));
          } catch {
            return [];
          }
        }));
      return rows.flat();
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
  const requestedLimit = Number(process.env.ODDS_API_EVENT_LIMIT || 50);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : 50;
  const bookmakers = process.env.ODDS_API_BOOKMAKERS || "Bet365";
  const eventBookmaker = bookmakers.split(",").map((bookmaker) => bookmaker.trim()).filter(Boolean)[0];

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

  async function fetchEventRows(params = {}) {
    const eventRows = [];
    const seenEventIds = new Set();
    for (let skip = 0; ; skip += limit) {
      const data = await call("/events", {
        sport,
        league,
        status,
        bookmaker: eventBookmaker,
        limit,
        skip,
        ...params
      });
      const pageRows = unpackRows(data);
      const newRows = pageRows.filter((event) => {
        const eventId = event.id ? String(event.id) : JSON.stringify(event);
        if (seenEventIds.has(eventId)) return false;
        seenEventIds.add(eventId);
        return true;
      });

      eventRows.push(...newRows);
      if (pageRows.length < limit || !newRows.length) break;
    }
    return eventRows;
  }

  async function fetchOddsForEvents(eventRows) {
    const oddsRows = [];
    const eventsById = new Map(eventRows
      .map((event) => [getV3EventId(event), event])
      .filter(([eventId]) => eventId));
    for (const eventChunk of chunk(eventRows, 10)) {
      const eventIds = eventChunk.map(getV3EventId).filter(Boolean).join(",");
      if (!eventIds) continue;
      const rows = await call("/odds/multi", { eventIds, bookmakers });
      oddsRows.push(...unpackRows(rows).map((row) => mergeV3EventMetadata(eventsById.get(getV3EventId(row)), row)));
    }
    return oddsRows.flatMap(mapOddsApiIoV3EventOdds);
  }

  return {
    supportsMatchEvents: false,

    async getFixturesByDate(date) {
      const { from, to } = makeDateRange(date);
      const eventRows = await fetchEventRows({ from, to });
      return eventRows.map(mapOddsApiIoV3EventFixture);
    },

    async getLiveScores() {
      return [];
    },

    async getOddsByDate(date) {
      const { from, to } = makeDateRange(date);
      const eventRows = await fetchEventRows({ from, to });
      return fetchOddsForEvents(eventRows);
    },

    async getCompetitionOdds() {
      const eventRows = await fetchEventRows();
      return fetchOddsForEvents(eventRows);
    },

    async getOddsByMatchMappings(mappings = []) {
      const eventRows = (mappings || [])
        .filter((mapping) => (
          mapping.providerMatchId &&
          (!mapping.provider || mapping.provider === "odds-api-v3")
        ))
        .map(mapOddsApiIoV3MappingEvent);
      return fetchOddsForEvents(eventRows);
    },

    async getMatchEvents() {
      return [];
    }
  };
}

function unpackRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.data || payload?.events || [];
}

function makeDateRange(date) {
  const start = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    from: start.toISOString().replace(".000Z", "Z"),
    to: end.toISOString().replace(".000Z", "Z")
  };
}

const PLAYABLE_CORRECT_SCORE_LABELS = new Set(
  Array.from({ length: 6 }, (_, home) => (
    Array.from({ length: 6 }, (__, away) => `${home}-${away}`)
  )).flat()
);

function mapOddsApiIoV3EventFixture(event) {
  return {
    externalProvider: "odds-api-v3",
    externalId: getV3EventId(event),
    homeTeamExternalId: getV3TeamId(event, "home"),
    awayTeamExternalId: getV3TeamId(event, "away"),
    homeTeam: getV3HomeTeam(event),
    awayTeam: getV3AwayTeam(event),
    homeTeamCode: getV3HomeTeam(event).slice(0, 3).toUpperCase(),
    awayTeamCode: getV3AwayTeam(event).slice(0, 3).toUpperCase(),
    kickoffAt: getV3EventDate(event),
    status: "SCHEDULED",
    rawData: event
  };
}

function mapOddsApiIoV3MappingEvent(mapping) {
  return {
    id: mapping.providerMatchId,
    appMatchId: mapping.appMatchId,
    home: mapping.providerHomeTeam,
    away: mapping.providerAwayTeam,
    date: mapping.providerKickoffAt,
    participants: [{
      id: mapping.providerHomeTeamExternalId,
      side: "home",
      name: mapping.providerHomeTeam
    }, {
      id: mapping.providerAwayTeamExternalId,
      side: "away",
      name: mapping.providerAwayTeam
    }]
  };
}

function mapOddsApiIoV3EventOdds(event) {
  const bookmakerEntries = getV3BookmakerEntries(event);
  const exactScoreOdds = bookmakerEntries.flatMap(({ bookmaker, markets }) => (
    normalizeV3Markets(markets).flatMap((market) => extractV3ExactScoreOdds(event, bookmaker, market))
  ));
  const marketOdds = bookmakerEntries.flatMap(({ bookmaker, markets }) => (
    normalizeV3Markets(markets).flatMap((market) => mapOddsApiIoV3Market(event, bookmaker, market))
  ));

  return dedupeV3Odds([...exactScoreOdds, ...marketOdds]);
}

function getV3BookmakerEntries(event) {
  const bookmakers = normalizeV3Bookmakers(getV3BookmakerSource(event));
  return bookmakers.length ? bookmakers : [{
    bookmaker: String(event.bookmaker || event.bookmakerName || event.bookmaker_name || "Bookmaker"),
    markets: event.markets || event.odds || event.outcomes || event.data || []
  }];
}

function extractV3ExactScoreOdds(event, bookmaker, market) {
  const marketKey = normalizeV3Market(getV3MarketName(market)) || inferV3MarketKey(market);
  if (marketKey !== "CORRECT_SCORE") return [];

  const seenScores = new Set();
  return normalizeV3MarketRows(market, "CORRECT_SCORE").flatMap((row) => (
    getV3ScorePriceEntries(row).flatMap(({ label, price, raw }) => {
      const outcomeName = normalizeScoreOutcome(label);
      if (!PLAYABLE_CORRECT_SCORE_LABELS.has(outcomeName) || seenScores.has(outcomeName)) return [];
      const odd = makeV3Odd(event, bookmaker, market, "CORRECT_SCORE", outcomeName, price, raw || row);
      if (!odd) return [];
      seenScores.add(outcomeName);
      return [odd];
    })
  ));
}

function getV3ScorePriceEntries(row) {
  if (!isRecord(row)) return [];
  const entries = [];
  const directLabel = row.score || row.label || row.name || row.outcome || row.result || row.value;
  const directPrice = row.odds ?? row.odd ?? row.price ?? row.decimal ?? (normalizeScoreOutcome(row.value) ? null : row.value);
  if (normalizeScoreOutcome(directLabel)) entries.push({ label: directLabel, price: directPrice, raw: row });

  Object.entries(row)
    .filter(([key]) => /^\d+\s*-\s*\d+$/.test(key))
    .forEach(([label, price]) => entries.push({ label, price, raw: row }));

  return entries;
}

function mapOddsApiIoV3Market(event, bookmaker, market) {
  const marketKey = normalizeV3Market(getV3MarketName(market)) || inferV3MarketKey(market);
  if (!marketKey) return [];

  return normalizeV3MarketRows(market, marketKey).flatMap((row) => {
    if (marketKey === "MATCH_WINNER") return mapV3MatchWinner(event, bookmaker, market, row);
    if (marketKey === "TOTAL_GOALS") return mapV3Totals(event, bookmaker, market, row);
    if (marketKey === "BOTH_TEAMS_SCORE") return mapV3BothTeamsScore(event, bookmaker, market, row);
    if (marketKey === "CORRECT_SCORE") return mapV3CorrectScore(event, bookmaker, market, row);
    return [];
  });
}

function normalizeV3Bookmakers(bookmakers) {
  if (Array.isArray(bookmakers)) {
    return bookmakers.flatMap((row) => {
      if (!isRecord(row)) return [];
      const bookmaker = row.name || row.bookmaker || row.key || row.title || "Bookmaker";
      const markets = row.markets || row.odds || row.outcomes || row.data || [];
      return [{ bookmaker: String(bookmaker), markets }];
    });
  }

  if (!isRecord(bookmakers)) return [];
  return Object.entries(bookmakers).map(([bookmaker, markets]) => ({
    bookmaker,
    markets: unwrapV3BookmakerMarkets(markets)
  }));
}

function unwrapV3BookmakerMarkets(value) {
  if (!isRecord(value)) return value;
  if (Array.isArray(value.markets) || isRecord(value.markets)) return value.markets;
  if (!normalizeV3Market(getV3MarketName(value))) {
    if (Array.isArray(value.odds) || isRecord(value.odds)) return value.odds;
    if (Array.isArray(value.outcomes) || isRecord(value.outcomes)) return value.outcomes;
    if (Array.isArray(value.data) || isRecord(value.data)) return value.data;
  }
  return value;
}

function normalizeV3Markets(markets) {
  if (Array.isArray(markets)) return markets.filter(isRecord);
  if (!isRecord(markets)) return [];
  if (looksLikeV3Market(markets)) return [markets];

  return Object.entries(markets).flatMap(([marketName, marketRows]) => {
    if (Array.isArray(marketRows)) return [{ name: marketName, odds: marketRows }];
    if (isRecord(marketRows)) {
      return [{ ...marketRows, name: getV3MarketName(marketRows) || marketName }];
    }
    return [];
  });
}

function normalizeV3MarketRows(market, marketKey) {
  const rows = market.odds ?? market.outcomes ?? market.values ?? market.prices ?? market.selections ?? market.lines;
  if (Array.isArray(rows)) return rows.filter(isRecord);
  if (isRecord(rows)) {
    if (marketKey === "CORRECT_SCORE" && hasCorrectScoreLabel(rows)) return [rows];
    if (marketKey !== "CORRECT_SCORE" && hasSingleMarketRowShape(rows)) return [rows];
    return mapV3PriceObjectRows(rows);
  }

  if (marketKey === "CORRECT_SCORE" && (hasCorrectScoreLabel(market) || hasScorePriceEntries(market))) return [market];
  if (marketKey !== "CORRECT_SCORE" && hasSingleMarketRowShape(market)) return [market];
  return [];
}

function mapV3PriceObjectRows(rows) {
  return Object.entries(rows).flatMap(([label, value]) => {
    if (isRecord(value)) {
      return [{
        ...value,
        label: value.label || value.score || value.name || label,
        odds: value.odds ?? value.odd ?? value.price ?? value.decimal ?? value.value
      }];
    }
    return [{ label, odds: value }];
  });
}

function looksLikeV3Market(value) {
  return isRecord(value) && (
    value.name ||
    value.market ||
    value.key ||
    value.type ||
    value.label ||
    value.title ||
    value.odds ||
    value.outcomes ||
    value.values ||
    value.prices ||
    value.selections ||
    value.lines
  );
}

function hasSingleMarketRowShape(value) {
  return isRecord(value) && ["home", "draw", "away", "over", "under", "yes", "no", "Yes", "No"].some((key) => key in value);
}

function hasCorrectScoreLabel(value) {
  if (!isRecord(value)) return false;
  return Boolean(normalizeScoreOutcome(value.score || value.label || value.name || value.outcome || value.result || value.value));
}

function hasScorePriceEntries(value) {
  return isRecord(value) && Object.keys(value).some((key) => /^\d+\s*-\s*\d+$/.test(key));
}

function getV3MarketName(market = {}) {
  return market.name ||
    market.market ||
    market.type ||
    market.key ||
    market.label ||
    market.title ||
    market.displayName ||
    market.display_name ||
    "";
}

function inferV3MarketKey(market) {
  if (hasCorrectScoreLabel(market) || hasScorePriceEntries(market)) return "CORRECT_SCORE";
  const scoreRows = normalizeV3MarketRows(market, "CORRECT_SCORE");
  return scoreRows.some((row) => hasCorrectScoreLabel(row) || hasScorePriceEntries(row))
    ? "CORRECT_SCORE"
    : null;
}

function dedupeV3Odds(odds) {
  const seen = new Set();
  return odds.filter((odd) => {
    const key = [
      odd.provider,
      odd.providerMatchId || odd.tournamentMatchId,
      odd.bookmaker,
      odd.marketKey,
      odd.outcomeName
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapV3MatchWinner(event, bookmaker, market, row) {
  const homeTeam = getV3HomeTeam(event);
  const awayTeam = getV3AwayTeam(event);
  return [
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", homeTeam, row.home),
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", "Draw", row.draw),
    makeV3Odd(event, bookmaker, market, "MATCH_WINNER", awayTeam, row.away)
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
  const directPrice = row.odds ?? row.odd ?? row.price ?? row.decimal ?? (normalizeScoreOutcome(row.value) ? null : row.value);
  const mapped = [];
  const seenScores = new Set();
  const directOutcome = normalizeScoreOutcome(directScore);
  const direct = makeV3Odd(event, bookmaker, market, "CORRECT_SCORE", directOutcome, directPrice, row);
  if (direct) {
    mapped.push(direct);
    seenScores.add(direct.outcomeName);
  }

  Object.entries(row)
    .filter(([key]) => /^\d+\s*-\s*\d+$/.test(key))
    .forEach(([score, price]) => {
      const outcomeName = normalizeScoreOutcome(score);
      if (seenScores.has(outcomeName)) return;
      const odd = makeV3Odd(event, bookmaker, market, "CORRECT_SCORE", outcomeName, price, row);
      if (odd) {
        mapped.push(odd);
        seenScores.add(outcomeName);
      }
    });

  return mapped;
}

function makeV3Odd(event, bookmaker, market, marketKey, outcomeName, price, row = null) {
  const priceDecimal = Number(price);
  if (!outcomeName || !Number.isFinite(priceDecimal) || priceDecimal <= 1) return null;
  return {
    tournamentMatchId: getV3EventId(event),
    provider: "odds-api-v3",
    appMatchId: event.appMatchId,
    providerMatchId: getV3EventId(event),
    marketKey,
    bookmaker,
    outcomeName,
    priceDecimal,
    priceAmerican: null,
    impliedProbability: Number((1 / priceDecimal).toFixed(4)),
    homeTeam: getV3HomeTeam(event),
    awayTeam: getV3AwayTeam(event),
    commenceAt: getV3EventDate(event),
    rawData: { event, market, row },
    capturedAt: new Date().toISOString()
  };
}

function normalizeV3Market(name) {
  const normalized = normalizeV3Text(name);
  if (["ml", "moneyline", "match winner", "match result", "1x2"].some((item) => normalized.includes(item))) return "MATCH_WINNER";
  if (["over/under", "totals", "total"].some((item) => normalized.includes(item))) return "TOTAL_GOALS";
  if (["both teams to score", "btts"].some((item) => normalized.includes(item))) return "BOTH_TEAMS_SCORE";
  if (normalized.includes("correct score")) return "CORRECT_SCORE";
  return null;
}

function getV3BookmakerSource(event) {
  return event.bookmakers || event.bookmakerOdds || event.bookmaker_odds || event.oddsByBookmaker || event.odds_by_bookmaker;
}

function mergeV3EventMetadata(baseEvent, oddsEvent) {
  if (!baseEvent) return oddsEvent;
  return {
    ...baseEvent,
    ...oddsEvent,
    id: getV3EventId(oddsEvent) || getV3EventId(baseEvent),
    home: getV3HomeTeam(oddsEvent) || getV3HomeTeam(baseEvent),
    away: getV3AwayTeam(oddsEvent) || getV3AwayTeam(baseEvent),
    date: getV3EventDate(oddsEvent) || getV3EventDate(baseEvent)
  };
}

function getV3EventId(event = {}) {
  const id = event.id ?? event.eventId ?? event.event_id ?? event.fixtureId ?? event.fixture_id ?? event.matchId ?? event.match_id;
  return id == null || id === "" ? "" : String(id);
}

function getV3HomeTeam(event = {}) {
  return extractV3TeamName(event, "home") ||
    event.homeTeam ||
    event.home_team ||
    event.home_name ||
    event.homeParticipant ||
    event.home_participant ||
    "";
}

function getV3AwayTeam(event = {}) {
  return extractV3TeamName(event, "away") ||
    event.awayTeam ||
    event.away_team ||
    event.away_name ||
    event.awayParticipant ||
    event.away_participant ||
    "";
}

function getV3EventDate(event = {}) {
  return event.date ||
    event.commenceAt ||
    event.commence_at ||
    event.commenceTime ||
    event.commence_time ||
    event.startTime ||
    event.start_time ||
    event.startsAt ||
    event.starts_at ||
    event.kickoffAt ||
    event.kickoff_at ||
    "";
}

function extractV3TeamName(event, side) {
  const direct = event[side];
  if (typeof direct === "string") return direct;
  if (isRecord(direct)) return direct.name || direct.teamName || direct.team_name || direct.title || direct.displayName || "";

  const participants = event.participants || event.teams || event.competitors || [];
  if (!Array.isArray(participants)) return "";
  const team = participants.find((participant) => {
    const marker = String(participant.side || participant.position || participant.type || participant.home_away || participant.homeAway || "").toLowerCase();
    if (marker === side) return true;
    if (side === "home" && participant.home === true) return true;
    if (side === "away" && participant.away === true) return true;
    return false;
  });
  return team?.name || team?.teamName || team?.team_name || team?.title || team?.displayName || "";
}

function getV3TeamId(event = {}, side) {
  const direct = event[side];
  if (isRecord(direct)) {
    const id = direct.id ?? direct.teamId ?? direct.team_id ?? direct.participantId ?? direct.participant_id;
    if (id != null && id !== "") return String(id);
  }

  const participants = event.participants || event.teams || event.competitors || [];
  if (!Array.isArray(participants)) return "";
  const team = participants.find((participant) => {
    const marker = String(participant.side || participant.position || participant.type || participant.home_away || participant.homeAway || "").toLowerCase();
    if (marker === side) return true;
    if (side === "home" && participant.home === true) return true;
    if (side === "away" && participant.away === true) return true;
    return false;
  });
  const id = team?.id ?? team?.teamId ?? team?.team_id ?? team?.participantId ?? team?.participant_id;
  return id == null || id === "" ? "" : String(id);
}

function normalizeV3Text(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ");
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
    appMatchId: event.appMatchId,
    providerMatchId: event.id,
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

function mapTheOddsApiEventFixture(event) {
  return {
    externalProvider: "odds-api",
    externalId: String(event.id || ""),
    homeTeamExternalId: null,
    awayTeamExternalId: null,
    homeTeam: event.home_team || "",
    awayTeam: event.away_team || "",
    homeTeamCode: String(event.home_team || "HOM").slice(0, 3).toUpperCase(),
    awayTeamCode: String(event.away_team || "AWY").slice(0, 3).toUpperCase(),
    kickoffAt: event.commence_time,
    status: "SCHEDULED",
    rawData: event
  };
}

function enrichTheOddsApiEventWithMapping(event, mapping) {
  return {
    ...event,
    id: event.id || mapping.providerMatchId,
    appMatchId: mapping.appMatchId,
    home_team: event.home_team || mapping.providerHomeTeam,
    away_team: event.away_team || mapping.providerAwayTeam,
    commence_time: event.commence_time || mapping.providerKickoffAt
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
