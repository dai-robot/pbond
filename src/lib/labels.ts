import type { DealStatus, EntryTag, OrderStatus } from "./types.ts";

export const DEAL_STATUS_JA: Record<DealStatus, string> = {
  DRAFT: "下書き",
  "PRE-MARKETING": "プレマーケティング",
  MARKETING: "マーケティング",
  "BOOK OPEN": "ブック中",
  "BOOK CLOSED": "ファイナルクローズ",
  ALLOCATION: "アロケーション",
  PRICED: "条件決定",
  "トレード中": "トレード中",
  CLOSED: "終了",
};

export const ORDER_STATUS_JA: Record<OrderStatus, string> = {
  ACTIVE: "有効",
  "OUTSIDE GUIDANCE": "レンジ外オーダー",
  CANCELLED: "取消",
};

export const ENTRY_TAG_JA: Record<EntryTag, string> = {
  EXCEPTION: "例外",
  LATE_ENTRY: "遅延入力",
  SYSTEM_RECOVERY: "強制入力",
};
