import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedData } from "../src/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "db.json");
await mkdir(path.dirname(dataPath), { recursive: true });
await writeFile(dataPath, JSON.stringify(createSeedData(), null, 2));
console.log(`Reset data at ${dataPath}`);
