import "dotenv/config";
import { createAggregator, type CreateAggregatorOptions } from "tickerhub";
import { openSqliteStores } from "tickerhub/sqlite";
import type Database from "better-sqlite3";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

export interface ServiceOptions {
  /** SQLite database path. Defaults to ~/.cache/tickerhub-cli/cache.db */
  dbPath?: string;
}

export interface WiredService {
  options: CreateAggregatorOptions;
  db: Database.Database;
  close: () => void;
}

function defaultDbPath(): string {
  const home = process.env.HOME ?? "/tmp";
  const dir = resolve(home, ".cache", "tickerhub-cli");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "cache.db");
}

export async function wireService(options: ServiceOptions = {}): Promise<WiredService> {
  const dbPath = options.dbPath ? resolve(options.dbPath) : defaultDbPath();
  const { cache, rateLimitStore, configStore, healthStore, db } = await openSqliteStores(dbPath);

  return {
    options: {
      cache,
      rateLimitStore,
      configStore,
      healthStore,
    },
    db,
    close: () => db.close(),
  };
}

export function createService(options: CreateAggregatorOptions) {
  return createAggregator(options);
}
