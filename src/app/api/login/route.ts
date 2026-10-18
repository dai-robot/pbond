import { actorFromId } from "@/domain/actor";
import { projectWorld } from "@/domain/project";
import { readWorld } from "@/server/db";
import { actorSwitchLocked, closeSession, currentActor, openSession, passwordMatches } from "@/server/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => undefined)) as { actorId?: string; password?: string } | undefined;
  const actor = body?.actorId ? actorFromId(body.actorId) : undefined;
  if (!actor || !body?.password || !passwordMatches(actor.id, body.password)) {
    return Response.json({ error: "人またはパスワードが違います" }, { status: 401 });
  }
  await openSession(actor);
  const { revision, world } = readWorld();
  return Response.json({ actor, revision, practice: !actorSwitchLocked(), world: projectWorld(world, actor) });
}

export async function DELETE() {
  await closeSession();
  return Response.json({ ok: true });
}
