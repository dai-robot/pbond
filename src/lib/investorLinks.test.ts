import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canLinkInvestors, linkOrdersForInvestor, resolveInvestorId, unlinkOrdersForInvestor } from "./investorLinks.ts";
import type { CanonicalOrder, Deal, Submission } from "./types.ts";

function sub(firm: Submission["receivedByFirm"], amountBn: number, at: string): Submission {
  return { id: `${firm}-${at}`, receivedByFirm: firm, amountBn, type: "MARKET", receivedAt: at, channel: "SYNDICATE_MANUAL" };
}
function order(id: string, investorId: string, name: string, firm: Submission["receivedByFirm"], amount: number): CanonicalOrder {
  const s = sub(firm, amount, "2026-09-23 18:00");
  return {
    id,
    trancheId: "t1",
    globalInvestorId: investorId,
    investorName: name,
    maskedLabel: "",
    amountBn: amount,
    type: "MARKET",
    initialType: "MARKET",
    firstReceivedAt: s.receivedAt,
    lastUpdatedAt: s.receivedAt,
    status: "ACTIVE",
    bdFirmId: firm,
    submissions: [s],
    history: [],
  };
}
const deal = { id: "d", adminLeadId: "alpha", coLeadIds: ["beta"], status: "BOOK OPEN" } as Deal;
const dealOf = () => deal;

describe("投資家マスターの統合", () => {
  it("resolves a linked investor to the survivor and refuses account X", () => {
    const links = [{ absorbedId: "GI-L", survivorId: "GI-B" }];
    assert.equal(resolveInvestorId("GI-L", links), "GI-B");
    assert.equal(resolveInvestorId("GI-B", links), "GI-B");
    assert.equal(canLinkInvestors("GI-B", "GI-L", []), true);
    assert.equal(canLinkInvestors("GI-B", "GI-ACC-alpha-001", []), false);
    assert.equal(canLinkInvestors("GI-B", "GI-L", links), false);
  });
  it("merges both tenors' orders into one and splits them back", () => {
    const other = { ...order("l2", "GI-L", "投資家L", "epsilon", 4), trancheId: "t2", submissions: [sub("epsilon", 4, "2026-09-23 18:05")] };
    const orders = [order("b", "GI-B", "投資家B", "alpha", 8), order("l", "GI-L", "投資家L", "epsilon", 5), other];
    const linked = linkOrdersForInvestor(orders, "GI-B", "投資家B", "GI-L", dealOf, "2026-09-23 19:00");
    const live = linked.filter((o) => o.status !== "CANCELLED");
    assert.equal(live.length, 2);
    assert.deepEqual(live.map((o) => o.globalInvestorId), ["GI-B", "GI-B"]);
    assert.equal(live.find((o) => o.trancheId === "t1")?.amountBn, 8);
    assert.equal(live.find((o) => o.trancheId === "t1")?.submissions.length, 2);
    const split = unlinkOrdersForInvestor(linked, "GI-L", "投資家L", dealOf, "2026-09-23 19:30");
    const again = split.filter((o) => o.status !== "CANCELLED");
    const t1 = again.filter((o) => o.trancheId === "t1");
    assert.equal(t1.length, 2);
    assert.equal(t1.find((o) => o.globalInvestorId === "GI-B")?.amountBn, 8);
    assert.equal(t1.find((o) => o.globalInvestorId === "GI-L")?.amountBn, 5);
    assert.equal(again.find((o) => o.trancheId === "t2")?.globalInvestorId, "GI-L");
  });
});
