# Live Data Pipeline

World Cup 26 Prediction uses external sports APIs as ingestion sources, not as the runtime source of truth for the browser app.

## Source Of Truth

```text
External fixture API -> backend sync -> Neon -> backend state API -> browser app
External odds API    -> backend sync -> Neon -> backend state API -> browser app
```

The browser app only calls World Cup 26 Prediction backend endpoints such as `/api/state` and admin/player mutation routes. It does not call fixture or odds APIs directly.

## Fixture System

Fixture sync imports the World Cup game list from the configured fixture provider.

For the current live setup, `FIXTURES_PROVIDER=football-data` can read the whole competition schedule through `getCompetitionFixtures()`.

The Admin **Initial Load** action runs this full-competition fixture import one time to create the initial Neon database, then immediately loads odds for the stored games.

Each fixture is normalized before storage:

- `date/time`: `kickoffAt`
- `teams`: `homeTeam`, `awayTeam`, `homeTeamCode`, `awayTeamCode`
- `result`: `status`, `homeScore`, `awayScore`, `firstGoalMinute`
- provider traceability: `externalProvider`, `externalId`, `rawData`

The backend stores those normalized fixtures in the app state under:

- `matchdays`
- `tournamentMatches`

With `DATABASE_URL` configured, that state is persisted in Neon in `pitchpick_state.data`.

## Odds Workflow

Odds sync is based on the stored fixture list, not on whatever games the odds API happens to return by default.

1. Read stored tournament matches from Neon.
2. Choose the target games:
   - one `matchDayId` for a daily admin action, or
   - every stored fixture for Initial Load.
3. For Initial Load, call odds-api v3 `/events` without a date range, page through all available World Cup events with `limit`/`skip`, then call `/odds/multi` in event batches.
4. For daily updates, group the target games by fixture date from `kickoffAt` and call the configured odds API only for those dates.
5. Resolve each provider odds row back to a stored `tournamentMatchId` using:
   - stored match ID,
   - provider external ID,
   - team names plus kickoff date.
6. Store matched odds as `oddsSnapshots`.
7. Keep unmatched provider rows out of app state and log the unmatched count.

Cards, exact-score boosts, player screens, and admin screens then read odds from stored `oddsSnapshots`.

## Admin Operations

Use the Admin **Live Data** panel for normal operations:

1. `Initial Load`: one-time setup. Read all World Cup matches from football-data, store as much fixture data as available in Neon, bulk-read all available World Cup odds from odds-api, then store odds snapshots in Neon.
2. `Update Date`: daily update. Read the selected stored match date, update fixture status/results for that date, then refresh odds for only those stored games.

The initial load is idempotent, but it is intended to be used as the database bootstrap rather than a daily task.

Initial odds loading uses odds-api v3 with:

```text
league=international-fifa-world-cup
bookmaker=Bet365
bookmakers=Bet365
```

## Correct Score Odds

Every stored fixture must have a complete `CORRECT_SCORE` market in `oddsSnapshots`.

The stored outcomes cover every scoreline from `0-0` through `5-5`, inclusive. That is 36 rows per game:

```text
0-0, 0-1, ... 0-5
1-0, 1-1, ... 1-5
...
5-0, 5-1, ... 5-5
```

When the odds API returns a bookmaker quote for a scoreline, World Cup 26 Prediction stores the provider quote. When a scoreline is missing, World Cup 26 Prediction stores a transparent fallback row with `provider: "pitchpick-generated"` and `bookmaker: "World Cup 26 Prediction"` so exact-score scoring always has a multiplier available.

## Required Production Configuration

```text
DATABASE_URL=your_neon_pooled_connection_string
REQUIRE_NEON_STORAGE=true
FIXTURES_PROVIDER=football-data
ODDS_PROVIDER=odds-api
```

If a live provider is configured without `DATABASE_URL`, server startup fails. This prevents live API data from being written only to local JSON.
