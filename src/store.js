import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedData } from "./seed.js";

export function createStore(filePath) {
  async function ensure() {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(createSeedData(), null, 2));
    }
  }

  async function read() {
    await ensure();
    return JSON.parse(await readFile(filePath, "utf8"));
  }

  async function write(data) {
    await mkdir(path.dirname(filePath), { recursive: true });
    data.updatedAt = new Date().toISOString();
    await writeFile(filePath, JSON.stringify(data, null, 2));
    return data;
  }

  async function update(mutator) {
    const data = await read();
    const result = await mutator(data);
    await write(data);
    return result ?? data;
  }

  return { read, write, update, filePath };
}
