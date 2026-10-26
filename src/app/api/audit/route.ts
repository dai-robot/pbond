import { actorFromId } from "@/domain/actor";
import { readAudit } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

const COMMAND_JA: Record<string, string> = {
  setClock: "実験時刻",
  createDeal: "案件作成",
  updateTerms: "条件更新",
  closeTranche: "ファイナルクローズ",
  confirmPricing: "プライシング確定",
  reopenTranche: "クローズ解除",
  addTranche: "年限追加",
  addAccountX: "アカウントX",
  updateOrder: "オーダー更新",
  cancelOrder: "オーダー取消",
  createOrder: "投資家オーダー",
  createFirmOrder: "証券会社オーダー",
  mergeOrders: "オーダー統合",
  acknowledge: "配分確認",
  acceptTrade: "約定確認",
  saveAllocation: "配分の保存",
  showCoLeads: "共同主幹事へ提示",
  reopenAllocation: "配分を直す",
  approveCoLead: "共同主幹事の確認",
  forceCoLead: "共同主幹事の確認を代行",
  showIssuer: "発行体へ提示",
  approveIssuer: "発行体の確認",
  forceIssuer: "発行体の確認を代行",
  confirmInvestors: "配分の確定",
  addInvestor: "投資家の登録",
  appendMessage: "チャット",
  deleteMessage: "チャット削除",
  importLegacy: "以前の保存の取り込み",
};

export async function GET() {
  const actor = await currentActor();
  if (!actor || actor.role !== "AUDITOR") return Response.json({ error: "監査人だけが操作記録を見られます" }, { status: 403 });
  const rows = readAudit(120).flatMap((row) => {
    const who = actorFromId(row.actorId);
    if (!who || who.firmId !== actor.firmId || who.role === "INVESTOR" || who.role === "ISSUER") return [];
    return [{ id: row.id, at: row.at, actor: who.label, command: COMMAND_JA[row.command] ?? row.command, ok: row.ok, detail: row.ok ? "" : row.detail }];
  });
  return Response.json({ rows });
}
