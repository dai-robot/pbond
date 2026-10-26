import type { DealStatus, EntryTag, OrderStatus } from "./types.ts";

const OPEN_BOOK: DealStatus[] = ["BOOK OPEN", "MARKETING"];

/** ブックを閉じていても台帳のステータスがブック中のとき、一覧ではブッククローズと出す。 */
export function displayDealStatus(status: DealStatus, bookClosed = false): DealStatus {
  if (bookClosed && OPEN_BOOK.includes(status)) return "BOOK CLOSED";
  return status;
}

export function displayDealStatusLabel(status: DealStatus, bookClosed = false) {
  if (bookClosed && OPEN_BOOK.includes(status)) return "ブッククローズ";
  return DEAL_STATUS_JA[status];
}

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
