"use client";

import { salesPeopleOf } from "@/lib/coverage";
import { useViewer } from "../ViewerContext";

export function SalesPersonSelect() {
  const { firmId, salesPersonId, setSalesPersonId } = useViewer();
  const people = salesPeopleOf(firmId);
  return (
    <label className="flex items-center gap-1 text-[11.5px] text-[var(--color-ink-3)]">
      担当セールス
      <select value={people.some((p) => p.id === salesPersonId) ? salesPersonId : (people[0]?.id ?? "")} onChange={(e) => setSalesPersonId(e.target.value)} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 text-[11.5px] text-[var(--color-ink)] bg-white" aria-label="担当セールス" data-testid="sales-person">
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
