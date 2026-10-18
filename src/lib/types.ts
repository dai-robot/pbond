// 業務データモデル（UIプロトタイプ用）。本番DBスキーマではない。

export type FirmId = "alpha" | "beta" | "gamma" | "delta" | "epsilon";

export interface Firm {
  id: FirmId;
  name: string; // Alpha Securities
  short: string; // Alpha
}

/** UI用仮Status。正式なState Machineではない。 */
export type DealStatus =
  | "DRAFT"
  | "PRE-MARKETING"
  | "MARKETING"
  | "BOOK OPEN"
  | "BOOK CLOSED"
  | "ALLOCATION"
  | "PRICED"
  | "トレード中"
  | "CLOSED";

/** "YYYY-MM-DD HH:mm" (JST) 固定書式。文字列比較で時系列順になる。 */
export type DemoTime = string;

export interface Guidance {
  id: string;
  /** マーケティングの通し番号。1 がマーケティング1 */
  day: number;
  label: string; // "国債 +1〜10bp"
  lowBp: number;
  highBp: number; // 単一値の場合 low === high
  /** そのマーケティング時点の発行額（億円）。未記録の古いデータはトランシェの発行額を使う */
  amountBn?: number;
  enteredAt: DemoTime; // 入力した時刻
  effectiveAt: DemoTime; // 有効になる時刻
}

export interface HistoricalIssuance {
  year: string;
  tenor: string;
  spreadBp: number;
  couponPct: number;
  amountBn: number;
  /** 当時のAggregate Demand（Issuer向け過去案件比較用・DEMO） */
  demandBn?: number;
  /** 条件決定日（Issuer向け・DEMO） */
  issueDate?: string;
}

/** 日証協_REF は統計値、ACTUAL_TRADE は取引値。画面では点があればこれを使い、空なら仮の数字を出す。 */
export type ComparatorKind = "日証協_REF" | "ACTUAL_TRADE";

export interface ComparatorPoint {
  date: string; // "YYYY-MM-DD" または "MM/DD"
  spreadBp: number;
  kind: ComparatorKind;
}

export interface SecondaryComparator {
  instrumentLabel: string; // 比較対象銘柄（架空）
  asOf: string; // データ時点
  /** アップロードした統計値・取引値。空のあいだは画面が仮の数字を置く。 */
  points: ComparatorPoint[];
}

export interface Tranche {
  id: string;
  dealId: string;
  tenorLabel: string; // "5Y"
  amountBn: number | null; // 発行額（Indicative）
  rating: string;
  referenceJgb: { name: string; yieldPct: number; asOf: string };
  guidances: Guidance[];
  interestFrequency: "年2回" | "年4回" | "その他";
  interestPaymentDates: string;
  denomination: string;
  redemptionDate: string;
  finalSpreadBp?: number;
  couponPct?: number;
  /** 発行価格（額面100に対する%）。Pricing後のみ */
  pricePct?: number;
  couponPublishedAt?: DemoTime;
  termSheet: { status: "PUBLISHED" | "NOT_PUBLISHED"; publishedAt?: DemoTime };
  /** この年限のブックをファイナルクローズした時刻。年限ごとに独立。 */
  bookClosedAt?: DemoTime;
  historical: HistoricalIssuance[];
  comparator: SecondaryComparator;
}

/**
 * Investor Book Visibility Policy（Deal単位・DEMO / 未実装）
 * InvestorにAggregate Demandをどう見せるか。
 */
export type InvestorBookVisibility = "FULL" | "DELAYED" | "RANGE_ONLY" | "HIDDEN";

/**
 * Issuer Identity Policy（Deal単位・DEMO / 未実装）
 * NAMES: Issuerには実名 / MASKED: IssuerにもAccount表示
 */
export type IssuerIdentityPolicy = "NAMES" | "MASKED"; // 後方互換（UIでは使わない。Order単位の identityMode を優先）
/** Investorの表示Identity。ACCOUNT_X: 実名はB&D証券のみ。DISCLOSED: 主幹事・Issuerにも実名 */
export type IdentityMode = "ACCOUNT_X" | "DISCLOSED";

export interface Deal {
  id: string;
  issuer: string;
  issuerShort: string;
  status: DealStatus;
  adminLeadId: FirmId;
  coLeadIds: FirmId[];
  defaultBdId: FirmId;
  createdAt: DemoTime;
  /** 発行体・投資家・セールスが、同じ時刻から案件を見られるようになる日時。主幹事は作成時点で見える */
  publicAt: DemoTime;
  orderCutoffAt: DemoTime;
  pricingDate: string;
  paymentDate: string;
  couponPublishAt?: DemoTime; // 予定/実績
  tradeOpenAt?: DemoTime;
  lastUpdateAt: DemoTime;
  trancheIds: string[];
  disclosurePolicy: string; // DEMO / 未実装
  /** InvestorへのAggregate Demand表示方針（未指定はFULL扱い） */
  investorBookVisibility?: InvestorBookVisibility;
  /** Allocationが確定しInvestorへ公開済みか（UI用仮フラグ） */
  allocationPublishedAt?: DemoTime;
  /** 事務主幹事がブックをファイナルクローズした時刻 */
  bookClosedAt?: DemoTime;
}

export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "ACTIVE" | "OUTSIDE GUIDANCE" | "CANCELLED";
export type EntryChannel = "INVESTOR_DIRECT" | "SALES_MANUAL" | "SYNDICATE_MANUAL";
/** 通常と区別する入力。SYSTEM_RECOVERY は強制入力（以後シンジケートのみ操作可） */
export type EntryTag = "EXCEPTION" | "LATE_ENTRY" | "SYSTEM_RECOVERY";

/** Raw Submission: 投資家が各証券会社へ伝えた注文そのもの */
export interface Submission {
  id: string;
  receivedByFirm: FirmId;
  amountBn: number;
  type: OrderType;
  limitBp?: number;
  /** Investorから受領した時刻 */
  receivedAt: DemoTime;
  /** システムへ入力した時刻（投資家直接の場合は受領時刻と同一） */
  enteredAt?: DemoTime;
  channel: EntryChannel;
  /** セールス入力した担当者。担当外の投資家でも、入力した本人の一覧に残す */
  enteredByPersonId?: string;
  entryTag?: EntryTag;
  /** Exceptional Entry等の理由 */
  reason?: string;
  /** セールスまたはシンジケートが、この受注に付けたコメント */
  comment?: string;
  /** 統合前に、この受注が属していた投資家。解除するとこちらへ戻す */
  originInvestorId?: string;
  /** 受信したままのソース投資家。解決後も上書きしない */
  rawSourceInvestorId?: string;
  rawSourceInvestorName?: string;
  resolvedMasterInvestorId?: string;
}

export interface OrderHistoryEntry {
  at: DemoTime;
  change: string;
}

/** Canonical Order: Global Investor単位に正規化した1件の需要 */
export interface CanonicalOrder {
  id: string;
  trancheId: string;
  globalInvestorId: string; // "GI-0001"
  investorName: string; // 架空名（実名相当）
  /** @deprecated 表示は accountXLabel() で動的生成。互換のため残置 */
  maskedLabel: string;
  /**
   * ACCOUNT_X（既定）: 実名はB&D証券のみ。他証券・Issuerは アカウントX（●証券n）。
   * DISCLOSED: 主幹事全社およびIssuerに実名を開示。
   */
  identityMode?: IdentityMode;
  amountBn: number;
  type: OrderType;
  limitBp?: number;
  initialType: OrderType;
  initialLimitBp?: number;
  marketizedAt?: DemoTime;
  firstReceivedAt: DemoTime;
  lastUpdatedAt: DemoTime;
  status: OrderStatus;
  bdFirmId: FirmId;
  /**
   * Investorが注文を出した先の証券会社（複数・既定は主幹事全社）。B&D（受渡先）とは別概念。
   * 未指定の場合はSubmissionを受けた証券会社から導出する（placedWithFirms()を使う）。
   */
  placedWithFirmIds?: FirmId[];
  submissions: Submission[];
  /**
   * 受注の全版。同一証券会社が金額を上書きしても過去分を残す。
   * 現在値は submissions（証券会社ごと最新1件）。未設定なら submissions を経過とみなす。
   */
  entryLog?: Submission[];
  history: OrderHistoryEntry[];
  attentionNote?: string;
  /** Investorが入力したComment */
  comment?: string;
  /** 強制入力後。この投資家のオーダーは、入力した証券会社のシンジケートだけが操作できる */
  syndicateOnly?: boolean;
  /** 別名義のオーダーを、この投資家へ手動統合した記録 */
  mergedFrom?: { investorId: string; investorName: string; at: DemoTime }[];
  /** このオーダーは別の投資家へ統合され、ブックの集計から外れている */
  mergedIntoId?: string;
  /** オーダーごと別の投資家IDへ付け替えたとき、戻す先 */
  originInvestorId?: string;
  /** 受信時のソース投資家。正式統合してもこの保存値は残す */
  rawSourceInvestorId?: string;
  rawSourceInvestorName?: string;
  /** 受注時点で解決したマスター。表示時は統合関係をさらに辿る */
  resolvedMasterInvestorId?: string;
}

/** Investorへ公開されたAllocation（Tranche × Global Investor）。デモ */
export interface Allocation {
  trancheId: string;
  globalInvestorId: string;
  finalOrderBn: number;
  allocationBn: number;
}

/** Investor↔証券会社のChat（Investor Inquiry）は廃止。Investorはプラットフォーム上でChatに参加しない。 */
export type RoomType = "SYNDICATE" | "UNDERWRITING" | "ISSUER_LM" | "DOCUMENTATION";

export interface Attachment {
  name: string;
  size: string;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderOrg: string; // 会社名 / 発行体
  senderRole: string; // Syndication 等
  at: DemoTime;
  text: string;
  mentions?: string[];
  mentionsMe?: boolean;
  attachments?: Attachment[];
  pinned?: boolean;
  important?: boolean;
  edited?: boolean;
  isSelf?: boolean;
  /** チャットからは消す。原文は削除した会社の監査だけに残す */
  deletedAt?: DemoTime;
  deletedBy?: string;
  /** 証券会社ID、または発行体なら issuer:名称。この組織の人だけが監査で原文を見る */
  deletedByOrg?: string;
  /** 送信したログイン主体。画面の自分判定に使う */
  senderActorId?: string;
}

export interface ChatRoom {
  id: string;
  dealId: string;
  type: RoomType;
  name: string;
  participantsSummary: string;
  unread: number;
  mentions: number;
  messages: ChatMessage[];
}
