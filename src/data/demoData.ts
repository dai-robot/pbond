// =====================================================================
// マスタのみ。案件・トランシェ・オーダー・チャットの試作データは空。
// 案件は事務主幹事が画面から作成する。
// =====================================================================
import type { CanonicalOrder, ChatRoom, Deal, Firm, FirmId, Tranche } from "../lib/types.ts";

export const FIRMS: Record<FirmId, Firm> = {
  alpha: { id: "alpha", name: "アルファ証券", short: "アルファ" },
  beta: { id: "beta", name: "ベータ証券", short: "ベータ" },
  gamma: { id: "gamma", name: "ガンマ証券", short: "ガンマ" },
  delta: { id: "delta", name: "デルタ証券", short: "デルタ" },
  epsilon: { id: "epsilon", name: "イプシロン証券", short: "イプシロン" },
};
export const FIRM_LIST: Firm[] = Object.values(FIRMS);

export const DEALS: Deal[] = [];
export const TRANCHES: Tranche[] = [];
export const ORDERS: CanonicalOrder[] = [];
export const ROOMS: ChatRoom[] = [];

export const dealById = (id: string) => DEALS.find((d) => d.id === id);
export const trancheById = (id: string) => TRANCHES.find((t) => t.id === id);
export const tranchesOf = (dealId: string) => TRANCHES.filter((t) => t.dealId === dealId);
export const ordersOf = (trancheId: string) => ORDERS.filter((o) => o.trancheId === trancheId);
export const roomsOf = (dealId: string) => ROOMS.filter((r) => r.dealId === dealId);
