"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { FirmOrderInput, InvestorOrderInput, OrderPatch } from "@/domain/orders";
import type { AccountXInvestor } from "@/domain/world";
import type { CanonicalOrder, FirmId } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

export type { FirmOrderInput, OrderPatch };

interface OrderState {
  orders: CanonicalOrder[];
  ordersOf: (trancheId: string) => CanonicalOrder[];
  accountXInvestors: AccountXInvestor[];
  addAccountX: (firmId: FirmId) => AccountXInvestor;
  updateOrder: (orderId: string, patch: OrderPatch) => void;
  cancelOrder: (orderId: string, actor?: string) => void;
  createOrder: (trancheId: string, investorId: string, input: InvestorOrderInput) => void;
  createFirmOrder: (trancheId: string, enteredByFirm: FirmId, input: FirmOrderInput) => void;
  mergeOrders: (keepId: string, absorbId: string) => void;
  acknowledged: Set<string>;
  acknowledge: (key: string) => void;
  acknowledgedAt: Record<string, string>;
  tradeAccepted: Set<string>;
  acceptTrade: (key: string) => void;
  tradeAcceptedAt: Record<string, string>;
}

const Ctx = createContext<OrderState | null>(null);

/** オーダー台帳。誰が何をできるかはサーバが判定する。 */
export function OrderStateProvider({ children }: { children: ReactNode }) {
  const { world, commit } = useWorkspace();
  const orders = world.orders.orders;
  const ordersOf = useCallback((trancheId: string) => orders.filter((o) => o.trancheId === trancheId), [orders]);
  const acknowledged = useMemo(() => new Set(world.orders.acknowledged), [world.orders.acknowledged]);
  const tradeAccepted = useMemo(() => new Set(world.orders.tradeAccepted), [world.orders.tradeAccepted]);
  const addAccountX = useCallback((firmId: FirmId) => {
    void firmId;
    const result = commit({ type: "addAccountX" });
    if (!result.ok || !result.value) throw new Error(result.ok ? "アカウントXを追加できません" : result.error);
    return result.value as AccountXInvestor;
  }, [commit]);
  const updateOrder = useCallback((orderId: string, patch: OrderPatch) => {
    commit({ type: "updateOrder", orderId, patch });
  }, [commit]);
  const cancelOrder = useCallback((orderId: string, _actor?: string) => {
    commit({ type: "cancelOrder", orderId });
  }, [commit]);
  const createOrder = useCallback((trancheId: string, _investorId: string, input: InvestorOrderInput) => {
    commit({ type: "createOrder", trancheId, input });
  }, [commit]);
  const createFirmOrder = useCallback((trancheId: string, _enteredByFirm: FirmId, input: FirmOrderInput) => {
    commit({ type: "createFirmOrder", trancheId, input });
  }, [commit]);
  const mergeOrders = useCallback((keepId: string, absorbId: string) => {
    commit({ type: "mergeOrders", keepId, absorbId });
  }, [commit]);
  const acknowledge = useCallback((key: string) => {
    commit({ type: "acknowledge", key });
  }, [commit]);
  const acceptTrade = useCallback((key: string) => {
    commit({ type: "acceptTrade", key });
  }, [commit]);
  const value = useMemo<OrderState>(() => ({
    orders,
    ordersOf,
    accountXInvestors: world.orders.accountX,
    addAccountX,
    updateOrder,
    cancelOrder,
    createOrder,
    createFirmOrder,
    mergeOrders,
    acknowledged,
    acknowledge,
    acknowledgedAt: world.orders.acknowledgedAt,
    tradeAccepted,
    acceptTrade,
    tradeAcceptedAt: world.orders.tradeAcceptedAt,
  }), [orders, ordersOf, world.orders.accountX, world.orders.acknowledgedAt, world.orders.tradeAcceptedAt, addAccountX, updateOrder, cancelOrder, createOrder, createFirmOrder, mergeOrders, acknowledged, acknowledge, tradeAccepted, acceptTrade]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrderState() {
  const value = useContext(Ctx);
  if (!value) throw new Error("OrderStateProvider missing");
  return value;
}
