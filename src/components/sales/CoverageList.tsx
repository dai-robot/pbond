"use client";

import { useState } from "react";
import { FIRMS } from "@/data/demoData";
import { INVESTOR_MASTER } from "@/data/demoRoles";
import { firmAssignments, salesPeopleOf, salesPersonById } from "@/lib/coverage";
import { useSalesCoverage } from "../SalesCoverageContext";
import { Panel } from "../Panel";
import { useViewer } from "../ViewerContext";

/** 投資家と所属証券の担当セールス。他社・投資家・発行体には出さない。 */
export function CoverageList() {
  const { role, firmId } = useViewer();
  const { assignments, assign, unassign } = useSalesCoverage();
  const people = salesPeopleOf(firmId);
  const rows = firmAssignments(assignments, firmId);
  const [investorId, setInvestorId] = useState(INVESTOR_MASTER[0]?.id ?? "");
  const [salesPersonId, setSalesPersonId] = useState(people[0]?.id ?? "");

  if (role !== "SYNDICATION") return null;

  const add = () => {
    if (!investorId || !salesPersonId) return;
    assign(firmId, investorId, salesPersonId);
  };

  return (
    <div className="p-3 max-w-3xl" data-testid="coverage-list">
      <Panel title={`${FIRMS[firmId].name}の担当顧客`} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">この証券会社だけ</span>}>
        <p className="text-[12px] text-[var(--color-ink-2)] leading-relaxed">
          投資家ごとの担当セールスです。このリストは{FIRMS[firmId].name}にしか出しません。担当顧客のオーダーは、シンジケートや投資家本人が入れても、その担当セールスから見えます。
        </p>
        <table className="w-full text-[12px] mt-3">
          <thead>
            <tr className="text-[10px] text-[var(--color-ink-3)]">
              <th className="text-left font-semibold pb-1">投資家</th>
              <th className="text-left font-semibold pb-1">業態</th>
              <th className="text-left font-semibold pb-1">担当セールス</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-[var(--color-ink-3)]">
                  まだ担当はありません。
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const investor = INVESTOR_MASTER.find((p) => p.id === a.investorId);
              const person = salesPersonById(a.salesPersonId);
              return (
                <tr key={a.investorId} className="border-t border-[var(--color-line-2)]" data-testid={`coverage-row-${a.investorId}`}>
                  <td className="py-1.5 font-semibold">{investor?.name ?? a.investorId}</td>
                  <td className="py-1.5">{investor?.segment ?? "—"}</td>
                  <td className="py-1.5">{person?.name ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => unassign(firmId, a.investorId)} className="text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-danger)]" data-testid={`coverage-remove-${a.investorId}`}>
                      外す
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-[var(--color-ink-3)]">
            投資家
            <select value={investorId} onChange={(e) => setInvestorId(e.target.value)} className="mt-0.5 block border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px] text-[var(--color-ink)] bg-white min-w-[180px]" data-testid="coverage-investor">
              {INVESTOR_MASTER.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.segment}）
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-[var(--color-ink-3)]">
            担当セールス
            <select value={salesPersonId} onChange={(e) => setSalesPersonId(e.target.value)} className="mt-0.5 block border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px] text-[var(--color-ink)] bg-white" data-testid="coverage-sales">
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={add} className="px-3 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="coverage-add">
            担当にする
          </button>
        </div>
      </Panel>
    </div>
  );
}
