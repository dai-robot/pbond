import { applyCommand, type Command } from "@/domain/apply";
import { projectWorld } from "@/domain/project";
import { auditFailure, readWorld, writeWorld } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const body = (await request.json().catch(() => undefined)) as { command?: Command } | undefined;
  if (!body?.command || typeof body.command.type !== "string") return Response.json({ error: "操作がありません" }, { status: 400 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { revision, world } = readWorld();
    const applied = applyCommand(world, actor, body.command);
    if (!applied.ok) {
      auditFailure(actor.id, body.command.type, applied.error);
      return Response.json({ error: applied.error, revision, world: projectWorld(world, actor) }, { status: 422 });
    }
    const next = writeWorld(revision, applied.world, actor.id, body.command.type, "ok");
    if (next === undefined) continue;
    return Response.json({ revision: next, value: applied.value, world: projectWorld(applied.world, actor) });
  }
  return Response.json({ error: "同時の更新が重なりました。もう一度操作してください" }, { status: 409 });
}
