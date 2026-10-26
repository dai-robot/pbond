import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { actorFromId, type Actor } from "@/domain/actor";
import { deleteSession, readSession, saveSession, seedUsers, userHash } from "@/server/db";

export const SESSION_COOKIE = "pbond_session";
const WEEK = 14 * 24 * 60 * 60 * 1000;

function practicePassword() {
  return process.env.PBOND_PASSWORD || "pbond";
}

let seededHash: string | undefined;
function ensureUsers() {
  if (!seededHash) {
    const salt = randomBytes(16).toString("hex");
    seededHash = `${salt}:${scryptSync(practicePassword(), salt, 32).toString("hex")}`;
  }
  seedUsers(seededHash);
}

export function passwordMatches(actorId: string, password: string) {
  ensureUsers();
  const stored = userHash(actorId);
  if (!stored) return false;
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(key, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export async function currentActor(): Promise<Actor | undefined> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const actorId = readSession(token);
  return actorId ? actorFromId(actorId) : undefined;
}

export async function openSession(actor: Actor) {
  const token = randomBytes(32).toString("hex");
  saveSession(token, actor.id, Date.now() + WEEK);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: WEEK / 1000 });
}

export async function closeSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export function actorSwitchLocked() {
  return process.env.PBOND_LOCK_ACTOR === "1";
}
