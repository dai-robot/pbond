import assert from "node:assert/strict";
import test from "node:test";
import { actorFromId } from "./actor.ts";
import { applyCommand } from "./apply.ts";
import { projectWorld } from "./project.ts";
import { emptyWorld } from "./world.ts";

const admin = actorFromId("syn:alpha")!;
const sales = actorFromId("sales:alpha-aoyama")!;

test("案件の最初のレンジは公開時刻に保存され、セールスには公開前のレンジが渡らない", () => {
  const created = applyCommand(emptyWorld(), admin, {
    type: "createDeal",
    input: {
      issuer: "スザク運輸",
      issuerShort: "スザク",
      coLeadIds: ["beta"],
      tenorLabel: "5年",
      amountOku: 300,
      publicAt: "2026-09-24 10:00",
      orderCutoffAt: "2026-09-30 11:00",
      pricingDate: "2026-09-30",
      paymentDate: "2026-10-07",
      guidanceLowBp: 12,
      guidanceHighBp: 22,
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.world.tranches[0].guidances[0].effectiveAt, "2026-09-24 10:00");
  const shown = projectWorld(created.world, sales);
  assert.equal(shown.deals.length, 1);
  assert.equal(shown.tranches[0]?.guidances.length, 0);
  assert.equal(shown.orders.orders.length, 0);
  assert.equal(shown.rooms.length, 0);
  const later = { ...created.world, now: "2026-09-24 10:00" };
  const open = projectWorld(later, sales);
  assert.equal(open.deals.length, 1);
  assert.equal(open.tranches[0].guidances.length, 1);
});

test("公開前はオーダーを受け付けず、他社のオーダーと発行体のシンジケートチャットは拒む", () => {
  const created = applyCommand(emptyWorld(), admin, {
    type: "createDeal",
    input: {
      issuer: "スザク運輸",
      issuerShort: "スザク",
      coLeadIds: ["beta"],
      tenorLabel: "5年",
      amountOku: 300,
      publicAt: "2026-09-24 10:00",
      orderCutoffAt: "2026-09-30 11:00",
      pricingDate: "2026-09-30",
      paymentDate: "2026-10-07",
      guidanceLowBp: 12,
      guidanceHighBp: 22,
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const trancheId = created.world.tranches[0].id;
  const investor = actorFromId("inv:GI-0001");
  const issuer = actorFromId("iss:スザク運輸");
  assert.ok(investor && issuer);
  const salesOrder = applyCommand(created.world, sales, {
    type: "createFirmOrder",
    trancheId,
    input: { amountBn: 1, type: "MARKET", bdFirmId: "alpha", identityMode: "DISCLOSED", investorId: "GI-0001", channel: "SALES_MANUAL" },
  });
  const investorOrder = applyCommand(created.world, investor!, { type: "createOrder", trancheId, input: { amountBn: 1, type: "MARKET", bdFirmId: "alpha", placedWith: ["alpha"] } });
  assert.equal(salesOrder.ok, false);
  assert.equal(investorOrder.ok, false);
  const room = created.world.rooms.find((r) => r.type === "SYNDICATE");
  const leaked = applyCommand(created.world, issuer!, { type: "appendMessage", roomId: room?.id ?? "", text: "漏れ", id: "m-leak" });
  assert.equal(leaked.ok, false);
  const open = { ...created.world, now: "2026-09-24 10:00" };
  const placed = applyCommand(open, admin, {
    type: "createFirmOrder",
    trancheId,
    input: { amountBn: 1, type: "MARKET", bdFirmId: "alpha", identityMode: "DISCLOSED", investorId: "GI-0001", channel: "SYNDICATE_MANUAL" },
  });
  assert.equal(placed.ok, true);
  if (!placed.ok) return;
  const stolen = applyCommand(placed.world, sales, { type: "cancelOrder", orderId: placed.world.orders.orders[0].id });
  assert.equal(stolen.ok, false);
});
