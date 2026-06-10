import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./src/store.js";
import { createNeonStore } from "./src/neonStore.js";
import { assertStorageConfiguration, getStorageMode, normalizeProviderName } from "./src/storageConfig.js";
import { createMockFootballProvider } from "./src/providers/mockFootballProvider.js";
import { createApiFootballProvider } from "./src/providers/apiFootballProvider.js";
import { createFootballDataProvider } from "./src/providers/footballDataProvider.js";
import { createSportmonksProvider } from "./src/providers/sportmonksProvider.js";
import { createOddsApiProvider } from "./src/providers/oddsApiProvider.js";
import {
  acceptLeagueInvite,
  addLeagueMember,
  createLeague,
  exportStandingsCsv,
  finalizeMatchday,
  generateCardsForMatchday,
  generatePairingsForMatchday,
  getAppState,
  initializeTournamentData,
  invitePlayer,
  loginUser,
  lockMatchday,
  rescoreMatchday,
  submitPicks,
  syncDailyTournamentData,
  syncFixtures,
  syncLiveData,
  syncOdds,
  updateLeague,
  updateMatchScoresForMatchday,
  updateLeagueMemberStatus,
  voidCard
} from "./src/services.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, ".env"));
const publicDir = path.join(__dirname, "public");
const dataPath = path.join(__dirname, "data", "db.json");
const databaseUrl = process.env.DATABASE_URL?.trim();
const defaultProviderName = normalizeProviderName(process.env.DATA_PROVIDER || "mock");
const fixtureProviderName = normalizeProviderName(process.env.FIXTURES_PROVIDER || defaultProviderName);
const oddsProviderName = normalizeProviderName(process.env.ODDS_PROVIDER || defaultProviderName);
assertStorageConfiguration({
  databaseUrl,
  requireNeonStorage: process.env.REQUIRE_NEON_STORAGE,
  providers: [defaultProviderName, fixtureProviderName, oddsProviderName]
});
const store = databaseUrl ? createNeonStore(databaseUrl) : createStore(dataPath);
const fixtureProvider = createProvider(fixtureProviderName);
const oddsProvider = createProvider(oddsProviderName);
const port = Number(process.env.PORT || 4173);
console.log(`PitchPick storage: ${getStorageMode(databaseUrl)}; fixtures: ${fixtureProviderName}; odds: ${oddsProviderName}`);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readJsonWithUser(req) {
  const body = await readJson(req);
  body.currentUserId = getRequestUserId(req);
  return body;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  try {
    if (method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, await getAppState(store, getRequestUserId(req)));
      return;
    }

    if (method === "GET" && url.pathname === "/api/export/standings.csv") {
      const leagueId = url.searchParams.get("leagueId") || "league_1";
      sendText(res, 200, await exportStandingsCsv(store, leagueId), "text/csv; charset=utf-8");
      return;
    }

    if (method === "POST" && url.pathname === "/api/auth/login") {
      sendJson(res, 200, await loginUser(store, await readJson(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/player/submit-picks") {
      const body = await readJsonWithUser(req);
      body.userId = getRequestUserId(req);
      sendJson(res, 200, await submitPicks(store, body));
      return;
    }

    if (method === "POST" && url.pathname === "/api/player/accept-invite") {
      sendJson(res, 200, await acceptLeagueInvite(store, await readJson(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/jobs/sync-live-data") {
      requireCronSecret(req);
      sendJson(res, 200, await syncLiveData(store, { fixtureProvider, oddsProvider }, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/create-league") {
      await requireAdmin(req);
      sendJson(res, 200, await createLeague(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/update-league") {
      await requireAdmin(req);
      sendJson(res, 200, await updateLeague(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/invite-player") {
      await requireAdmin(req);
      const body = await readJsonWithUser(req);
      body.appUrl ||= process.env.APP_URL || `http://${req.headers.host}`;
      sendJson(res, 200, await invitePlayer(store, body));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/add-member") {
      await requireAdmin(req);
      sendJson(res, 200, await addLeagueMember(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/update-member-status") {
      await requireAdmin(req);
      sendJson(res, 200, await updateLeagueMemberStatus(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/sync-fixtures") {
      await requireAdmin(req);
      sendJson(res, 200, await syncFixtures(store, fixtureProvider, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/sync-odds") {
      await requireAdmin(req);
      sendJson(res, 200, await syncOdds(store, oddsProvider, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/initialize-tournament-data") {
      await requireAdmin(req);
      sendJson(res, 200, await initializeTournamentData(store, { fixtureProvider, oddsProvider }, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/sync-daily-tournament-data") {
      await requireAdmin(req);
      sendJson(res, 200, await syncDailyTournamentData(store, { fixtureProvider, oddsProvider }, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/update-match-scores") {
      await requireAdmin(req);
      sendJson(res, 200, await updateMatchScoresForMatchday(store, fixtureProvider, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/generate-cards") {
      await requireAdmin(req);
      sendJson(res, 200, await generateCardsForMatchday(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/generate-pairings") {
      await requireAdmin(req);
      sendJson(res, 200, await generatePairingsForMatchday(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/lock-matchday") {
      await requireAdmin(req);
      sendJson(res, 200, await lockMatchday(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/score-matchday") {
      await requireAdmin(req);
      sendJson(res, 200, await rescoreMatchday(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/finalize-matchday") {
      await requireAdmin(req);
      sendJson(res, 200, await finalizeMatchday(store, await readJsonWithUser(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/api/admin/void-card") {
      await requireAdmin(req);
      sendJson(res, 200, await voidCard(store, await readJsonWithUser(req)));
      return;
    }

    sendJson(res, 404, { error: "Unknown API route" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`PitchPick full-stack app running at http://localhost:${port}`);
});

function getRequestUserId(req) {
  return req.headers["x-user-id"] || "user_you";
}

async function requireAdmin(req) {
  const userId = getRequestUserId(req);
  const data = await store.read();
  const user = data.users.find((item) => item.id === userId);
  if (!user || user.role !== "ADMIN") {
    throw new Error("Admin access required.");
  }
}

function requireCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required before running scheduled sync jobs.");
  if (req.headers.authorization !== `Bearer ${secret}`) {
    throw new Error("Cron authorization failed.");
  }
}

function createProvider(name) {
  if (name === "api-football") return createApiFootballProvider();
  if (name === "football-data") return createFootballDataProvider();
  if (name === "sportmonks") return createSportmonksProvider();
  if (name === "odds-api") return createOddsApiProvider();
  if (name === "mock") return createMockFootballProvider();
  throw new Error(`Unsupported data provider: ${name}`);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
    }
  });
}
