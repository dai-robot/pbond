import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CanonicalOrder, Deal, Submission } from "./types.ts";
import { addFirmInvestor, addMapping, applyPermanentMerge, canonicalMasterId, createDealGroup, dissolveDealGroup, editMaster, firmOwnsCode, foldPermanentMasters, foldTemporaryGroups, linkableMasters, seedSnapshot } from "./investorMasterModel.ts";

function sub(firm: Submission["receivedByFirm"], amountBn: number): Submission {
  return { id: `${firm}-s`, receivedByFirm: firm, amountBn, type: "MARKET", receivedAt: "2026-09-23 18:00", channel: "SYNDICATE_MANUAL" };
}
function order(id: string, investorId: string, firm: Submission["receivedByFirm"], amount: number, trancheId = "t1"): CanonicalOrder {
  const s = sub(firm, amount);
  return {
    id, trancheId, globalInvestorId: investorId, investorName: investorId, maskedLabel: "", amountBn: amount, type: "MARKET", initialType: "MARKET",
    firstReceivedAt: s.receivedAt, lastUpdatedAt: s.receivedAt, status: "ACTIVE", bdFirmId: firm, submissions: [s], history: [],
    rawSourceInvestorName: `${firm}-raw`, resolvedMasterInvestorId: investorId,
  };
}
const deal = { id: "d1", adminLeadId: "alpha", coLeadIds: ["beta"], status: "BOOK OPEN" } as Deal;
const otherDeal = { ...deal, id: "d2" } as Deal;

describe("投資家マスターの分離", () => {
  it("lets each firm keep its own code, including the same number", () => {
    const snap = seedSnapshot();
    const alpha = snap.sources.find((s) => s.sourceFirm === "alpha" && s.sourceInvestorCode === "1");
    const gamma = snap.sources.find((s) => s.sourceFirm === "gamma" && s.sourceInvestorCode === "1");
    assert.equal(snap.mappings.find((m) => m.sourceInvestorId === alpha?.sourceInvestorId)?.masterInvestorId, "GI-0001");
    assert.equal(snap.mappings.find((m) => m.sourceInvestorId === gamma?.sourceInvestorId)?.masterInvestorId, "GI-0007");
    assert.equal(snap.sources.some((s) => s.sourceInvestorCode === "1" && snap.mappings.some((m) => m.sourceInvestorId === s.sourceInvestorId && m.masterInvestorId === "GI-0034")), false);
    assert.equal(firmOwnsCode(snap, "alpha", "1"), true);
    assert.equal(addMapping(snap, "GI-0002", { firmId: "alpha", code: "1", name: "別の人" }, "alpha", "2026-09-23 19:00"), undefined);
    const edited = editMaster(snap, "GI-0001", { officialName: "アルファ生命保険" }, "beta", "2026-09-23 19:00", "社内名称に合わせた");
    assert.equal(edited?.fieldHistory[0].changedBy, "beta");
    assert.equal(edited?.masters.find((m) => m.masterInvestorId === "GI-0001")?.officialName, "アルファ生命保険");
  });

  it("links a firm investor to an existing all-firms master", () => {
    const snap = seedSnapshot();
    const before = snap.masters.length;
    const linked = addFirmInvestor(snap, { firmId: "alpha", name: "社内のエコー", investorType: "地銀", country: "日本", sourceCode: "9", linkMasterId: "GI-0011" }, "alpha", "2026-09-23 19:00");
    assert.ok(linked);
    assert.equal(linked.snap.masters.length, before);
    assert.equal(linked.master.masterInvestorId, "GI-0011");
    assert.equal(linked.master.displayName, snap.masters.find((m) => m.masterInvestorId === "GI-0011")?.displayName);
    const map = linked.snap.mappings.find((m) => m.sourceInvestorId === linked.source.sourceInvestorId);
    assert.equal(map?.masterInvestorId, "GI-0011");
    assert.equal(linked.source.sourceInvestorName, "社内のエコー");
  });

  it("does not offer the firm's own investors as the existing person", () => {
    const snap = seedSnapshot();
    const choices = linkableMasters(snap, "alpha").map((m) => m.masterInvestorId);
    assert.equal(choices.includes("GI-0001"), false);
    assert.equal(choices.includes("GI-0002"), false);
    assert.equal(choices.includes("GI-0007"), true);
    assert.equal(addFirmInvestor(snap, { firmId: "alpha", name: "もう一人のアルファ", investorType: "生保", country: "日本", linkMasterId: "GI-0001" }, "alpha", "2026-09-23 19:00"), undefined);
  });

  it("creates a provisional all-firms investor only when none is chosen", () => {
    const snap = seedSnapshot();
    const before = snap.masters.length;
    const created = addFirmInvestor(snap, { firmId: "alpha", name: "新しい地方銀行", investorType: "地銀", country: "日本" }, "alpha", "2026-09-23 19:00");
    assert.ok(created);
    assert.equal(created.snap.masters.length, before + 1);
    assert.equal(created.master.status, "PROVISIONAL");
    assert.equal(created.snap.mappings.find((m) => m.sourceInvestorId === created.source.sourceInvestorId)?.masterInvestorId, created.master.masterInvestorId);
  });

  it("keeps a deal group off the global master and off other deals", () => {
    const snap = seedSnapshot();
    const grouped = createDealGroup(snap, "d1", ["GI-0001", "GI-0002"], "GI-0001", "SYNDICATION:alpha", "2026-09-23 19:00");
    assert.ok(grouped);
    assert.equal(grouped.masters.find((m) => m.masterInvestorId === "GI-0002")?.status, "ACTIVE");
    assert.equal(canonicalMasterId("GI-0002", grouped.masters), "GI-0002");
    const orders = [order("a", "GI-0001", "alpha", 5), order("b", "GI-0002", "beta", 3)];
    const here = foldTemporaryGroups(grouped, deal, orders, "2026-09-23 19:00");
    const liveHere = here.orders.filter((o) => o.status !== "CANCELLED");
    assert.equal(liveHere.length, 1);
    assert.equal(liveHere[0].amountBn, 5);
    assert.equal(foldPermanentMasters(grouped, deal, orders, "2026-09-23 19:00").filter((o) => o.status !== "CANCELLED").length, 2);
    assert.equal(orders[1].globalInvestorId, "GI-0002");
    assert.equal(orders[1].rawSourceInvestorName, "beta-raw");
    const there = foldTemporaryGroups(grouped, otherDeal, orders, "2026-09-23 19:00");
    assert.equal(there.orders.filter((o) => o.status !== "CANCELLED").length, 2);
    const back = foldTemporaryGroups(dissolveDealGroup(grouped, grouped.groups[0].groupId), deal, orders, "2026-09-23 19:10");
    assert.equal(back.orders.filter((o) => o.status !== "CANCELLED").length, 2);
  });

  it("permanently merges masters without rewriting stored orders", () => {
    const snap = seedSnapshot();
    const before = snap.mappings.filter((m) => m.masterInvestorId === "GI-0002" && m.mappingStatus === "ACTIVE");
    const merged = applyPermanentMerge(snap, "GI-0002", "GI-0001", "同一投資家", "SYNDICATION:alpha", "2026-09-23 20:00");
    assert.ok(merged);
    const absorbed = merged.masters.find((m) => m.masterInvestorId === "GI-0002");
    assert.equal(absorbed?.status, "MERGED");
    assert.equal(absorbed?.mergedIntoMasterInvestorId, "GI-0001");
    assert.equal(canonicalMasterId("GI-0002", merged.masters), "GI-0001");
    assert.ok(merged.masters.some((m) => m.masterInvestorId === "GI-0002"));
    assert.equal(merged.merges[0].reason, "同一投資家");
    assert.equal(merged.groups.length, 0);
    assert.equal(merged.merges[0].mappingSnapshot.length, before.length);
    assert.ok(merged.mappings.some((m) => m.mappingStatus === "REASSIGNED" && m.masterInvestorId === "GI-0002"));
    assert.ok(merged.mappings.some((m) => m.mappingStatus === "ACTIVE" && m.masterInvestorId === "GI-0001" && before.some((b) => b.sourceInvestorId === m.sourceInvestorId)));
    const orders = [order("a", "GI-0001", "alpha", 5), order("b", "GI-0002", "beta", 3)];
    const shown = foldPermanentMasters(merged, otherDeal, orders, "2026-09-23 20:00");
    assert.equal(shown.filter((o) => o.status !== "CANCELLED").length, 1);
    const notGrouped = foldTemporaryGroups(merged, otherDeal, orders, "2026-09-23 20:00");
    assert.equal(notGrouped.orders.filter((o) => o.status !== "CANCELLED").length, 2);
    assert.equal(orders[1].resolvedMasterInvestorId, "GI-0002");
  });
});
