import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatRoomsForRole, dealPath, firmNewOrderAllowed, investorCanSeeDeal, isOutsideGuidance, liveOrderStatus, modifyOrderRule, newOrderRule, roleFromPath, salesCanSeeDeal } from "./roles.ts";
import type { CanonicalOrder, Deal } from "./types.ts";

describe("role routing", () => {
  it("role is derived from path", () => {
    assert.equal(roleFromPath("/"), "SYNDICATION");
    assert.equal(roleFromPath("/sales"), "SALES");
    assert.equal(roleFromPath("/sales/deals/x"), "SALES");
    assert.equal(roleFromPath("/investor"), "INVESTOR");
    assert.equal(roleFromPath("/issuer/deals/x"), "ISSUER");
    assert.equal(roleFromPath("/underwriting/deals/x"), "UNDERWRITING");
    assert.equal(roleFromPath("/documentation"), "DOCUMENTATION");
    assert.equal(roleFromPath("/audit"), "AUDITOR");
    assert.equal(roleFromPath("/audit/deals/x"), "AUDITOR");
  });
  it("same deal opens under each role", () => {
    assert.equal(dealPath("SYNDICATION", "x"), "/deals/x");
    assert.equal(dealPath("SALES", "x"), "/sales/deals/x");
    assert.equal(dealPath("INVESTOR", "x"), "/investor/deals/x");
    assert.equal(dealPath("ISSUER", "x"), "/issuer/deals/x");
    assert.equal(dealPath("UNDERWRITING", "x"), "/underwriting/deals/x");
    assert.equal(dealPath("DOCUMENTATION", "x"), "/documentation/deals/x");
    assert.equal(dealPath("AUDITOR", "x"), "/audit/deals/x");
  });
  it("chat rooms follow the role", () => {
    assert.deepEqual(chatRoomsForRole("SYNDICATION"), ["SYNDICATE", "ISSUER_LM"]);
    assert.deepEqual(chatRoomsForRole("UNDERWRITING"), ["UNDERWRITING", "ISSUER_LM", "DOCUMENTATION"]);
    assert.deepEqual(chatRoomsForRole("DOCUMENTATION"), ["ISSUER_LM", "DOCUMENTATION"]);
    assert.deepEqual(chatRoomsForRole("ISSUER"), ["ISSUER_LM"]);
    assert.deepEqual(chatRoomsForRole("SALES"), []);
  });
});

const openDeal = {
  status: "BOOK OPEN",
  publicAt: "2026-09-23 09:00",
  orderCutoffAt: "2026-09-30 11:00",
} as Deal;

describe("ブック中の新規オーダー", () => {
  it("allows a new order before cutoff", () => {
    assert.equal(newOrderRule(openDeal).allowed, true);
    assert.equal(investorCanSeeDeal(openDeal), true);
  });
  it("hides drafts from investors", () => {
    assert.equal(investorCanSeeDeal({ ...openDeal, status: "DRAFT" }), false);
  });
  it("hides a deal from sales until the publication time", () => {
    assert.equal(salesCanSeeDeal(openDeal), true);
    assert.equal(salesCanSeeDeal({ ...openDeal, publicAt: "2026-09-24 10:00" }), false);
    assert.equal(salesCanSeeDeal({ ...openDeal, status: "DRAFT" }), false);
  });
  it("lets investors change an existing order after cutoff, until final close", () => {
    const after = { ...openDeal, orderCutoffAt: "2026-09-23 09:00" };
    const order = { status: "ACTIVE" } as CanonicalOrder;
    assert.equal(newOrderRule(after).allowed, false);
    assert.equal(modifyOrderRule(after, order).allowed, true);
    assert.equal(firmNewOrderAllowed(after, "SALES_MANUAL").allowed, false);
    assert.equal(firmNewOrderAllowed(after, "SYNDICATE_MANUAL").allowed, true);
    const closed = { ...after, status: "BOOK CLOSED" as const };
    assert.equal(modifyOrderRule(closed, order).allowed, false);
    assert.equal(firmNewOrderAllowed(closed, "SYNDICATE_MANUAL").allowed, false);
  });
  it("rejects a limit outside the current range and flags an order after the range moves", () => {
    const g = { id: "g", day: 2, label: "+10〜15bp", lowBp: 10, highBp: 15, enteredAt: "2026-09-23 19:00", effectiveAt: "2026-09-23 19:00" };
    assert.equal(isOutsideGuidance({ type: "LIMIT", limitBp: 18 }, g), true);
    assert.equal(isOutsideGuidance({ type: "LIMIT", limitBp: 12 }, g), false);
    assert.equal(isOutsideGuidance({ type: "MARKET" }, g), false);
    const order = { status: "ACTIVE", type: "LIMIT", limitBp: 18, amountBn: 5, submissions: [] } as unknown as CanonicalOrder;
    const deal = { adminLeadId: "alpha", coLeadIds: [] } as unknown as Deal;
    assert.equal(liveOrderStatus(order, deal, g), "OUTSIDE GUIDANCE");
  });
});
