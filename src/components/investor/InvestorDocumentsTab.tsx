"use client";

import { useState } from "react";
import { firmName, firmShort } from "@/lib/deal";
import { fmtBn, fmtDateFull, fmtPct, fmtTime } from "@/lib/fmt";
import { termSheetPublished } from "@/lib/roles";
import type { Deal, Tranche } from "@/lib/types";
import { Panel, Term } from "../Panel";
import { Tag } from "../StatusBadge";

/**
 * 書類（Investor / Issuer共通で利用）
 * タームシートの公開状態と、DEMO用の「View タームシート」（実ファイルなし・条件の要約を表示）。
 */
export function InvestorDocumentsTab({ deal, tranche, audience = "investor" }: { deal: Deal; tranche: Tranche; audience?: "investor" | "issuer" }) {
  const [open, setOpen] = useState(false);
  const published = termSheetPublished(tranche);
  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      <Panel title={`タームシート — ${tranche.tenorLabel}`} tag={published ? <Tag tone="info">公開済</Tag> : <Tag>未公開</Tag>} testId="inv-termsheet">
        {published ? (
          <div className="flex items-center gap-3">
            <div className="text-[12px]">
              <div className="font-semibold">タームシートを公開しました</div>
              <div className="font-mono text-[11px] text-[var(--color-ink-3)]">{fmtTime(tranche.termSheet.publishedAt, { always: true })}</div>
            </div>
            <button onClick={() => setOpen(true)} className="ml-auto px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="view-termsheet">
              タームシートを見る
            </button>
            <button type="button" className="px-3 py-1.5 rounded-sm border border-[var(--color-line)] text-[12px] text-[var(--color-ink-3)]" title="デモ: ファイル保管は未実装">
              ダウンロード（デモ）
            </button>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--color-ink-2)]">
            タームシートは未公開です。条件決定（{fmtDateFull(deal.pricingDate)}）後に証券会社が作成・公開し、公開時に通知が届きます。
          </div>
        )}
        <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">タームシート公開とトレード開始は別です。ファイル保管は未実装（デモ）。</div>
      </Panel>

      <Panel title="その他の書類">
        <ul className="text-[12px] space-y-1">
          <li className="flex items-center gap-2">
            <span className="text-[var(--color-ink-3)]">📄</span>
            <span>マーケティング資料</span>
            <Tag>未実装</Tag>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[var(--color-ink-3)]">📄</span>
            <span>{audience === "issuer" ? "目論見書 / 発行登録追補書類（書類ルームで共有）" : "発行登録追補書類（公開後）"}</span>
            <Tag>未実装</Tag>
          </li>
        </ul>
        <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">文書管理機能は今回未実装。</div>
      </Panel>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="タームシート" data-testid="termsheet-modal">
          <div className="panel w-[520px] shadow-xl">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-center gap-2">
              <h2 className="font-semibold text-[14px]">タームシート（要約・デモ）</h2>
              <Tag tone="demo">デモ</Tag>
              <button onClick={() => setOpen(false)} className="ml-auto text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
                閉じる
              </button>
            </header>
            <div className="px-4 py-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                <Term k="発行体" v={deal.issuer} />
                <Term k="トランシェ / 年限" v={tranche.tenorLabel} />
                <Term k="格付け" v={tranche.rating} />
                <Term k="発行額" v={fmtBn(tranche.amountBn)} />
                <Term k="クーポン" v={tranche.couponPct !== undefined ? fmtPct(tranche.couponPct) : "—"} />
                <Term k="スプレッド" v={tranche.finalSpreadBp !== undefined ? `国債 +${tranche.finalSpreadBp}bp` : "—"} />
                <Term k="参照国債" v={`${tranche.referenceJgb.name} ${fmtPct(tranche.referenceJgb.yieldPct)}`} />
                <Term k="発行価格" v={tranche.pricePct !== undefined ? tranche.pricePct.toFixed(2) : "—"} />
                <Term k="条件決定日" v={fmtDateFull(deal.pricingDate)} />
                <Term k="払込日" v={fmtDateFull(deal.paymentDate)} />
                <Term k="償還日" v={fmtDateFull(tranche.redemptionDate)} />
                <Term k="利払日" v={`${tranche.interestPaymentDates}（${tranche.interestFrequency}）`} />
                <Term k="券面" v={tranche.denomination} />
                <Term k="事務主幹事" v={firmName(deal.adminLeadId)} />
                <Term k="主幹事" v={deal.coLeadIds.map(firmShort).join(" / ")} />
              </dl>
              <div className="mt-3 text-[10.5px] text-[var(--color-ink-3)]">デモ: タームシートのファイルではなく、システム上の確定条件を要約しています。</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
