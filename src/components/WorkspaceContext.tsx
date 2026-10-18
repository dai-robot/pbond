"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Actor } from "@/domain/actor";
import { applyCommand, type ApplyResult, type Command } from "@/domain/apply";
import { emptyWorld, type World } from "@/domain/world";
import { setDemoNow } from "@/lib/fmt";

interface SessionBody {
  actor: Actor;
  revision: number;
  practice: boolean;
  world: World;
}

interface WorkspaceValue {
  status: "loading" | "anon" | "ready";
  actor: Actor | null;
  practice: boolean;
  world: World;
  commit: (command: Command) => ApplyResult;
  commitAwaited: (command: Command) => Promise<ApplyResult>;
  switchActor: (actorId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<WorkspaceValue | null>(null);

async function readError(res: Response) {
  const body = (await res.json().catch(() => undefined)) as { error?: string; world?: World; value?: unknown; revision?: number } | undefined;
  return body;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [world, setWorld] = useState<World>(emptyWorld());
  const [practice, setPractice] = useState(true);
  const [ready, setReady] = useState(false);
  const worldRef = useRef(world);
  const actorRef = useRef(actor);
  const queue = useRef<Command[]>([]);
  const pumping = useRef(false);
  worldRef.current = world;
  actorRef.current = actor;

  const adopt = useCallback((body: SessionBody) => {
    setDemoNow(body.world.now);
    setActor(body.actor);
    setWorld(body.world);
    setPractice(body.practice);
    worldRef.current = body.world;
    actorRef.current = body.actor;
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/session");
    if (!res.ok) {
      setActor(null);
      setReady(true);
      return;
    }
    adopt((await res.json()) as SessionBody);
    setReady(true);
  }, [adopt]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (queue.current.length > 0) {
        const command = queue.current[0];
        const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
        const body = await readError(res);
        queue.current.shift();
        if (!res.ok || !body?.world) {
          queue.current = [];
          await refresh();
          break;
        }
        if (queue.current.length === 0) {
          setDemoNow(body.world.now);
          worldRef.current = body.world;
          setWorld(body.world);
        }
      }
    } finally {
      pumping.current = false;
    }
  }, [refresh]);

  const commit = useCallback((command: Command): ApplyResult => {
    const current = actorRef.current;
    if (!current) return { ok: false, error: "ログインしてください" };
    const applied = applyCommand(worldRef.current, current, command);
    if (!applied.ok) return applied;
    worldRef.current = applied.world;
    setDemoNow(applied.world.now);
    setWorld(applied.world);
    queue.current.push(command);
    void pump();
    return applied;
  }, [pump]);

  const commitAwaited = useCallback(async (command: Command): Promise<ApplyResult> => {
    while (queue.current.length > 0 || pumping.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
    const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
    const body = await readError(res);
    if (!res.ok || !body?.world) return { ok: false, error: body?.error ?? "保存できませんでした" };
    setDemoNow(body.world.now);
    worldRef.current = body.world;
    setWorld(body.world);
    return { ok: true, world: body.world, value: body.value };
  }, []);

  const switchActor = useCallback(async (actorId: string) => {
    queue.current = [];
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorId }) });
    if (!res.ok) return;
    adopt((await res.json()) as SessionBody);
  }, [adopt]);

  const logout = useCallback(async () => {
    await fetch("/api/login", { method: "DELETE" });
    setActor(null);
  }, []);

  const value: WorkspaceValue = {
    status: !ready ? "loading" : actor ? "ready" : "anon",
    actor,
    practice,
    world,
    commit,
    commitAwaited,
    switchActor,
    logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const value = useContext(Ctx);
  if (!value || value.status !== "ready" || !value.actor) throw new Error("ログインが必要です");
  return { ...value, actor: value.actor, ready: true };
}

export function useWorkspaceMaybe() {
  return useContext(Ctx);
}
