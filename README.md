# PitchPick Full-Stack MVP

PitchPick is a World Cup prediction game for friend leagues. This version is a Node app with a browser frontend, Neon Postgres storage for deployed/live data, local JSON storage for mock development, football/odds API sync, admin tools, player submissions, scoring, exact-score multipliers, and standings.

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

Open `http://localhost:4173` and log in before using the app.

- Admin demo: `admin@pitchpick.local` / `admin123`
- Player demo: `you@pitchpick.local` / `player123`

Players see only player-safe navigation. Admin users see the Admin tab. The backend also checks `x-user-id` on Admin API calls, so hiding the tab is not the only protection.

## Implemented Features

- Player matchday screen with 12 prediction cards.
- Select at least 5 and up to 12 cards.
- Yes is green, No is red.
- Correct selected cards score +10; incorrect selected cards score -10.
- Exact Score Boost reads all correct-score ratios from backend odds snapshots.
- Correct-score odds store every scoreline from `0-0` through `5-5` for each game.
- All matchdays are grouped by World Cup phase and the current/today matchday is highlighted.
- Submit card answers and exact score prediction.
- Lock-time validation on the backend.
- Admin dashboard for league ops.
- Create league, select/manage any league, edit league name/season/matchup style, invite players into the selected league, and view league member metadata.
- Sync fixtures, sync odds, generate cards, generate selected-matchday or full-season matchups.
- Lock, score, finalize, void card.
- Raw sync logs and standings CSV export.
- 1v1, 2v2, half-league, and mixed matchup schedules.
- Finalized league points are preserved when future matchups are shuffled.
- Idempotent scoring.
- Dark/light mode.
- Mobile responsive layout.

## Managing Leagues

Open the Admin tab and use the **Manage Leagues** panel at the top.

1. Select the league you want to manage.
2. Edit the league name, season, or matchup style.
3. Click **Save League**.
4. Use **League Members** to invite a new friend, add an existing player, mark a member active/invited, or remove a member.
5. Use **Generate Season** to create the full matchup schedule, or **Shuffle Selected** to replace only the selected unfinalized matchday.
6. Invites, matchups, scoring, finalizing, and CSV export now target the selected managed league.

The invite form shows `Inviting to: {League Name}` so you can always see which league receives the friend invite.

### Inviting Friends Locally

This MVP supports real email when `RESEND_API_KEY` is configured. Without a key, it stores invite emails in the local **Email Outbox** so you can test the flow.

To enable real email, create `.env` from `.env.example`, add `RESEND_API_KEY`, set a verified `INVITE_FROM_EMAIL`, and restart the server.

To invite a friend:

1. Go to **Admin**.
2. Select the league in **Manage Leagues**.
3. In **League Members**, enter your friend's name and email.
4. Click **Create Invite Link**.
5. If `RESEND_API_KEY` is set, the app sends the invite email.
6. If no email key is set, copy the invite link from the member row or Email Outbox and send it manually.
7. When the friend opens the link, their invite is marked **ACTIVE** and they are logged in as that player.

For production email delivery, keep this flow behind server-side code and use Resend, Postmark, or another transactional email provider.

The Player tab still shows the seeded current player league until real auth/member switching is added.

## Data Storage

The production data flow is:

```text
External fixtures/odds APIs -> protected sync endpoint/job -> Neon Postgres -> PitchPick backend -> browser app
```

The browser app never calls paid sports APIs directly. It loads app state from the PitchPick backend, and the backend reads that state from the configured store. In deployed/live mode, that store must be Neon.

See [docs/live-data-pipeline.md](docs/live-data-pipeline.md) for the fixture and odds ingestion design.

Set this for Neon-backed runtime:

```text
DATABASE_URL=your_neon_pooled_connection_string
REQUIRE_NEON_STORAGE=true
```

When `DATABASE_URL` is set, the app stores metadata, synced fixtures, odds snapshots, cards, picks, pairings, standings, sync logs, and invite state in Neon Postgres in a `pitchpick_state` JSONB row. This keeps the MVP deployable without rewriting every feature into separate SQL tables first.

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

Both actions run through the Render backend. The browser calls PitchPick admin endpoints; it never calls football-data or odds-api directly.

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
