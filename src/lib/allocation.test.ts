import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approveCoLead, approveIssuer, allocationFitsIssue, allocationPhase, allocationWithinOrders, coLeadVisibleRows, confirmInvestors, isShownToCoLeads, issuerVisibleRows, publishedAllocation, reopenDraft, saveDraft, showToCoLeads, showToIssuer } from "./allocation.ts";

const deal = { coLeadIds: ["beta", "gamma"] as const };
const at = "2026-09-23 19:00";
const rows = [
  { globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 0.5 },
  { globalInvestorId: "GI-0002", finalOrderBn: 2, allocationBn: 0 },
];
const issue = 10;

function shownDraft() {
  return showToCoLeads(saveDraft(undefined, "t1", rows, issue, at), issue, at);
}

describe("アロケーションの段階", () => {
  it("保存しただけでは共同主幹事に出ず、発行額を超える配分は保存できない", () => {
    assert.equal(saveDraft(undefined, "t1", [], issue, at), undefined);
    assert.equal(saveDraft(undefined, "t1", [{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 0.15 }], issue, at), undefined);
    assert.equal(allocationFitsIssue([{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 11 }], 10), false);
    assert.equal(saveDraft(undefined, "t1", [{ globalInvestorId: "GI-0001", finalOrderBn: 12, allocationBn: 11 }], 10, at), undefined);
    assert.equal(allocationWithinOrders([{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 1.1 }]), false);
    assert.equal(saveDraft(undefined, "t1", [{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 1.1 }], issue, at), undefined);
    assert.equal(saveDraft(undefined, "t1", [{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 0.5, marketOrder: false }], issue, at), undefined);
    assert.equal(allocationWithinOrders([{ globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 1 }]), true);
    const saved = saveDraft(undefined, "t1", rows, issue, at);
    assert.ok(saved);
    assert.equal(isShownToCoLeads(saved), false);
    assert.equal(allocationPhase(deal, saved), "SAVED");
    assert.equal(approveCoLead(deal, saved, "beta", at, "SELF"), undefined);
    assert.equal(showToIssuer(deal, saved, at), undefined);
    assert.equal(publishedAllocation(saved, "GI-0001"), undefined);
    assert.equal(issuerVisibleRows(saved).length, 0);
    const one = confirmInvestors(saved, ["GI-0001"], at);
    assert.equal(one?.rows.find((r) => r.globalInvestorId === "GI-0001")?.confirmedAt, at);
    assert.equal(publishedAllocation(one, "GI-0001")?.allocationBn, 0.5);
    assert.equal(publishedAllocation(one, "GI-0002"), undefined);
    assert.deepEqual(coLeadVisibleRows(one).map((r) => r.globalInvestorId), ["GI-0001"]);
    assert.deepEqual(issuerVisibleRows(one).map((r) => r.globalInvestorId), ["GI-0001"]);
    assert.equal(isShownToCoLeads(one), false);
    const bothConfirmed = confirmInvestors(one, ["GI-0001", "GI-0002"], at);
    assert.equal(publishedAllocation(bothConfirmed, "GI-0002")?.allocationBn, 0);
    assert.equal(confirmInvestors(bothConfirmed, ["GI-0002"], at), undefined);
    const opened = showToCoLeads(saved, issue, at);
    assert.equal(allocationPhase(deal, opened), "CO_LEAD");
    assert.deepEqual(coLeadVisibleRows(opened).map((r) => r.globalInvestorId), ["GI-0001", "GI-0002"]);
    assert.equal(publishedAllocation(opened, "GI-0001"), undefined);
  });

  it("共同主幹事が全員OKするまで発行体に見せない", () => {
    const draft = shownDraft()!;
    const beta = approveCoLead(deal, draft, "beta", at, "SELF");
    assert.ok(beta);
    assert.equal(showToIssuer(deal, beta, at), undefined);
    assert.equal(approveCoLead(deal, beta, "beta", at, "ADMIN_FORCE"), undefined);
    assert.equal(approveCoLead(deal, beta, "alpha", at, "SELF"), undefined);
    const both = approveCoLead(deal, beta, "gamma", at, "ADMIN_FORCE");
    assert.equal(both?.coLeadApprovals[1].by, "ADMIN_FORCE");
    assert.equal(allocationPhase(deal, both), "AWAIT_ISSUER_RELEASE");
    const shown = showToIssuer(deal, both, at);
    assert.equal(allocationPhase(deal, shown), "ISSUER");
    assert.equal(issuerVisibleRows(shown).length, 2);
    assert.equal(publishedAllocation(shown, "GI-0001"), undefined);
  });

  it("確定は保存のあとで、発行体の全体確認は共同主幹事のあと", () => {
    const saved = saveDraft(undefined, "t1", rows, issue, at)!;
    assert.equal(confirmInvestors(undefined, ["GI-0001"], at), undefined);
    assert.equal(confirmInvestors(saved, ["GI-0099"], at), undefined);
    let current = confirmInvestors(saved, ["GI-0001"], at)!;
    assert.equal(approveIssuer(current, at, "ADMIN_FORCE"), undefined);
    current = showToCoLeads(current, issue, at)!;
    current = approveCoLead(deal, current, "beta", at, "ADMIN_FORCE")!;
    current = approveCoLead(deal, current, "gamma", at, "ADMIN_FORCE")!;
    current = showToIssuer(deal, current, at)!;
    assert.equal(issuerVisibleRows(current).length, 2);
    current = approveIssuer(current, at, "ADMIN_FORCE")!;
    assert.equal(allocationPhase(deal, current), "ISSUER_DONE");
    assert.equal(publishedAllocation(current, "GI-0002"), undefined);
    const again = reopenDraft(current);
    assert.equal(again?.rows.find((r) => r.globalInvestorId === "GI-0001")?.confirmedAt, at);
    assert.equal(again?.issuerShownAt, undefined);
  });

  it("共同主幹事がいない案件は、登録の次に発行体へ見せられる", () => {
    const solo = { coLeadIds: [] as const };
    const draft = shownDraft()!;
    assert.equal(allocationPhase(solo, draft), "AWAIT_ISSUER_RELEASE");
    assert.ok(showToIssuer(solo, draft, at));
  });

  it("直すと確認と公開は初めからになる", () => {
    let current = shownDraft()!;
    current = approveCoLead(deal, current, "beta", at, "SELF")!;
    current = showToIssuer(deal, approveCoLead(deal, current, "gamma", at, "SELF")!, at)!;
    const again = reopenDraft(current);
    assert.equal(isShownToCoLeads(again), false);
    assert.equal(again?.coLeadApprovals.length, 0);
    assert.equal(again?.issuerShownAt, undefined);
    assert.equal(allocationPhase(deal, again), "SAVED");
    assert.equal(saveDraft(current, "t1", rows, issue, at), undefined);
    assert.ok(saveDraft(again, "t1", rows, issue, at));
  });

  it("確定した行は、その後のオーダーが減っても他の投資家の保存を止めない", () => {
    const saved = saveDraft(undefined, "t1", rows, issue, at)!;
    const confirmed = confirmInvestors(saved, ["GI-0001"], at)!;
    const shrunk = [
      { globalInvestorId: "GI-0001", finalOrderBn: 0.1, allocationBn: 0.5, marketOrder: true as const },
      { globalInvestorId: "GI-0002", finalOrderBn: 2, allocationBn: 0.2, marketOrder: true as const },
    ];
    const next = saveDraft(confirmed, "t1", shrunk, issue, at);
    assert.ok(next);
    assert.equal(next?.rows.find((r) => r.globalInvestorId === "GI-0001")?.allocationBn, 0.5);
    assert.equal(next?.rows.find((r) => r.globalInvestorId === "GI-0001")?.confirmedAt, at);
    assert.equal(next?.rows.find((r) => r.globalInvestorId === "GI-0002")?.allocationBn, 0.2);
    assert.equal(saveDraft(confirmed, "t1", [{ globalInvestorId: "GI-0001", finalOrderBn: 0.1, allocationBn: 0.5 }, { globalInvestorId: "GI-0002", finalOrderBn: 1, allocationBn: 1.5 }], issue, at), undefined);
  });
});
