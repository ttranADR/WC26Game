const appUrl = process.env.APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!appUrl) throw new Error("APP_URL is required.");
if (!cronSecret) throw new Error("CRON_SECRET is required.");

const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/jobs/sync-live-data`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${cronSecret}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({})
});

const body = await response.json();
if (!response.ok) {
  throw new Error(body.error || "Sync job failed.");
}

console.log(body.message);
console.log(JSON.stringify(body.results, null, 2));
