import { demoNow, isPast, todayOf } from "@/lib/fmt";
import type { ComparatorKind, Guidance, Tranche } from "@/lib/types";

/**
 * 流通比較（デモ）
 * 軸は左の1本。レンジは棒、統計値は赤い四角、取引値は青い四角。
 * tranche.comparator.points があればそれを使い、空なら仮の数字を置く。
 * 仮の数字は、あとからアップロードした点に差し替える。
 */

const CURVE: [number, number][] = [
  [1, 6],
  [2, 8.5],
  [3, 11],
  [5, 17],
  [7, 22],
  [10, 27],
  [15, 33],
  [20, 39],
  [30, 46],
];

const STAT: ComparatorKind = "日証協_REF";
const TRADE: ComparatorKind = "ACTUAL_TRADE";

function yearsOf(label: string) {
  const m = label.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 5;
}

function levelAt(years: number) {
  if (years <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i - 1];
    const [x1, y1] = CURVE[i];
    if (years <= x1) return y0 + ((years - x0) / (x1 - x0)) * (y1 - y0);
  }
  return CURVE[CURVE.length - 1][1];
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function wobble(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.8;
}

function bpText(v: number) {
  const rounded = Math.round(v * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `+${body}`;
}

function ticks(min: number, max: number) {
  const span = Math.max(0.5, max - min);
  const raw = span / 4;
  const nice = raw <= 0.8 ? 0.5 : raw <= 2 ? 1 : raw <= 5 ? 2 : raw <= 10 ? 5 : 10;
  const start = Math.ceil((min + 1e-6) / nice) * nice;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-6; v += nice) out.push(Math.round(v * 10) / 10);
  return out;
}

function hhmm(at: string) {
  return (at.split(" ")[1] ?? "00:00").slice(0, 5);
}

type RangeSegment = {
  id: string;
  date: string;
  guidance?: Guidance;
  future: boolean;
  /** 同じ日に複数のレンジがあるとき、その棒が始まる時刻 */
  timeLabel?: string;
};

/**
 * 棒は設定した時刻から。同じ日の別時刻は別の棒。
 * 前日までのレンジは次の時刻まで残すが、00時は誰も設定していないので時刻としては出さない。
 * 図の左端は公開時刻。作成時刻がそれより前でも、最初の棒は公開時刻に置く。
 */
function rangeSegments(days: string[], guidances: Guidance[], today: string, now: string): RangeSegment[] {
  const dateOf = (g: Guidance) => g.effectiveAt.slice(0, 10);
  const out: RangeSegment[] = [];
  const firstAt = guidances[0]?.effectiveAt;
  for (const date of days) {
    if (firstAt && date < dateOf({ effectiveAt: firstAt } as Guidance)) continue;
    const starting = guidances.filter((g) => dateOf(g) === date);
    const carried = [...guidances].reverse().find((g) => g.effectiveAt < `${date} 00:00`);
    if (starting.length === 0) {
      const beforeFirst = !firstAt || `${date} 23:59` < firstAt;
      out.push({ id: date, date, guidance: date > today || beforeFirst ? undefined : carried, future: date > today });
      continue;
    }
    const pieces: { g?: Guidance; time?: string; startAt: string }[] = [];
    const changeAt = starting[0].effectiveAt;
    if (carried && changeAt > `${date} 00:00`) {
      pieces.push({ g: carried, startAt: `${date} 00:00` });
    }
    for (const g of starting) pieces.push({ g, time: hhmm(g.effectiveAt), startAt: g.effectiveAt });
    pieces.forEach((p, i) => {
      out.push({
        id: p.g ? `${date}-${p.g.id}-${i}` : `${date}-before`,
        date,
        guidance: p.g,
        future: !!p.g && p.startAt > now,
        timeLabel: p.time,
      });
    });
  }
  return out;
}

function isoDate(raw: string, year: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return undefined;
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function SecondaryComparator({ tranche, guidance, cutoffAt, publicAt, pricingDate: pricingOn, includePending = false }: { tranche: Tranche; guidance?: Guidance; cutoffAt?: string; publicAt?: string; pricingDate?: string; includePending?: boolean }) {
  const today = todayOf(demoNow());
  const year = today.slice(0, 4);
  const years = yearsOf(tranche.tenorLabel);
  const level = levelAt(years);
  const now = demoNow();
  const ordered = [...tranche.guidances].filter((g) => includePending || isPast(g.effectiveAt)).sort((a, b) => (a.effectiveAt < b.effectiveAt ? -1 : a.effectiveAt > b.effectiveAt ? 1 : a.day - b.day));
  const opening = publicAt ? [...ordered].reverse().find((g) => g.effectiveAt < publicAt) : undefined;
  const guidances = publicAt
    ? [...(opening ? [{ ...opening, effectiveAt: publicAt }] : []), ...ordered.filter((g) => g.effectiveAt >= publicAt)]
    : ordered;
  const dateOf = (g: Guidance) => g.effectiveAt.slice(0, 10);
  const start = guidances[0] ? dateOf(guidances[0]) : today;
  const lastSet = guidances.length ? dateOf(guidances[guidances.length - 1]) : today;
  const cutoffDate = cutoffAt?.slice(0, 10);
  const pricingDate = pricingOn?.slice(0, 10);
  const padded = addDays(lastSet > today ? lastSet : today, 7);
  const end = [cutoffDate, pricingDate].reduce((later, date) => (date && date > later ? date : later), padded);
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 40; d = addDays(d, 1)) days.push(d);
  const segments = rangeSegments(days, guidances, today, now);

  const uploaded = tranche.comparator.points.flatMap((p) => {
    const date = isoDate(p.date, year);
    return date && days.includes(date) ? [{ date, spreadBp: p.spreadBp, kind: p.kind }] : [];
  });
  const observed = days.filter((d) => d <= today);
  const placeholder = observed.flatMap((date, i) => {
    const stat = Math.round((level + wobble(i, 2.1)) * 10) / 10;
    const rows = [{ date, spreadBp: stat, kind: STAT }];
    if (i % 2 === 0) rows.push({ date, spreadBp: Math.round((stat + (i % 4 === 0 ? 0.8 : -0.6)) * 10) / 10, kind: TRADE });
    return rows;
  });
  const marks = uploaded.length > 0 ? uploaded : placeholder;
  const usingPlaceholder = uploaded.length === 0;
  const stats = marks.filter((p) => p.kind === STAT);
  const trades = marks.filter((p) => p.kind === TRADE);

  const vals = marks.map((p) => p.spreadBp).concat(guidances.flatMap((g) => [g.lowBp, g.highBp]));
  const minY = (vals.length ? Math.min(...vals) : 0) - 2;
  const maxY = (vals.length ? Math.max(...vals) : 20) + 4;

  const W = 640;
  const H = 228;
  const padL = 38;
  const padR = 16;
  const padT = 18;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / Math.max(1, segments.length);
  const xAt = (i: number) => padL + (i + 0.5) * slot;
  const dayCenter = (date: string, withGuidance = false) => {
    const idxs = segments.flatMap((s, i) => (s.date === date && (!withGuidance || s.guidance) ? [i] : []));
    if (idxs.length === 0) return undefined;
    return padL + ((idxs[0] + idxs[idxs.length - 1]) / 2 + 0.5) * slot;
  };
  const barW = Math.max(8, Math.min(36, slot * 0.72));
  const y = (v: number) => padT + (1 - (v - minY) / Math.max(0.5, maxY - minY)) * plotH;
  const futureIndex = segments.findIndex((s) => s.future);
  const sq = 7;

  const labelDates = days.filter((d, i) => days.length <= 12 || i === 0 || i === days.length - 1 || d === today || d === cutoffDate || d === pricingDate || guidances.some((g) => dateOf(g) === d));
  const shownLabels: string[] = [];
  for (const d of labelDates) {
    const at = dayCenter(d);
    const prev = shownLabels.at(-1);
    const prevAt = prev ? dayCenter(prev) : undefined;
    if (at === undefined || (prevAt !== undefined && Math.abs(at - prevAt) < 28)) continue;
    shownLabels.push(d);
  }

  return (
    <div data-testid="secondary-comparator">
      <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-[var(--color-ink-2)]">
        <span className="font-medium text-[var(--color-ink)]">{tranche.tenorLabel}の流通比較</span>
        <span className="ml-auto text-[var(--color-ink-3)]">{usingPlaceholder ? "統計値・取引値は仮" : tranche.comparator.instrumentLabel}　データ時点 {today.slice(5).replace("-", "/")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-1" role="img" aria-label="流通比較の図">
        {futureIndex >= 0 && <rect x={padL + futureIndex * slot} y={padT} width={Math.max(0, plotW - futureIndex * slot)} height={plotH} fill="#f4f7fa" />}
        {ticks(minY, maxY).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e9edf2" />
            <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize={9.5} fill="#6b7685">
              {bpText(v)}
            </text>
          </g>
        ))}
        {segments.map((seg, i) => {
          const g = seg.guidance;
          if (!g) return null;
          const top = y(g.highBp);
          const bot = y(g.lowBp);
          const label = g.lowBp === g.highBp ? bpText(g.lowBp) : `${bpText(g.lowBp)}〜${g.highBp}`;
          const when = seg.timeLabel ? ` ${seg.timeLabel}` : "";
          const firstOfRange = segments.findIndex((s) => s.guidance?.id === g.id) === i;
          return (
            <g key={seg.id} data-testid={`range-bar-${seg.id}`}>
              <rect x={xAt(i) - barW / 2} y={top} width={barW} height={Math.max(3, bot - top)} fill="#1f3f6e" opacity={seg.future ? 0.28 : guidance?.id === g.id ? 0.55 : 0.32} stroke="#1f3f6e" strokeWidth={1} strokeDasharray={seg.future ? "3 2" : undefined}>
                <title>{`マーケティング ${seg.date.slice(5).replace("-", "/")}${when} ${label}bp${seg.future ? "（予定）" : ""}`}</title>
              </rect>
              {(firstOfRange || seg.timeLabel) && (
                <text x={xAt(i)} y={Math.max(11, top - 4)} textAnchor="middle" fontSize={9} fill="#1f3f6e" fontWeight={700}>
                  {label}
                  {seg.future ? " 予定" : ""}
                </text>
              )}
            </g>
          );
        })}
        {stats.map((p) => {
          const at = dayCenter(p.date, true);
          if (at === undefined) return null;
          return (
            <rect key={`stat-${p.date}-${p.spreadBp}`} data-testid={`stat-${p.date}`} x={at - sq - 1} y={y(p.spreadBp) - sq / 2} width={sq} height={sq} fill="#dc2626">
              <title>{`統計値 ${p.date.slice(5).replace("-", "/")} ${bpText(p.spreadBp)}bp${usingPlaceholder ? "（仮）" : ""}`}</title>
            </rect>
          );
        })}
        {trades.map((p) => {
          const at = dayCenter(p.date, true);
          if (at === undefined) return null;
          return (
            <rect key={`trade-${p.date}-${p.spreadBp}`} data-testid={`trade-${p.date}`} x={at + 1} y={y(p.spreadBp) - sq / 2} width={sq} height={sq} fill="#2563eb">
              <title>{`取引値 ${p.date.slice(5).replace("-", "/")} ${bpText(p.spreadBp)}bp${usingPlaceholder ? "（仮）" : ""}`}</title>
            </rect>
          );
        })}
        {(() => {
          const cutoffX = cutoffDate ? dayCenter(cutoffDate) : undefined;
          const pricingX = pricingDate ? dayCenter(pricingDate) : undefined;
          let cutoffDx = 0;
          let pricingDx = 0;
          let pricingLabelDy = 0;
          if (cutoffX !== undefined && pricingX !== undefined && Math.abs(cutoffX - pricingX) < 48) {
            if (Math.abs(cutoffX - pricingX) < 4) {
              const shift = Math.min(16, slot * 0.3);
              cutoffDx = -shift;
              pricingDx = shift;
            }
            pricingLabelDy = 12;
          }
          return (
            <>
              {cutoffX !== undefined && (
                <g data-testid="cutoff-line">
                  <line x1={cutoffX + cutoffDx} x2={cutoffX + cutoffDx} y1={padT} y2={H - padB} stroke="#dc2626" strokeWidth={1.6} />
                  <text x={cutoffX + cutoffDx} y={padT + 9} textAnchor="middle" fontSize={9} fill="#dc2626" fontWeight={700}>
                    締切
                  </text>
                </g>
              )}
              {pricingX !== undefined && (
                <g data-testid="pricing-line">
                  <line x1={pricingX + pricingDx} x2={pricingX + pricingDx} y1={padT} y2={H - padB} stroke="#7c3aed" strokeWidth={1.6} />
                  <text x={pricingX + pricingDx} y={padT + 9 + pricingLabelDy} textAnchor="middle" fontSize={9} fill="#7c3aed" fontWeight={700}>
                    条件決定
                  </text>
                </g>
              )}
            </>
          );
        })()}
        {segments.map((seg, i) => seg.timeLabel ? (
          <text key={`t-${seg.id}`} x={xAt(i)} y={H - 20} textAnchor="middle" fontSize={8.5} fill="#1f3f6e">
            {seg.timeLabel}
          </text>
        ) : null)}
        {shownLabels.map((d) => (
          <text key={d} x={dayCenter(d)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="#6b7685">
            {`${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[10.5px] text-[var(--color-ink-2)] flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2.5 bg-[#1f3f6e]/50 border border-[#1f3f6e]" />
          マーケティングレンジ
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-[#dc2626]" />
          統計値
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-[#2563eb]" />
          取引値
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-[#dc2626]" />
          オーダー締切
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-[#7c3aed]" />
          条件決定
        </span>
      </div>
      <p className="mt-1 text-[10.5px] text-[var(--color-ink-3)]">
        {usingPlaceholder ? "統計値と取引値は仮の数字です。あとからアップロードして、この図で参照します。" : "統計値と取引値はアップロードした数字です。"}
        最初の棒は、発行体・投資家・セールスへの公開時刻に置きます。同じ日に別の時刻を設定したときだけ、その時刻を出します。右の空欄はこの先の日付です。
      </p>
    </div>
  );
}
