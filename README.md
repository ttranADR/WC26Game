# World Cup 26 Prediction

World Cup 26 Prediction is a World Cup prediction game for friend leagues. This version is a Node app with a browser frontend, Neon Postgres storage for deployed/live data, local JSON storage for mock development, football/odds API sync, admin tools, player submissions, scoring, exact-score multipliers, and standings.

## Run Locally

```bash
cd /Users/thanhlochuynhtran/Documents/Codex/2026-06-05/files-mentioned-by-the-user-pasted/outputs/pitchpick-fullstack
/Users/thanhlochuynhtran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/reset-data.js
/Users/thanhlochuynhtran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

Open:

```text
http://localhost:4173
```

## Seed Users

- Admin: `admin@pitchpick.local`
- Player: `you@pitchpick.local`
- Admin password: `admin123`
- Player password: `player123`
- Friends: Maya, Liam, Noah, Ava, Ethan, Sofia, Omar, Emma, Kenji, Lina

This MVP uses demo login with role checks. Players cannot see the Admin tab, and Admin API routes reject non-admin users. For production, replace this with a real auth provider before opening the app beyond trusted friends.

## Login And Roles

Open `http://localhost:4173` and log in before using the app. Login accepts email, display name, or player id.

- Admin demo: `admin@pitchpick.local` / `admin123`
- Player demo: `you@pitchpick.local` / `player123`

Players see only player-safe navigation. Admin users see the Admin tab. The backend also checks `x-user-id` on Admin API calls, so hiding the tab is not the only protection.

## Player Database

Player accounts are stored in Neon with the rest of the league state. Each user row includes:

- `id`: stable player id used by league memberships, picks, score predictions, and matchup assignments.
- `email`: login email.
- `displayName`: name shown in matchups, standings, and admin tools.
- `role`: `ADMIN` or `PLAYER`.
- `passwordHash`: stored credential hash. The app does not store or send plain-text passwords in hydrated browser state.
- `hasPassword`: browser-safe flag shown on the admin-only **Player Data** page.

If `role` is `ADMIN`, the user sees the Admin page after login and the server allows Admin API calls for that user. If `role` is `PLAYER`, the Admin tab stays hidden and Admin API calls are rejected. Admins can create or reset passwords, but cannot view the current stored password because only the hash is stored. After an admin reset, the player can log in with the new password using their email, display name, or player id.

## Implemented Features

- Player matchday screen with 12 prediction cards.
- Select at least 5 and up to 12 cards.
- Yes is green, No is red.
- Prediction card generation filters mirrored meanings, so a set will not include duplicate yes/no-equivalent cards like Over 2.5 and Under 2.5 for the same match.
- Card questions include match winners, totals, both teams to score, first team to score, red-card checks, top-scorer scoring checks, and exact-score cards.
- Correct selected cards score +10; incorrect selected cards score -10.
- Exact Score Boost reads all correct-score ratios from backend odds snapshots.
- Correct-score odds store every scoreline from `0-0` through `5-5` for each game.
- Matchdays group tournament games by Pacific calendar date.
- All matchdays are grouped by World Cup phase and the current/today matchday is highlighted.
- Dedicated Matchups tab with a full-tournament calendar for browsing mixed 1v1, 2v2, and half-league contests.
- Matchday projected and final totals follow the scheduled matchup side, including 2v2 and half-league sums.
- Player matchup views resolve through matchup assignment links: player ID + matchday + league -> matchup ID.
- Admin-only Player Data page shows each user's email, role, player id, and protected password credential status.
- Admin can create users directly, set passwords, update names, and update roles.
- Users can update their own display name and password from Account.
- Submit card answers and exact score prediction.
- Lock-time validation on the backend.
- Admin dashboard for league ops.
- Admin-only League Data page for creating leagues, selecting/managing leagues, editing league name/season/matchup style, and assigning existing players to leagues.
- Sync fixtures, sync odds, generate cards, generate selected-matchday or full-season matchups.
- Update WC Match Score refreshes actual results for the selected matchday before scoring or finalizing.
- Lock, score, finalize, void card.
- Raw sync logs and standings CSV export.
- 1v1, 2v2, half-league, and mixed matchup schedules.
- Odd-player 1v1 matchdays create one 1v2 contest instead of a bye.
- Odd-player 2v2 matchdays fold the extra player into a 3v2 contest instead of a bye.
- Uneven-side matchups normalize score by player count, so a solo player in 1v2 has their fantasy score doubled against the two-player sum.
- Finalized league points are preserved when future matchups are shuffled.
- Idempotent scoring.
- Dark/light mode.
- Mobile responsive layout.

## Managing Players And Leagues

Admin-only setup is split across two data pages.

1. Open **Player Data** to create users with name, email, role, and password.
2. Use **Player Data** to update an existing user's name, role, or password.
3. Open **League Data** to create/select leagues and edit league name, season, or matchup style.
4. Use **League Members** on **League Data** to add existing player users into the selected league or remove them.
5. Use **Admin** for matchday ops: sync data, update WC match scores, generate cards, generate matchups, score, finalize, and void cards.
6. Use **Account** to update your own display name or password.

## Data Storage

The production data flow is:

```text
External fixtures/odds APIs -> protected sync endpoint/job -> Neon Postgres -> World Cup 26 Prediction backend -> browser app
```

The browser app never calls paid sports APIs directly. It loads app state from the World Cup 26 Prediction backend, and the backend reads that state from the configured store. In deployed/live mode, that store must be Neon.

See [docs/live-data-pipeline.md](docs/live-data-pipeline.md) for the fixture and odds ingestion design.

Set this for Neon-backed runtime:

```text
DATABASE_URL=your_neon_pooled_connection_string
REQUIRE_NEON_STORAGE=true
```

When `DATABASE_URL` is set, the app stores player accounts, player profiles, league memberships, player card sets, submitted picks, exact-score predictions, matchup assignments, synced fixtures, odds snapshots, pairings, standings, and sync logs in Neon Postgres in a `pitchpick_state` JSONB row. Player accounts include login email, display name, role, and password hash. Keep `REQUIRE_NEON_STORAGE=true` in deployed environments so this player data cannot fall back to `data/db.json`. This keeps the MVP deployable without rewriting every feature into separate SQL tables first.

Local JSON storage is only for mock development without live providers:

```text
data/db.json
```

If you configure a live data provider such as `football-data`, `api-football`, `sportmonks`, or `odds-api`, the server requires `DATABASE_URL` so external API data is persisted to Neon instead of a local file.

For a later production hardening pass, split the JSON document into relational tables:

- users, profiles, leagues, league_members
- matchdays, tournament_matches, odds_snapshots
- prediction_cards, player_card_sets, player_cards
- score_predictions, head_to_head_contests, league_standings, sync_logs

## Live Data Providers

Default demo mode:

```text
DATA_PROVIDER=mock
```

Split live mode for fixtures plus odds:

```text
DATA_PROVIDER=mock
FIXTURES_PROVIDER=football-data
FOOTBALL_DATA_TOKEN=your_football_data_token
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
ODDS_PROVIDER=odds-api
ODDS_API_KEY=your_odds_api_key
ODDS_API_VERSION=v3
ODDS_API_BASE_URL=https://api.odds-api.io/v3
ODDS_API_SPORT=football
ODDS_API_LEAGUE=international-fifa-world-cup
ODDS_API_EVENT_STATUS=pending,live
ODDS_API_EVENT_LIMIT=50
ODDS_API_BOOKMAKERS=Bet365
```

`FOOTBALL_DATA_TOKEN` imports the World Cup fixture schedule/results from football-data.org. `ODDS_API_KEY` imports odds from odds-api.io v3. Initial Load pages all available World Cup `/events` with `limit`/`skip`, then batches `/odds/multi` requests for up to 10 events at a time. Daily updates still fetch odds only for the selected match date.

Postman smoke test for odds-api.io v3:

```text
GET https://api.odds-api.io/v3/events?apiKey=YOUR_API_KEY&sport=football&league=international-fifa-world-cup&status=pending&from=2026-06-13T00:00:00Z&to=2026-06-14T00:00:00Z&limit=50
```

API-Football:

```text
DATA_PROVIDER=api-football
API_FOOTBALL_KEY=your_key
```

Sportmonks:

```text
DATA_PROVIDER=sportmonks
SPORTMONKS_KEY=your_key
```

The Odds API:

```text
DATA_PROVIDER=odds-api
ODDS_API_KEY=your_key
```

API keys stay server-side in Node. Sync routes and scheduled jobs are the only places that call external sports APIs. Player/admin screens load the stored state from Neon through `/api/state` and mutation responses.

## Admin Live Data Workflow

Use the Admin tab's **Live Data** panel:

1. Click **Initial Load** one time after deployment. It imports all available World Cup fixtures from football-data, stores them in Neon, then bulk-imports all available World Cup odds from odds-api.
2. Use **Update Date** each matchday before the first match starts. It updates fixture status/results and odds only for the selected date.

Both actions run through the Render backend. The browser calls World Cup 26 Prediction admin endpoints; it never calls football-data or odds-api directly.

## Render + Neon Deployment

1. Push this `pitchpick-fullstack` folder to a GitHub repo.
2. Create a Neon project and copy the pooled Postgres connection string.
3. Create a Render Web Service from the GitHub repo.
4. Use these Render settings:

```text
Build command: npm install
Start command: npm start
```

5. Add Render environment variables:

```text
DATABASE_URL=your_neon_pooled_connection_string
REQUIRE_NEON_STORAGE=true
CRON_SECRET=a_long_random_secret
APP_URL=https://your-render-service.onrender.com
DATA_PROVIDER=mock
```

For your two-provider live setup, keep the default provider as mock fallback and add split providers:

```text
DATA_PROVIDER=mock
FIXTURES_PROVIDER=football-data
FOOTBALL_DATA_TOKEN=your_football_data_token
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
ODDS_PROVIDER=odds-api
ODDS_API_KEY=your_odds_api_key
ODDS_API_VERSION=v3
ODDS_API_BASE_URL=https://api.odds-api.io/v3
ODDS_API_SPORT=football
ODDS_API_LEAGUE=international-fifa-world-cup
ODDS_API_EVENT_STATUS=pending,live
ODDS_API_EVENT_LIMIT=50
ODDS_API_BOOKMAKERS=Bet365
```

Alternative single-provider modes are still supported:

```text
DATA_PROVIDER=api-football
API_FOOTBALL_KEY=your_key
```

```text
DATA_PROVIDER=sportmonks
SPORTMONKS_KEY=your_key
```

```text
DATA_PROVIDER=odds-api
ODDS_API_KEY=your_key
```

6. Deploy the Render service.
7. Open the Render URL and confirm login works.

The included `render.yaml` can also be used as a Render Blueprint.

## Scheduled API Sync

The backend exposes a protected sync endpoint:

```text
POST /api/jobs/sync-live-data
Authorization: Bearer {CRON_SECRET}
```

The endpoint accepts an optional sync mode:

```json
{ "sync": "fixtures" }
```

```json
{ "sync": "odds" }
```

```json
{ "sync": "both" }
```

Fixture sync can import the whole World Cup schedule from football-data.org. Odds sync reads the stored fixture list first, fetches odds by each stored fixture date, maps provider odds rows back to stored matches by ID/team/date, and writes odds snapshots to Neon.

For a free-friendly schedule, use the included GitHub Actions workflow:

```text
.github/workflows/sync-live-data.yml
```

Add these GitHub repo secrets:

```text
APP_URL=https://your-render-service.onrender.com
CRON_SECRET=same_value_as_render
```

The workflow is quota-friendly:

- Fixtures sync twice daily: once before the early match window and once after the late match window.
- Odds sync once daily.
- Manual runs from GitHub Actions can choose `both`, `fixtures`, or `odds`.

## Tests

```bash
/Users/thanhlochuynhtran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/run-tests.js
```

## Deployment Notes

- Render hosts the Node backend and frontend.
- Neon stores live app data when `DATABASE_URL` is set. Use `REQUIRE_NEON_STORAGE=true` in deployed environments.
- GitHub Actions can run the scheduled sync for free.
- Render free web services may sleep when idle, so the first request after inactivity can be slow.
- Before sharing widely, replace demo login with real authentication.
