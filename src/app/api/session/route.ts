import { actorFromId } from "@/domain/actor";
import { projectWorld } from "@/domain/project";
import { readWorld } from "@/server/db";
import { actorSwitchLocked, currentActor, openSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { revision, world } = readWorld();
  return Response.json({ actor, revision, practice: !actorSwitchLocked(), world: projectWorld(world, actor) });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "ログインしてください" }, { status: 401 });
  if (actorSwitchLocked()) return Response.json({ error: "この環境では人を切り替えられません" }, { status: 403 });
  const body = (await request.json().catch(() => undefined)) as { actorId?: string } | undefined;
  const next = body?.actorId ? actorFromId(body.actorId) : undefined;
  if (!next) return Response.json({ error: "その人は登録されていません" }, { status: 400 });
  await openSession(next);
  const { revision, world } = readWorld();
  return Response.json({ actor: next, revision, practice: true, world: projectWorld(world, next) });
}
