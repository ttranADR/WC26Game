import { createSeedData } from "./seed.js";

export function createNeonStore(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is required for Neon storage.");

  let poolPromise;

  async function getPool() {
    if (!poolPromise) {
      poolPromise = import("pg").then(({ Pool }) => new Pool({
        connectionString,
        max: 4
      }));
    }
    return poolPromise;
  }

  async function ensure(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pitchpick_state (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      `
        INSERT INTO pitchpick_state (id, data, updated_at)
        VALUES ('default', $1::jsonb, now())
        ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify(createSeedData())]
    );
  }

  async function withClient(fn) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await ensure(client);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async function read() {
    return withClient(async (client) => {
      const result = await client.query("SELECT data FROM pitchpick_state WHERE id = 'default'");
      return result.rows[0].data;
    });
  }

  async function write(data) {
    return withClient(async (client) => {
      data.updatedAt = new Date().toISOString();
      await client.query(
        "UPDATE pitchpick_state SET data = $1::jsonb, updated_at = now() WHERE id = 'default'",
        [JSON.stringify(data)]
      );
      return data;
    });
  }

  async function update(mutator) {
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await client.query("SELECT data FROM pitchpick_state WHERE id = 'default' FOR UPDATE");
        const data = result.rows[0].data;
        const mutationResult = await mutator(data);
        data.updatedAt = new Date().toISOString();
        await client.query(
          "UPDATE pitchpick_state SET data = $1::jsonb, updated_at = now() WHERE id = 'default'",
          [JSON.stringify(data)]
        );
        await client.query("COMMIT");
        return mutationResult ?? data;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  return { read, write, update, filePath: "neon:pitchpick_state/default" };
}
