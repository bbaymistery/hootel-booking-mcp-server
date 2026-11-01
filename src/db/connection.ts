import Database from 'better-sqlite3';
import { config } from '../config/index.js';

let defaultDb: Database.Database | null = null;

export function createDbConnection(dbPath: string = config.dbPath): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${config.busyTimeoutMs}`);
  return db;
}

export function getDb(): Database.Database {
  if (!defaultDb) {
    defaultDb = createDbConnection();
  }
  return defaultDb;
}

export function closeDb(): void {
  if (defaultDb && defaultDb.open) {
    defaultDb.close();
    defaultDb = null;
  }
}
