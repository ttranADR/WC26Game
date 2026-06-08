const MOCK_PROVIDER = "mock";

export function normalizeProviderName(value) {
  return String(value || MOCK_PROVIDER).trim().toLowerCase();
}

export function isLiveProviderName(value) {
  return normalizeProviderName(value) !== MOCK_PROVIDER;
}

export function getStorageMode(databaseUrl) {
  return hasDatabaseUrl(databaseUrl) ? "neon" : "local-json";
}

export function assertStorageConfiguration({ databaseUrl, requireNeonStorage, providers }) {
  const requiresNeon = parseBoolean(requireNeonStorage) || providers.some(isLiveProviderName);
  if (!requiresNeon || hasDatabaseUrl(databaseUrl)) return;

  throw new Error(
    "DATABASE_URL is required when using live data providers or REQUIRE_NEON_STORAGE=true. " +
    "External API data must be synced into Neon before the app loads it."
  );
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function hasDatabaseUrl(value) {
  return Boolean(String(value || "").trim());
}
