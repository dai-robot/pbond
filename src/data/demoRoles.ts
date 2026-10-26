// =====================================================================
// デモ（Phase 2）— Role別プロトタイプ用の追加データ。すべて架空。
// =====================================================================
import type { Allocation, DemoTime, FirmId } from "../lib/types.ts";

/** 投資家の業態。アカウントXは実名の投資家ではなく、この業態自体がアカウントX。 */
export const INVESTOR_SEGMENTS = ["生保", "損保", "中央公的", "系統上部", "地銀", "系統下部", "地方公的", "その他諸法人", "アカウントX", "証券会社自己"] as const;
export type InvestorSegment = (typeof INVESTOR_SEGMENTS)[number];

/** Role Switcherで選択できるInvestor（Global Investor Master上の架空Investor） */
export interface InvestorPersona {
  id: string; // 投資家ID
  name: string;
  /** 表示用の担当者名（架空） */
  contact: string;
  segment: InvestorSegment;
}
export const INVESTOR_PERSONAS: InvestorPersona[] = [
  { id: "GI-0001", name: "アルファ生命", contact: "運用部 A", segment: "生保" },
  { id: "GI-0002", name: "ブラボー損保", contact: "債券運用 B", segment: "損保" },
  { id: "GI-0007", name: "チャーリー年金", contact: "クレジット投資 C", segment: "中央公的" },
  { id: "GI-0034", name: "ジュリエット農林中央", contact: "資金運用 J", segment: "系統上部" },
];
export const investorById = (id: string) => INVESTOR_PERSONAS.find((p) => p.id === id);

/** Sales / シンジケート入力用の Global Investor Master（架空・DEMO） */
export const INVESTOR_MASTER: InvestorPersona[] = [
  ...INVESTOR_PERSONAS,
  { id: "GI-0011", name: "エコー銀行", contact: "運用 E", segment: "地銀" },
  { id: "GI-0015", name: "フォックストロット信金", contact: "運用 F", segment: "系統下部" },
  { id: "GI-0021", name: "ゴルフ県", contact: "運用 G", segment: "地方公的" },
  { id: "GI-0023", name: "ホテル商事", contact: "運用 H", segment: "その他諸法人" },
  { id: "GI-0030", name: "インディア証券自己", contact: "自己売買 I", segment: "証券会社自己" },
  { id: "GI-0038", name: "キロ生命", contact: "運用 K", segment: "生保" },
  { id: "GI-0041", name: "マイク銀行", contact: "運用 M", segment: "地銀" },
  { id: "GI-0044", name: "ノーベンバー損保", contact: "運用 N", segment: "損保" },
];
export const investorMasterById = (id: string) => INVESTOR_MASTER.find((p) => p.id === id);

/** 実名の投資家はマスタの業態。アカウントXは業態もアカウントX。 */
export function investorSegmentOf(investorId: string): InvestorSegment | undefined {
  if (investorId.startsWith("GI-ACC-")) return "アカウントX";
  return investorMasterById(investorId)?.segment;
}

/** Role Switcherで選択できるIssuer（Deal.issuer と一致させる） */
export interface IssuerPersona {
  issuer: string;
  short: string;
  contact: string;
}
export const ISSUER_PERSONAS: IssuerPersona[] = [
  { issuer: "サクラ・インフラホールディングス", short: "サクラインフラ", contact: "財務部" },
  { issuer: "ミナト不動産投資", short: "ミナト不動産", contact: "財務部" },
  { issuer: "アオイ・モーターファイナンス", short: "アオイMF", contact: "財務部" },
];

/** 事務主幹事が案件作成時に選べる発行体カタログ（架空・DEMO） */
export const CREATABLE_ISSUERS: IssuerPersona[] = [
  { issuer: "モミジホールディングス", short: "モミジHD", contact: "財務部" },
  { issuer: "スザク運輸", short: "スザク運輸", contact: "財務部" },
  { issuer: "キリ・ソフトファイナンス", short: "キリソフト", contact: "財務部" },
  { issuer: "アサヒ物流リート", short: "アサヒ物流", contact: "財務部" },
  { issuer: "ユズ・エナジー・パートナーズ", short: "ユズエナジー", contact: "財務部" },
];

/** ログインとロール切替に出す発行体。案件作成の候補も、最初から登録された発行体も、同じ一覧にする。 */
export const ALL_ISSUERS: IssuerPersona[] = [...ISSUER_PERSONAS, ...CREATABLE_ISSUERS];
export const issuerByName = (name: string) => ALL_ISSUERS.find((p) => p.issuer === name);

/** Syndication Roleで選択できる証券会社（既存FIRMSと同じID） */
export const SYNDICATION_FIRM_IDS: FirmId[] = ["alpha", "beta", "gamma", "delta", "epsilon"];

// ---------------------------------------------------------------------
// Allocation（確定・Investorへ公開済のもののみ）
// Investorが見られるのは「Aggregate Total」「自分のFinal Order」「自分のAllocation」だけ。
// ---------------------------------------------------------------------
/** アロケーションの初期データは空。案件を作ってから使う。 */
export const ALLOCATIONS: Allocation[] = [];

/** "trancheId:investorId" 形式のキー */
export const allocKey = (trancheId: string, investorId: string) => `${trancheId}:${investorId}`;

/** 初期状態で既にAllocation Acknowledgement済み（DEMO） */
export const INITIAL_ACKNOWLEDGED: string[] = [];

/** 約定確認済み（試作の初期状態は空） */
export const INITIAL_TRADE_ACCEPTED: string[] = [];

/**
 * レンジ外OrderについてInvestorに求める回答期限（Tranche単位・DEMO / 未実装）。
 * 実務上の期限設定ルールは未確定。
 */
export const OUTSIDE_GUIDANCE_RESPONSE_DUE: Record<string, DemoTime> = {};
