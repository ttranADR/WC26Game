# Live Data Pipeline

PitchPick uses external sports APIs as ingestion sources, not as the runtime source of truth for the browser app.

## Source Of Truth

```text
External fixture API -> backend sync -> Neon -> backend state API -> browser app
External odds API    -> backend sync -> Neon -> backend state API -> browser app
```

The browser app only calls PitchPick backend endpoints such as `/api/state` and admin/player mutation routes. It does not call fixture or odds APIs directly.

## Fixture System

Fixture sync imports the World Cup game list from the configured fixture provider.

For the current live setup, `FIXTURES_PROVIDER=football-data` can read the whole competition schedule through `getCompetitionFixtures()`.

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
   - one `matchDayId` for an admin action, or
   - every stored fixture for a scheduled full sync.
3. Group the target games by fixture date from `kickoffAt`.
4. Call the configured odds API once per stored fixture date.
5. Resolve each provider odds row back to a stored `tournamentMatchId` using:
   - stored match ID,
   - provider external ID,
   - team names plus kickoff date.
6. Store matched odds as `oddsSnapshots`.
7. Keep unmatched provider rows out of app state and log the unmatched count.

Cards, exact-score boosts, player screens, and admin screens then read odds from stored `oddsSnapshots`.

## Correct Score Odds

Every stored fixture must have a complete `CORRECT_SCORE` market in `oddsSnapshots`.

The stored outcomes cover every scoreline from `0-0` through `5-5`, inclusive. That is 36 rows per game:

```text
0-0, 0-1, ... 0-5
1-0, 1-1, ... 1-5
...
5-0, 5-1, ... 5-5
```

When the odds API returns a bookmaker quote for a scoreline, PitchPick stores the provider quote. When a scoreline is missing, PitchPick stores a transparent fallback row with `provider: "pitchpick-generated"` and `bookmaker: "PitchPick"` so exact-score scoring always has a multiplier available.

## Required Production Configuration

```text
DATABASE_URL=your_neon_pooled_connection_string
REQUIRE_NEON_STORAGE=true
FIXTURES_PROVIDER=football-data
ODDS_PROVIDER=odds-api
```

If a live provider is configured without `DATABASE_URL`, server startup fails. This prevents live API data from being written only to local JSON.
