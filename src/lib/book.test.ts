import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEALS, ORDERS, ROOMS, TRANCHES } from "../data/demoData.ts";
import { accountXInvestorName, accountXOrderBlocked, currentGuidance, firmVisibleTrail, isAccountXInvestor, latestSubmissionByFirm, mergeCanonicalOrders, nextIdentityMode, placedWithForIdentity, resolveCanonicalAuthority, resolvedCanonical, shouldReviseMarketing, spreadDemand, submissionDiscrepancy, submissionTrail, summarizeBook } from "./deal.ts";
import { DEMO_NOW, fmtBn, fmtRemaining, fmtTime } from "./fmt.ts";
import type { CanonicalOrder, Deal, Submission, Tranche } from "./types.ts";

describe("seed data is empty so the app starts blank", () => {
  it("has no preset deals, tranches, orders, or rooms", () => {
    assert.equal(DEALS.length, 0);
    assert.equal(TRANCHES.length, 0);
    assert.equal(ORDERS.length, 0);
    assert.equal(ROOMS.length, 0);
  });
});

function sub(firm: Submission["receivedByFirm"], amountBn: number, at: string, limitBp?: number): Submission {
  return { id: `${firm}-${at}`, receivedByFirm: firm, amountBn, type: limitBp === undefined ? "MARKET" : "LIMIT", limitBp, receivedAt: at, channel: "SALES_MANUAL" };
}

function order(partial: Partial<CanonicalOrder> & Pick<CanonicalOrder, "id" | "submissions">): CanonicalOrder {
  return {
    trancheId: "t1",
    globalInvestorId: "GI-1",
    investorName: "投資家A",
    maskedLabel: "アカウントX",
    amountBn: partial.submissions[0].amountBn,
    type: partial.submissions[0].type,
    limitBp: partial.submissions[0].limitBp,
    initialType: "MARKET",
    firstReceivedAt: partial.submissions[0].receivedAt,
    lastUpdatedAt: partial.submissions[0].receivedAt,
    status: "ACTIVE",
    bdFirmId: "alpha",
    history: [],
    ...partial,
  };
}

const deal: Deal = {
  id: "d1",
  issuer: "試作発行体",
  issuerShort: "試作",
  status: "BOOK OPEN",
  adminLeadId: "alpha",
  coLeadIds: ["beta", "gamma"],
  defaultBdId: "alpha",
  createdAt: DEMO_NOW,
  publicAt: DEMO_NOW,
  orderCutoffAt: "2026-09-30 11:00",
  pricingDate: "2026-09-30",
  paymentDate: "2026-10-07",
  lastUpdateAt: DEMO_NOW,
  trancheIds: ["t1"],
  disclosurePolicy: "",
};

const tranche: Tranche = {
  id: "t1",
  dealId: "d1",
  tenorLabel: "5年",
  amountBn: 300,
  rating: "未設定",
  referenceJgb: { name: "新発10年国債", yieldPct: 1, asOf: "2026-09-23" },
  guidances: [{ id: "g1", day: 1, label: "対国債 +10〜20bp", lowBp: 10, highBp: 20, enteredAt: DEMO_NOW, effectiveAt: DEMO_NOW }],
  interestFrequency: "年2回",
  interestPaymentDates: "未定",
  denomination: "1億円",
  redemptionDate: "2026-10-07",
  termSheet: { status: "NOT_PUBLISHED" },
  historical: [],
  comparator: { instrumentLabel: "—", asOf: "—", points: [] },
};

describe("億円表示", () => {
  it("formats whole numbers as 億円", () => {
    assert.equal(fmtBn(300), "300億円");
    assert.equal(fmtBn(1.5), "1.5億円");
    assert.equal(fmtBn(null), "—");
  });
  it("today hides the date", () => {
    assert.equal(fmtTime("2026-09-23 09:12"), "09:12");
    assert.equal(fmtRemaining("2026-09-23 20:00"), "あと1時間");
  });
});

describe("アカウントXの提出先", () => {
  it("keeps a single firm and uses that firm as the placement", () => {
    assert.deepEqual(placedWithForIdentity("ACCOUNT_X", ["alpha", "beta", "gamma"], "beta"), ["beta"]);
    assert.deepEqual(placedWithForIdentity("ACCOUNT_X", ["alpha", "beta"], "gamma"), ["alpha"]);
    assert.deepEqual(placedWithForIdentity("DISCLOSED", ["alpha", "beta"], "alpha"), ["alpha", "beta"]);
  });
  it("does not let a disclosed order return to account X", () => {
    assert.equal(nextIdentityMode("DISCLOSED", "ACCOUNT_X"), "DISCLOSED");
    assert.equal(nextIdentityMode("DISCLOSED", "DISCLOSED"), "DISCLOSED");
    assert.equal(nextIdentityMode("ACCOUNT_X", "DISCLOSED"), "DISCLOSED");
    assert.equal(nextIdentityMode("ACCOUNT_X", "ACCOUNT_X"), "ACCOUNT_X");
    assert.equal(accountXOrderBlocked("DISCLOSED", "ACCOUNT_X"), true);
    assert.equal(accountXOrderBlocked("DISCLOSED", "DISCLOSED"), false);
    assert.equal(accountXOrderBlocked("ACCOUNT_X", "ACCOUNT_X"), false);
    assert.equal(isAccountXInvestor("GI-ACC-alpha-001"), true);
    assert.equal(isAccountXInvestor("GI-0001"), false);
    assert.equal(accountXInvestorName("alpha", 2), "アカウントX（アルファ2）");
  });
});

describe("相違時の正", () => {
  it("uses the admin lead submission for the total and keeps the alert", () => {
    const o = order({
      id: "o1",
      submissions: [sub("alpha", 40, "2026-09-23 10:00"), sub("beta", 30, "2026-09-23 10:05")],
    });
    const auth = resolveCanonicalAuthority(o, deal)!;
    assert.equal(auth.kind, "ADMIN_LEAD");
    assert.equal(auth.firm, "alpha");
    assert.equal(resolvedCanonical(o, deal).amountBn, 40);
    assert.ok(submissionDiscrepancy(o, deal));
    const s = summarizeBook(tranche, [o], deal);
    assert.equal(s.aggregateBn, 40);
    assert.equal(s.discrepancyCount, 1);
    assert.equal(currentGuidance(tranche)?.label, "対国債 +10〜20bp");
  });
  it("uses the later submission when two from the same firm share a timestamp", () => {
    const o = order({
      id: "o3",
      submissions: [sub("beta", 10, DEMO_NOW), sub("beta", 20, DEMO_NOW)],
    });
    const latest = latestSubmissionByFirm(o).find((x) => x.firm === "beta");
    assert.equal(latest?.sub.amountBn, 20);
  });
  it("without an admin lead submission, the earliest co-lead is the truth", () => {
    const o = order({
      id: "o2",
      submissions: [sub("beta", 30, "2026-09-23 11:00"), sub("gamma", 50, "2026-09-23 09:00")],
    });
    const auth = resolveCanonicalAuthority(o, deal)!;
    assert.equal(auth.kind, "EARLIEST_CO_LEAD");
    assert.equal(auth.firm, "gamma");
    assert.equal(resolvedCanonical(o, deal).amountBn, 50);
    assert.deepEqual(submissionDiscrepancy(o, deal)!.divergentFirms, ["beta"]);
  });
  it("keeps a same-firm amount change in the entry trail", () => {
    const first = sub("alpha", 1, "2026-09-23 19:00");
    const raised = { ...sub("alpha", 5, "2026-09-23 19:01"), id: "alpha-5" };
    const o = order({ id: "o4", submissions: [raised], entryLog: [first, raised] });
    const trail = submissionTrail(o);
    assert.equal(trail.length, 2);
    assert.equal(trail[0].prev, undefined);
    assert.equal(trail[0].sub.amountBn, 1);
    assert.equal(trail[1].prev?.amountBn, 1);
    assert.equal(trail[1].sub.amountBn, 5);
    assert.equal(o.submissions.length, 1);
  });
  it("shows a firm only its own trail plus the investor's own moves", () => {
    const alpha = sub("alpha", 1, "2026-09-23 19:00");
    const beta = sub("beta", 4, "2026-09-23 19:01");
    const investor = { ...sub("beta", 5, "2026-09-23 19:02"), id: "inv", channel: "INVESTOR_DIRECT" as const };
    const investorCopy = { ...investor, id: "inv-alpha", receivedByFirm: "alpha" as const };
    const o = order({ id: "o5", submissions: [alpha, beta], entryLog: [alpha, beta, investor, investorCopy] });
    const trail = firmVisibleTrail(o, "alpha");
    assert.deepEqual(trail.map((x) => x.sub.id), [alpha.id, investor.id]);
    assert.equal(trail[1].prev?.amountBn, undefined);
    assert.equal(firmVisibleTrail(o, "beta").some((x) => x.sub.receivedByFirm === "alpha" && x.sub.channel !== "INVESTOR_DIRECT"), false);
  });
});

describe("スプレッド別オーダー", () => {
  const guidance = { id: "g", day: 1, label: "+10〜20bp", lowBp: 10, highBp: 20, enteredAt: DEMO_NOW, effectiveAt: DEMO_NOW };
  it("adds tighter limits first and keeps market in every cumulative step", () => {
    const rows = spreadDemand(
      [
        order({ id: "m", submissions: [sub("alpha", 10, "2026-09-23 19:00")] }),
        order({ id: "tight", globalInvestorId: "GI-2", submissions: [sub("alpha", 5, "2026-09-23 19:01", 12)] }),
        order({ id: "wide", globalInvestorId: "GI-3", submissions: [sub("alpha", 8, "2026-09-23 19:02", 25)] }),
        order({ id: "gone", globalInvestorId: "GI-4", status: "CANCELLED", submissions: [sub("alpha", 100, "2026-09-23 19:03", 15)] }),
      ],
      deal,
      guidance,
    );
    assert.deepEqual(
      rows.map((r) => [r.label, r.amountBn, r.cumulativeBn, r.outsideGuidance]),
      [
        ["マーケット", 10, 10, false],
        ["+12bp", 5, 15, false],
        ["+25bp", 8, 23, true],
      ],
    );
  });
  it("uses the canonical order, not another firm's submission", () => {
    const o = order({ id: "canon", submissions: [sub("alpha", 10, "2026-09-23 19:00"), sub("beta", 40, "2026-09-23 19:01", 15)] });
    const rows = spreadDemand([o], deal, guidance);
    assert.deepEqual(rows.map((r) => [r.label, r.amountBn]), [["マーケット", 10]]);
  });
});

describe("マーケティングの差し替え", () => {
  it("starts the next marketing when the spread or the issue size changes", () => {
    const current = { lowBp: 10, highBp: 20, amountBn: 300 };
    assert.equal(shouldReviseMarketing(current, { lowBp: 10, highBp: 15, amountBn: 300 }, 300), true);
    assert.equal(shouldReviseMarketing(current, { lowBp: 10, highBp: 20, amountBn: 250 }, 300), true);
    assert.equal(shouldReviseMarketing(current, { lowBp: 10, highBp: 20, amountBn: 300 }, 300), false);
    assert.equal(shouldReviseMarketing({ lowBp: 10, highBp: 20 }, { lowBp: 10, highBp: 20, amountBn: 300 }, 300), false);
  });
});

describe("ブックの手動統合", () => {
  it("keeps one investor and both firms' orders, counting the canonical amount once", () => {
    const byAlpha = order({
      id: "b",
      globalInvestorId: "GI-B",
      investorName: "投資家B",
      submissions: [sub("alpha", 8, "2026-09-23 18:00")],
      placedWithFirmIds: ["alpha"],
    });
    const byEpsilon = order({
      id: "l",
      globalInvestorId: "GI-L",
      investorName: "投資家L",
      bdFirmId: "epsilon",
      submissions: [sub("epsilon", 5, "2026-09-23 18:30", 12)],
      placedWithFirmIds: ["epsilon"],
    });
    const merged = mergeCanonicalOrders(byAlpha, byEpsilon, deal, "2026-09-23 19:00");
    assert.ok(merged);
    assert.equal(merged.keep.globalInvestorId, "GI-B");
    assert.equal(merged.keep.investorName, "投資家B");
    assert.equal(merged.keep.amountBn, 8);
    assert.deepEqual(latestSubmissionByFirm(merged.keep).map((x) => x.firm).sort(), ["alpha", "epsilon"]);
    assert.equal(merged.absorb.status, "CANCELLED");
    assert.equal(merged.absorb.mergedIntoId, "b");
    assert.equal(merged.keep.mergedFrom?.[0]?.investorId, "GI-L");
    const book = summarizeBook(tranche, [merged.keep, merged.absorb], deal);
    assert.equal(book.aggregateBn, 8);
    assert.equal(book.canonicalCount, 1);
    assert.ok(submissionDiscrepancy(merged.keep, deal));
  });
  it("refuses a cancelled order or a different tenor", () => {
    const a = order({ id: "a", submissions: [sub("alpha", 1, "2026-09-23 18:00")] });
    const cancelled = order({ id: "c", status: "CANCELLED", submissions: [sub("beta", 1, "2026-09-23 18:00")] });
    const otherTenor = order({ id: "t", trancheId: "t2", submissions: [sub("beta", 1, "2026-09-23 18:00")] });
    assert.equal(mergeCanonicalOrders(a, cancelled, deal, DEMO_NOW), undefined);
    assert.equal(mergeCanonicalOrders(a, otherTenor, deal, DEMO_NOW), undefined);
  });
});
