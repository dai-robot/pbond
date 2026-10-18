import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_COVERAGE, assignmentFor, closedBookEditAllowed, firmAssignments, firmEntryLock, firmHoldsOrder, firmOwnsEntry, investorEntryLock, otherFirmOrderOnly, salesMayEnter, salesSeesOrder } from "./coverage.ts";
import type { CanonicalOrder, EntryChannel, FirmId } from "./types.ts";

function order(investorId: string, channel: EntryChannel, firm: FirmId): CanonicalOrder {
  return {
    id: `${investorId}-${channel}`,
    trancheId: "t1",
    globalInvestorId: investorId,
    investorName: investorId,
    maskedLabel: "アカウントX",
    amountBn: 1,
    type: "MARKET",
    initialType: "MARKET",
    firstReceivedAt: "2026-09-23 19:00",
    lastUpdatedAt: "2026-09-23 19:00",
    status: "ACTIVE",
    bdFirmId: firm,
    history: [],
    submissions: [{ id: "s", receivedByFirm: firm, amountBn: 1, type: "MARKET", receivedAt: "2026-09-23 19:00", channel }],
  };
}

describe("担当セールスの可視性", () => {
  it("担当顧客のオーダーはシンジケート入力でも見える", () => {
    const o = order("GI-0002", "SYNDICATE_MANUAL", "alpha");
    assert.equal(salesSeesOrder(o, "alpha", "alpha-aoyama", SEED_COVERAGE), true);
    assert.equal(salesSeesOrder(o, "alpha", "alpha-inoue", SEED_COVERAGE), false);
  });

  it("担当顧客のオーダーは投資家直接でも見える", () => {
    const o = order("GI-0001", "INVESTOR_DIRECT", "beta");
    assert.equal(salesSeesOrder(o, "alpha", "alpha-aoyama", SEED_COVERAGE), true);
    assert.equal(salesSeesOrder(o, "beta", "beta-ueda", SEED_COVERAGE), false);
  });

  it("他社の担当リストには出てこない", () => {
    assert.equal(firmAssignments(SEED_COVERAGE, "alpha").some((a) => a.investorId === "GI-0034"), false);
    assert.equal(assignmentFor(SEED_COVERAGE, "beta", "GI-0001"), undefined);
    assert.equal(assignmentFor(SEED_COVERAGE, "alpha", "GI-0001")?.salesPersonId, "alpha-aoyama");
  });

  it("セールスが入れられるのは自分の担当顧客だけ", () => {
    assert.equal(salesMayEnter(SEED_COVERAGE, "alpha", "alpha-aoyama", "GI-0001"), true);
    assert.equal(salesMayEnter(SEED_COVERAGE, "alpha", "alpha-aoyama", "GI-0007"), false);
    assert.equal(salesMayEnter(SEED_COVERAGE, "alpha", "alpha-inoue", "GI-0001"), false);
    assert.equal(salesMayEnter(SEED_COVERAGE, "beta", "beta-ueda", "GI-0001"), false);
    assert.equal(firmHoldsOrder(order("GI-0001", "SYNDICATE_MANUAL", "beta"), "alpha"), false);
    assert.equal(firmHoldsOrder(order("GI-0001", "SYNDICATE_MANUAL", "beta"), "beta"), true);
  });

  it("担当外でも自分が入力したオーダーは残る", () => {
    const o = order("GI-0001", "SALES_MANUAL", "alpha");
    o.submissions[0].enteredByPersonId = "alpha-inoue";
    assert.equal(salesSeesOrder(o, "alpha", "alpha-inoue", SEED_COVERAGE), true);
    assert.equal(salesSeesOrder(o, "alpha", "alpha-aoyama", SEED_COVERAGE), true);
  });

  it("未割当でも自社セールス入力は見える", () => {
    const o = order("GI-0099", "SALES_MANUAL", "alpha");
    assert.equal(salesSeesOrder(o, "alpha", "alpha-aoyama", SEED_COVERAGE), true);
    assert.equal(salesSeesOrder(o, "alpha", "alpha-inoue", SEED_COVERAGE), true);
    assert.equal(salesSeesOrder(o, "beta", "beta-ueda", SEED_COVERAGE), false);
  });
  it("先に入れた入力元だけが残り、他社は空いていれば入れられる", () => {
    const bySyndicate = order("GI-0001", "SYNDICATE_MANUAL", "alpha");
    assert.equal(firmEntryLock(bySyndicate, "alpha", "SALES_MANUAL").allowed, false);
    assert.equal(firmEntryLock(bySyndicate, "alpha", "SYNDICATE_MANUAL").allowed, true);
    assert.equal(firmEntryLock(bySyndicate, "beta", "SALES_MANUAL").allowed, true);
    assert.equal(investorEntryLock(bySyndicate).allowed, false);

    const byInvestor = order("GI-0001", "INVESTOR_DIRECT", "alpha");
    assert.equal(firmEntryLock(byInvestor, "alpha", "SYNDICATE_MANUAL").allowed, false);
    assert.equal(firmEntryLock(byInvestor, "beta", "SALES_MANUAL").allowed, false);
    assert.equal(investorEntryLock(byInvestor).allowed, true);
    assert.equal(firmOwnsEntry(bySyndicate, "alpha", "SYNDICATE_MANUAL"), true);
    assert.equal(firmOwnsEntry(bySyndicate, "alpha", "SALES_MANUAL"), false);
    assert.equal(firmOwnsEntry(bySyndicate, "beta", "SALES_MANUAL"), false);

    const forced = order("GI-0001", "SALES_MANUAL", "alpha");
    forced.syndicateOnly = true;
    forced.submissions = [{ ...forced.submissions[0], channel: "SYNDICATE_MANUAL", entryTag: "SYSTEM_RECOVERY" }];
    assert.equal(firmEntryLock(forced, "alpha", "SALES_MANUAL").allowed, false);
    assert.equal(firmEntryLock(forced, "beta", "SALES_MANUAL").allowed, false);
    assert.equal(firmEntryLock(forced, "alpha", "SYNDICATE_MANUAL").allowed, true);
    assert.equal(firmEntryLock(forced, "beta", "SYNDICATE_MANUAL").allowed, false);
    assert.equal(investorEntryLock(forced).allowed, false);
    assert.equal(firmOwnsEntry(forced, "alpha", "SALES_MANUAL"), false);
    assert.equal(firmOwnsEntry(forced, "beta", "SYNDICATE_MANUAL"), false);
    assert.equal(firmOwnsEntry(forced, "alpha", "SYNDICATE_MANUAL"), true);
    assert.equal(closedBookEditAllowed(forced, "alpha"), true);
    assert.equal(closedBookEditAllowed(forced, "beta"), false);

    const bySales = order("GI-0002", "SALES_MANUAL", "alpha");
    assert.equal(closedBookEditAllowed(bySales, "alpha"), true);
    assert.equal(closedBookEditAllowed(bySales, "beta"), false);
    const investorOnly = order("GI-0007", "INVESTOR_DIRECT", "alpha");
    assert.equal(closedBookEditAllowed(investorOnly, "alpha"), true);
    assert.equal(closedBookEditAllowed(investorOnly, "beta"), false);
    assert.equal(otherFirmOrderOnly(bySales, "beta"), true);
    assert.equal(otherFirmOrderOnly(bySales, "alpha"), false);
  });
});
