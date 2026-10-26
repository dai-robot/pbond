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

function publishedDeal() {
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
  if (!created.ok) throw new Error("案件を作れません");
  return { ...created.world, now: "2026-09-24 10:00" };
}

test("不正な金額・種別・指値・提出先は台帳を変えず、投資家直接と証券会社入力の両方で拒む", () => {
  const world = publishedDeal();
  const trancheId = world.tranches[0].id;
  const investor = actorFromId("inv:GI-0001")!;
  const before = JSON.stringify(world.orders);
  const negative = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: -10, type: "MARKET", bdFirmId: "alpha", placedWith: ["alpha"] } });
  const textAmount = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: "-10", type: "MARKET", bdFirmId: "alpha", placedWith: ["alpha"] } as never });
  const firmNegative = applyCommand(world, admin, { type: "createFirmOrder", trancheId, input: { amountBn: -10, type: "MARKET", bdFirmId: "alpha", identityMode: "DISCLOSED", investorId: "GI-0002", channel: "SYNDICATE_MANUAL" } });
  const badType = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: 1, type: "STOP", bdFirmId: "alpha", placedWith: ["alpha"] } as never });
  const badLimit = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: 1, type: "LIMIT", bdFirmId: "alpha", placedWith: ["alpha"] } });
  const badPlacement = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: 1, type: "MARKET", bdFirmId: "beta", placedWith: ["alpha"] } });
  for (const result of [negative, textAmount, firmNegative, badType, badLimit, badPlacement]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /金額|種別|指値|提出先|B&D/);
  }
  assert.equal(JSON.stringify(world.orders), before);

  const created = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: 1, type: "MARKET", bdFirmId: "alpha", placedWith: ["alpha"], comment: "本人だけのコメントZZ" } });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const orderId = created.world.orders.orders[0].id;
  const kept = JSON.stringify(created.world.orders);
  const updated = applyCommand(created.world, investor, { type: "updateOrder", orderId, patch: { amountBn: -20 } });
  const firmUpdated = applyCommand(created.world, admin, { type: "createFirmOrder", trancheId, input: { amountBn: -20, type: "MARKET", bdFirmId: "alpha", identityMode: "DISCLOSED", investorId: "GI-0001", channel: "SYNDICATE_MANUAL" } });
  assert.equal(updated.ok, false);
  assert.equal(firmUpdated.ok, false);
  if (!updated.ok) assert.match(updated.error, /金額/);
  assert.equal(created.world.orders.orders[0].amountBn, 1);
  assert.equal(JSON.stringify(created.world.orders), kept);
});

test("投資家への応答に、他の投資家の名前とコメントが残らない", () => {
  const world = publishedDeal();
  const trancheId = world.tranches[0].id;
  const investor = actorFromId("inv:GI-0001")!;
  const mine = applyCommand(world, investor, { type: "createOrder", trancheId, input: { amountBn: 1, type: "MARKET", bdFirmId: "alpha", placedWith: ["alpha"], comment: "本人だけのコメントZZ" } });
  assert.equal(mine.ok, true);
  if (!mine.ok) return;
  const other = applyCommand(mine.world, admin, { type: "createFirmOrder", trancheId, input: { amountBn: 2.7, type: "LIMIT", limitBp: 15, bdFirmId: "alpha", identityMode: "DISCLOSED", investorId: "GI-0002", channel: "SYNDICATE_MANUAL", comment: "他投資家コメントZZ" } });
  assert.equal(other.ok, true);
  if (!other.ok) return;
  const hidden = other.world.orders.orders.find((order) => order.globalInvestorId === "GI-0002");
  assert.ok(hidden);
  hidden.comment = "他投資家コメントZZ";
  hidden.rawSourceInvestorName = "原簿名ZZ";
  hidden.entryLog = [{ ...hidden.submissions[0], comment: "他投資家コメントZZ", rawSourceInvestorName: "原簿名ZZ" }];
  hidden.history = [{ at: "2026-09-24 10:00", change: "履歴の他投資家コメントZZ" }];
  hidden.mergedFrom = [{ investorId: "GI-0099", investorName: "統合された第三者ZZ", at: "2026-09-24 10:00" }];
  other.world.investors.aliases.push({ firmId: "alpha", investorId: "GI-0002", name: "社内呼称ZZ" });
  other.world.investors.snap.fieldHistory.push({ historyId: "h-secret", masterInvestorId: "GI-0002", fieldName: "displayName", oldValue: "旧名ZZ", newValue: "投資家ブラボー", changedAt: "2026-09-24 10:00", changedBy: "syn:alpha" });
  const room = other.world.rooms.find((item) => item.type === "SYNDICATE");
  const noted = applyCommand(other.world, admin, { type: "appendMessage", roomId: room?.id ?? "", text: "チャットの他投資家コメントZZ", id: "m-secret" });
  assert.equal(noted.ok, true);
  if (!noted.ok) return;
  const shown = projectWorld(noted.world, investor);
  const body = JSON.stringify(shown);
  for (const secret of ["他投資家コメントZZ", "原簿名ZZ", "履歴の他投資家コメントZZ", "統合された第三者ZZ", "社内呼称ZZ", "旧名ZZ", "投資家ブラボー", "ブラボー損保", "アルファ生命（未照合）", "チャーリー年金", "チャットの他投資家コメントZZ", "債券運用 B"]) {
    assert.equal(body.includes(secret), false, secret);
  }
  assert.equal(body.includes("本人だけのコメントZZ"), true);
  assert.equal(body.includes("アルファ生命"), true);
  assert.equal(body.includes("運用部 A"), true);
  const book = shown.orders.orders;
  assert.equal(book.find((order) => order.globalInvestorId === "GI-0001")?.comment, "本人だけのコメントZZ");
  assert.equal(book.find((order) => order.globalInvestorId === "GI-0002")?.amountBn, 2.7);
  assert.equal(book.reduce((sum, order) => sum + order.amountBn, 0), 3.7);
  const desk = JSON.stringify(projectWorld(noted.world, sales));
  assert.equal(desk.includes("ブラボー損保"), true);
  assert.equal(desk.includes("他投資家コメントZZ"), true);
});

test("タイトサイドと同じ指値は配分でき、広い指値は配分できない", () => {
  const created = applyCommand(emptyWorld(), admin, {
    type: "createDeal",
    input: {
      issuer: "スザク運輸",
      issuerShort: "スザク",
      coLeadIds: ["beta"],
      tenorLabel: "5年",
      amountOku: 300,
      publicAt: "2026-09-23 09:00",
      orderCutoffAt: "2026-09-30 11:00",
      pricingDate: "2026-09-30",
      paymentDate: "2026-10-07",
      guidanceLowBp: 16,
      guidanceHighBp: 25,
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const trancheId = created.world.tranches[0].id;
  const investor = actorFromId("inv:GI-0001");
  assert.ok(investor);
  const ordered = applyCommand(created.world, investor, {
    type: "createOrder",
    trancheId,
    input: { amountBn: 1, type: "LIMIT", limitBp: 18, bdFirmId: "alpha", placedWith: ["alpha"] },
  });
  assert.equal(ordered.ok, true);
  if (!ordered.ok) return;
  const row = { globalInvestorId: "GI-0001", finalOrderBn: 1, allocationBn: 0.5, marketOrder: true as const };
  const blocked = applyCommand(ordered.world, admin, { type: "saveAllocation", trancheId, rows: [row] });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.error, "マーケットオーダーではないため配分できません");
  const tightened = applyCommand(ordered.world, admin, {
    type: "updateTerms",
    dealId: ordered.world.deals[0].id,
    input: { trancheId, guidanceLowBp: 18, guidanceHighBp: 19, marketingEffectiveAt: "2026-09-23 19:00" },
  });
  assert.equal(tightened.ok, true);
  if (!tightened.ok) return;
  const saved = applyCommand(tightened.world, admin, { type: "saveAllocation", trancheId, rows: [{ ...row, marketOrder: false }] });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.world.allocations[0]?.rows[0]?.allocationBn, 0.5);
  assert.equal(saved.world.allocations[0]?.rows[0]?.marketOrder, true);
});

test("同じ内容のオーダーは二度入れられない", () => {
  const world = publishedDeal();
  const trancheId = world.tranches[0].id;
  const input = { amountBn: 1, type: "LIMIT" as const, limitBp: 18, bdFirmId: "alpha" as const, identityMode: "DISCLOSED" as const, investorId: "GI-0001", channel: "SYNDICATE_MANUAL" as const };
  const first = applyCommand(world, admin, { type: "createFirmOrder", trancheId, input });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const order = first.world.orders.orders.find((o) => o.globalInvestorId === "GI-0001");
  assert.equal(order?.entryLog?.length, 1);
  const again = applyCommand(first.world, admin, { type: "createFirmOrder", trancheId, input });
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.equal(again.error, "同じ内容のオーダーがすでに入っています");
  assert.equal(first.world.orders.orders.find((o) => o.globalInvestorId === "GI-0001")?.entryLog?.length, 1);
  const changed = applyCommand(first.world, admin, { type: "createFirmOrder", trancheId, input: { ...input, amountBn: 2 } });
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.equal(changed.world.orders.orders.find((o) => o.globalInvestorId === "GI-0001")?.entryLog?.length, 2);
});

test("プライシングの確定は事務主幹事だけができ、各ロールにクーポン・単価・債券単利が渡る", () => {
  const world = publishedDeal();
  const trancheId = world.tranches[0].id;
  const colead = actorFromId("syn:beta")!;
  const denied = applyCommand(world, colead, { type: "confirmPricing", trancheId, jgbSimplePct: 1.005, spreadBp: 32 });
  assert.equal(denied.ok, false);
  const offGrid = applyCommand(world, admin, { type: "confirmPricing", trancheId, jgbSimplePct: 1.001, spreadBp: 32 });
  assert.equal(offGrid.ok, false);
  const confirmed = applyCommand(world, admin, { type: "confirmPricing", trancheId, jgbSimplePct: 1.005, spreadBp: 32 });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;
  const saved = confirmed.world.tranches[0].pricingConfirmed;
  assert.equal(saved?.couponPct, 1.327);
  assert.equal(saved?.priceYen, 100);
  assert.equal(saved?.bondSimplePct, 1.327);
  for (const id of ["sales:alpha-aoyama", "inv:GI-0001", "iss:スザク運輸", "uw:alpha-uw-aoki", "doc:alpha-doc-nishi", "aud:alpha"]) {
    const actor = actorFromId(id);
    assert.ok(actor);
    const shown = projectWorld(confirmed.world, actor!);
    const row = shown.tranches.find((t) => t.id === trancheId)?.pricingConfirmed;
    assert.equal(row?.couponPct, 1.327, id);
    assert.equal(row?.priceYen, 100, id);
    assert.equal(row?.bondSimplePct, 1.327, id);
  }
});

test("同じ部屋の再既読は台帳を変えない", () => {
  const world = publishedDeal();
  const roomId = world.rooms[0]?.id;
  assert.ok(roomId);
  const once = applyCommand(world, admin, { type: "markRead", roomId });
  assert.equal(once.ok, true);
  if (!once.ok) return;
  assert.equal(once.world.reads[admin.id]?.includes(roomId), true);
  const twice = applyCommand(once.world, admin, { type: "markRead", roomId });
  assert.equal(twice.ok, true);
  if (!twice.ok) return;
  assert.equal(twice.world, once.world);
});
