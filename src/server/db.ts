import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { allActors } from "@/domain/actor";
import { emptyWorld, type World } from "@/domain/world";
import { settleWorld } from "@/domain/project";

const dir = path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(dir, "pbond.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    command TEXT NOT NULL,
    ok INTEGER NOT NULL,
    detail TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    actor_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
  );
`);

export function readWorld(): { revision: number; world: World } {
  const row = db.prepare("SELECT revision, body FROM workspace WHERE id = 1").get() as { revision: number; body: string } | undefined;
  if (!row) {
    const world = emptyWorld();
    db.prepare("INSERT INTO workspace (id, revision, body) VALUES (1, 0, ?)").run(JSON.stringify(world));
    return { revision: 0, world };
  }
  const world = settleWorld({ ...emptyWorld(), ...(JSON.parse(row.body) as World) });
  return { revision: row.revision, world };
}

export function writeWorld(revision: number, world: World, actorId: string, command: string, detail: string) {
  const next = revision + 1;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE workspace SET revision = ?, body = ? WHERE id = 1 AND revision = ?").run(next, JSON.stringify(world), revision);
    const changed = db.prepare("SELECT changes() AS n").get() as { n: number };
    if (changed.n !== 1) {
      db.exec("ROLLBACK");
      return undefined;
    }
    db.prepare("INSERT INTO audit (at, actor_id, command, ok, detail) VALUES (?, ?, ?, 1, ?)").run(world.now, actorId, command, detail.slice(0, 500));
    db.exec("COMMIT");
    return next;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function auditFailure(actorId: string, command: string, detail: string) {
  db.prepare("INSERT INTO audit (at, actor_id, command, ok, detail) VALUES (?, ?, ?, 0, ?)").run(new Date().toISOString(), actorId, command, detail.slice(0, 500));
}

export function saveSession(token: string, actorId: string, expiresAt: number) {
  db.prepare("INSERT INTO sessions (token, actor_id, expires_at) VALUES (?, ?, ?)").run(token, actorId, expiresAt);
}

export function readSession(token: string) {
  const row = db.prepare("SELECT actor_id, expires_at FROM sessions WHERE token = ?").get(token) as { actor_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return undefined;
  return row.actor_id;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function userHash(actorId: string) {
  const row = db.prepare("SELECT password_hash FROM users WHERE actor_id = ?").get(actorId) as { password_hash: string } | undefined;
  return row?.password_hash;
}

export function seedUsers(passwordHash: string) {
  const insert = db.prepare("INSERT INTO users (actor_id, password_hash) VALUES (?, ?) ON CONFLICT(actor_id) DO NOTHING");
  for (const actor of allActors()) insert.run(actor.id, passwordHash);
}

export interface AuditRow {
  id: number;
  at: string;
  actorId: string;
  command: string;
  ok: boolean;
  detail: string;
}

export function readAudit(limit = 80): AuditRow[] {
  const rows = db.prepare("SELECT id, at, actor_id, command, ok, detail FROM audit ORDER BY id DESC LIMIT ?").all(limit) as {
    id: number;
    at: string;
    actor_id: string;
    command: string;
    ok: number;
    detail: string;
  }[];
  return rows.map((row) => ({ id: row.id, at: row.at, actorId: row.actor_id, command: row.command, ok: row.ok === 1, detail: row.detail }));
}

export { db };
