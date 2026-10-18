"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FIRM_LIST } from "@/data/demoData";
import { CREATABLE_ISSUERS } from "@/data/demoRoles";
import { DEMO_NOW } from "@/lib/fmt";
import type { FirmId } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";

const TENORS = ["3年", "5年", "7年", "10年", "20年"];

function toDemo(local: string) {
  return local.replace("T", " ").slice(0, 16);
}
function toLocal(demo: string) {
  const [d, t] = demo.split(" ");
  return `${d}T${(t ?? "09:00").slice(0, 5)}`;
}

/**
 * 事務主幹事による案件作成。
 * 発行体・共同主幹事・日付・ガイダンス幅を決めて、すぐブックを開ける。
 */
export function CreateDealForm({ onClose }: { onClose: () => void }) {
  const { firmId } = useViewer();
  const { createDeal } = useDealCatalog();
  const router = useRouter();
  const [issuerName, setIssuerName] = useState(CREATABLE_ISSUERS[0]?.issuer ?? "");
  const [issuerShort, setIssuerShort] = useState(CREATABLE_ISSUERS[0]?.short ?? "");
  const [coLeads, setCoLeads] = useState<FirmId[]>([]);
  const [tenorRows, setTenorRows] = useState(() =>
    TENORS.map((t, i) => ({ tenor: t, on: t === "5年", amount: t === "5年" ? "300" : "100", low: String(10 + i * 2), high: String(20 + i * 2) })),
  );
  const [publicAt, setPublicAt] = useState(toLocal(DEMO_NOW));
  const [orderCutoffAt, setOrderCutoffAt] = useState(toLocal("2026-09-30 11:00"));
  const [pricingDate, setPricingDate] = useState("2026-09-30");
  const [paymentDate, setPaymentDate] = useState("2026-10-07");
  const [error, setError] = useState<string | null>(null);

  const otherFirms = useMemo(() => FIRM_LIST.filter((f) => f.id !== firmId), [firmId]);
  const admin = FIRM_LIST.find((f) => f.id === firmId);

  const pickIssuer = (name: string) => {
    setIssuerName(name);
    const known = CREATABLE_ISSUERS.find((i) => i.issuer === name);
    if (known) setIssuerShort(known.short);
  };

  const toggleCo = (id: FirmId) => {
    setCoLeads((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = () => {
    const name = issuerName.trim();
    const short = issuerShort.trim() || name;
    const picked = tenorRows.filter((r) => r.on).map((r) => ({ tenorLabel: r.tenor, amountOku: Number(r.amount), guidanceLowBp: Number(r.low), guidanceHighBp: Number(r.high) }));
    if (!name) return setError("発行体名を入力してください");
    if (coLeads.length === 0) return setError("共同主幹事を1社以上選んでください");
    if (picked.length === 0 || picked.some((r) => !Number.isFinite(r.amountOku) || r.amountOku <= 0)) return setError("年限を1つ以上選び、発行額（億円）を入力してください");
    if (picked.some((r) => !Number.isFinite(r.guidanceLowBp) || !Number.isFinite(r.guidanceHighBp) || r.guidanceLowBp > r.guidanceHighBp)) return setError("年限ごとに、ガイダンス幅は下限 ≤ 上限にしてください");
    const published = toDemo(publicAt);
    const cutoff = toDemo(orderCutoffAt);
    if (published.length < 16 || cutoff.length < 16) return setError("日時を入力してください");
    if (!pricingDate || !paymentDate) return setError("条件決定日と払込日を入力してください");
    if (paymentDate < pricingDate) return setError("払込日は条件決定日以降にしてください");

    const deal = createDeal(firmId, {
      issuer: name,
      issuerShort: short,
      coLeadIds: coLeads,
      tenorLabel: picked[0].tenorLabel,
      amountOku: picked[0].amountOku,
      tranches: picked,
      publicAt: published,
      orderCutoffAt: cutoff,
      pricingDate,
      paymentDate,
      guidanceLowBp: picked[0].guidanceLowBp,
      guidanceHighBp: picked[0].guidanceHighBp,
    });
    router.push(`/deals/${deal.id}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="create-deal-title" data-testid="create-deal-dialog">
      <div className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-sm border border-[var(--color-line)] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5">
          <div>
            <h2 id="create-deal-title" className="text-[14px] font-semibold">
              案件作成
            </h2>
            <p className="text-[11px] text-[var(--color-ink-3)]">事務主幹事（{admin?.short}）が発行体・共同主幹事・日付・ガイダンス幅を決めます。作った案件と銘柄は、主幹事にはすぐに表示されます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[12px] text-[var(--color-ink-2)] hover:underline">
            閉じる
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 text-[12px]">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">発行体</span>
              <input
                list="issuer-catalog"
                value={issuerName}
                onChange={(e) => pickIssuer(e.target.value)}
                className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white"
                data-testid="create-deal-issuer"
              />
              <datalist id="issuer-catalog">
                {CREATABLE_ISSUERS.map((i) => (
                  <option key={i.issuer} value={i.issuer} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">略称</span>
              <input value={issuerShort} onChange={(e) => setIssuerShort(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white" data-testid="create-deal-short" />
            </label>
          </div>

          <fieldset>
            <legend className="text-[11px] font-semibold text-[var(--color-ink-3)]">共同主幹事</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {otherFirms.map((f) => {
                const on = coLeads.includes(f.id);
                return (
                  <label key={f.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border cursor-pointer ${on ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-line)] bg-white"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleCo(f.id)} className="accent-[var(--color-accent)]" data-testid={`create-deal-colead-${f.id}`} />
                    <span className="font-semibold">{f.short}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-semibold text-[var(--color-ink-3)]">年限（複数可）</legend>
            <div className="mt-1 space-y-1" data-testid="create-deal-tenors">
              {tenorRows.map((r) => (
                <div key={r.tenor} className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 w-20 text-[12px] font-semibold">
                    <input
                      type="checkbox"
                      checked={r.on}
                      onChange={() => setTenorRows((prev) => prev.map((x) => (x.tenor === r.tenor ? { ...x, on: !x.on } : x)))}
                      className="accent-[var(--color-accent)]"
                      data-testid={`create-deal-tenor-${r.tenor}`}
                    />
                    {r.tenor}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={!r.on}
                    value={r.amount}
                    onChange={(e) => setTenorRows((prev) => prev.map((x) => (x.tenor === r.tenor ? { ...x, amount: e.target.value } : x)))}
                    className="w-28 border border-[var(--color-line)] rounded-sm px-2 py-1 bg-white disabled:opacity-40"
                    data-testid={`create-deal-amount-${r.tenor}`}
                    aria-label={`${r.tenor}の発行額（億円）`}
                  />
                  <span className="text-[11px] text-[var(--color-ink-3)]">億円</span>
                  <input
                    type="number"
                    step={1}
                    disabled={!r.on}
                    value={r.low}
                    onChange={(e) => setTenorRows((prev) => prev.map((x) => (x.tenor === r.tenor ? { ...x, low: e.target.value } : x)))}
                    className="w-16 border border-[var(--color-line)] rounded-sm px-2 py-1 bg-white disabled:opacity-40"
                    data-testid={`create-deal-low-${r.tenor}`}
                    aria-label={`${r.tenor}のガイダンス下限（bp）`}
                  />
                  <span className="text-[11px] text-[var(--color-ink-3)]">〜</span>
                  <input
                    type="number"
                    step={1}
                    disabled={!r.on}
                    value={r.high}
                    onChange={(e) => setTenorRows((prev) => prev.map((x) => (x.tenor === r.tenor ? { ...x, high: e.target.value } : x)))}
                    className="w-16 border border-[var(--color-line)] rounded-sm px-2 py-1 bg-white disabled:opacity-40"
                    data-testid={`create-deal-high-${r.tenor}`}
                    aria-label={`${r.tenor}のガイダンス上限（bp）`}
                  />
                  <span className="text-[11px] text-[var(--color-ink-3)]">bp</span>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">発行体・投資家・セールスへの公開</span>
              <input type="datetime-local" value={publicAt} onChange={(e) => setPublicAt(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white" data-testid="create-deal-public" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">オーダー締切</span>
              <input type="datetime-local" value={orderCutoffAt} onChange={(e) => setOrderCutoffAt(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white" data-testid="create-deal-cutoff" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">条件決定日</span>
              <input type="date" value={pricingDate} onChange={(e) => setPricingDate(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[var(--color-ink-3)]">払込日</span>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5 bg-white" />
            </label>
          </div>

          <p className="text-[11px] text-[var(--color-ink-3)]">発行体・投資家・セールスは、この時刻から同時に案件を見ます。主幹事のあいだでは、作成した時点で見られます。</p>

          {error && (
            <div className="rounded-sm border border-red-300 bg-red-50 px-2.5 py-1.5 text-red-800 text-[11.5px]" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-4 py-2.5">
          <button type="button" onClick={onClose} className="px-3 py-1 text-[12px] text-[var(--color-ink-2)] hover:underline">
            キャンセル
          </button>
          <button type="button" onClick={submit} className="px-3 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold hover:opacity-90" data-testid="create-deal-submit">
            作成する
          </button>
        </div>
      </div>
    </div>
  );
}
