"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { IssuerIdentityPolicy } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

interface ViewerState {
  role: ReturnType<typeof useWorkspace>["actor"]["role"];
  firmId: ReturnType<typeof useWorkspace>["actor"]["firmId"];
  setFirmId: (id: string) => void;
  salesPersonId: string;
  setSalesPersonId: (id: string) => void;
  deskPersonId: string;
  setDeskPersonId: (id: string) => void;
  investorId: string;
  setInvestorId: (id: string) => void;
  issuer: string;
  setIssuer: (name: string) => void;
  issuerIdentity: IssuerIdentityPolicy;
  setIssuerIdentity: (policy: IssuerIdentityPolicy) => void;
}

const Ctx = createContext<ViewerState | null>(null);

/** いまのログイン主体。ロールの切替はサーバのセッションを入れ替える。 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const { actor, switchActor } = useWorkspace();
  const [issuerIdentity, setIssuerIdentity] = useState<IssuerIdentityPolicy>("MASKED");
  const value = useMemo<ViewerState>(() => ({
    role: actor.role,
    firmId: actor.firmId,
    setFirmId: (id) => { void switchActor(actor.role === "AUDITOR" ? `aud:${id}` : `syn:${id}`); },
    salesPersonId: actor.personId,
    setSalesPersonId: (id) => { void switchActor(`sales:${id}`); },
    deskPersonId: actor.personId,
    setDeskPersonId: (id) => { void switchActor(`${actor.role === "DOCUMENTATION" ? "doc" : "uw"}:${id}`); },
    investorId: actor.investorId,
    setInvestorId: (id) => { void switchActor(`inv:${id}`); },
    issuer: actor.issuer,
    setIssuer: (name) => { void switchActor(`iss:${name}`); },
    issuerIdentity,
    setIssuerIdentity,
  }), [actor, issuerIdentity, switchActor]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewer() {
  const value = useContext(Ctx);
  if (!value) throw new Error("ViewerProvider missing");
  return value;
}
