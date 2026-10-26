import { FIRMS } from "../data/demoData.ts";
import { ALL_ISSUERS, INVESTOR_MASTER, SYNDICATION_FIRM_IDS, issuerByName } from "../data/demoRoles.ts";
import { SALES_PEOPLE, salesPersonById } from "../lib/coverage.ts";
import { DESK_PEOPLE, deskPersonById } from "../lib/desk.ts";
import type { Role } from "../lib/roles.ts";
import type { FirmId } from "../lib/types.ts";

/** ログインしている人。画面のロール切替は、この人をサーバセッションで入れ替える。 */
export interface Actor {
  id: string;
  role: Role;
  firmId: FirmId;
  personId: string;
  investorId: string;
  issuer: string;
  label: string;
}

export function actorFromId(id: string): Actor | undefined {
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  if (kind === "syn" && SYNDICATION_FIRM_IDS.includes(key as FirmId)) {
    const firmId = key as FirmId;
    return { id, role: "SYNDICATION", firmId, personId: firmId, investorId: "", issuer: "", label: FIRMS[firmId].name };
  }
  if (kind === "sales") {
    const person = salesPersonById(key);
    if (!person) return undefined;
    return { id, role: "SALES", firmId: person.firmId, personId: person.id, investorId: "", issuer: "", label: `${FIRMS[person.firmId].short} ${person.name}` };
  }
  if (kind === "uw" || kind === "doc") {
    const person = deskPersonById(key);
    const desk = kind === "uw" ? "UNDERWRITING" : "DOCUMENTATION";
    if (!person || person.desk !== desk) return undefined;
    return { id, role: desk, firmId: person.firmId, personId: person.id, investorId: "", issuer: "", label: `${FIRMS[person.firmId].short} ${person.name}` };
  }
  if (kind === "aud" && SYNDICATION_FIRM_IDS.includes(key as FirmId)) {
    const firmId = key as FirmId;
    return { id, role: "AUDITOR", firmId, personId: firmId, investorId: "", issuer: "", label: `${FIRMS[firmId].name} 監査人` };
  }
  if (kind === "inv") {
    const investor = INVESTOR_MASTER.find((p) => p.id === key);
    if (!investor) return undefined;
    return { id, role: "INVESTOR", firmId: "alpha", personId: investor.id, investorId: investor.id, issuer: "", label: investor.name };
  }
  if (kind === "iss") {
    const issuer = issuerByName(key);
    if (!issuer && !key) return undefined;
    return { id, role: "ISSUER", firmId: "alpha", personId: key, investorId: "", issuer: key, label: issuer?.short ?? key };
  }
  return undefined;
}

export function allActors(): Actor[] {
  const ids = [
    ...SYNDICATION_FIRM_IDS.map((f) => `syn:${f}`),
    ...SALES_PEOPLE.map((p) => `sales:${p.id}`),
    ...DESK_PEOPLE.filter((p) => p.desk === "UNDERWRITING").map((p) => `uw:${p.id}`),
    ...DESK_PEOPLE.filter((p) => p.desk === "DOCUMENTATION").map((p) => `doc:${p.id}`),
    ...SYNDICATION_FIRM_IDS.map((f) => `aud:${f}`),
    ...INVESTOR_MASTER.map((p) => `inv:${p.id}`),
    ...ALL_ISSUERS.map((p) => `iss:${p.issuer}`),
  ];
  return ids.map((id) => actorFromId(id)).filter((a): a is Actor => !!a);
}
