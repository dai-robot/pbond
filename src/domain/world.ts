import { SEED_COVERAGE, type CoverageAssignment } from "../lib/coverage.ts";
import { DEMO_NOW_BASE } from "../lib/fmt.ts";
import { seedSnapshot, type InvestorMasterSnapshot } from "../lib/investorMasterModel.ts";
import type { InvestorLink } from "../lib/investorLinks.ts";
import type { ChatRoom, Deal, FirmId, RoomType, Tranche } from "../lib/types.ts";
import type { InvestorPersona } from "../data/demoRoles.ts";
import type { TrancheAllocation } from "../lib/allocation.ts";
import type { CanonicalOrder } from "../lib/types.ts";

export interface AccountXInvestor {
  id: string;
  firmId: FirmId;
  name: string;
}

export interface FirmAlias {
  firmId: FirmId;
  investorId: string;
  name: string;
}

export interface OrderBook {
  orders: CanonicalOrder[];
  accountX: AccountXInvestor[];
  seq: number;
  acknowledged: string[];
  acknowledgedAt: Record<string, string>;
  tradeAccepted: string[];
  tradeAcceptedAt: Record<string, string>;
}

export interface InvestorBook {
  added: InvestorPersona[];
  links: InvestorLink[];
  aliases: FirmAlias[];
  snap: InvestorMasterSnapshot;
}

/** サーバが持つ台帳。画面はこの写しを見る。 */
export interface World {
  now: string;
  deals: Deal[];
  tranches: Tranche[];
  rooms: ChatRoom[];
  orders: OrderBook;
  allocations: TrancheAllocation[];
  investors: InvestorBook;
  coverage: CoverageAssignment[];
  /** dealId -> personId -> 参加できるチャット */
  grants: Record<string, Record<string, RoomType[]>>;
  /** actorId -> 既読にした部屋 */
  reads: Record<string, string[]>;
}

export function emptyWorld(): World {
  return {
    now: DEMO_NOW_BASE,
    deals: [],
    tranches: [],
    rooms: [],
    orders: { orders: [], accountX: [], seq: 0, acknowledged: [], acknowledgedAt: {}, tradeAccepted: [], tradeAcceptedAt: {} },
    allocations: [],
    investors: { added: [], links: [], aliases: [], snap: seedSnapshot() },
    coverage: SEED_COVERAGE,
    grants: {},
    reads: {},
  };
}
