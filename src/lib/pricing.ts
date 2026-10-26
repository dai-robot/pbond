/**
 * プライシング（デモ）
 * スプレッドはマーケティングで決まった一つの値。
 * 行ごとに変わるのは国債単利で、0.005%刻み。複利は単利から計算する。
 * 国債単利を年2回複利の実効利回りに直し、小数第4位以下は切り捨てる。
 * 債券理論値 = その複利 + スプレッド。単価100円なので、クーポンと債券の単利・複利は理論値と同じ。
 */

export function jgbCompoundPct(simplePct: number) {
  const effective = ((1 + simplePct / 200) ** 2 - 1) * 100;
  return Math.floor(effective * 1000 + 1e-9) / 1000;
}

export interface PricingRow {
  jgbSimplePct: number;
  jgbCompoundPct: number;
  theoreticalPct: number;
  couponPct: number;
  priceYen: number;
  bondSimplePct: number;
  bondCompoundPct: number;
}

/** 国債単利は 0.005% 刻み。スプレッドは整数 bp。表の1行をサーバが同じ式で作り直す。 */
export function pricingRow(jgbSimplePct: number, spreadBp: number): PricingRow | undefined {
  if (!Number.isFinite(jgbSimplePct) || !Number.isFinite(spreadBp) || !Number.isInteger(spreadBp)) return undefined;
  const milli = Math.round(jgbSimplePct * 1000);
  if (Math.abs(jgbSimplePct * 1000 - milli) > 1e-6 || milli % 5 !== 0) return undefined;
  const jgbCompound = jgbCompoundPct(milli / 1000);
  const theoretical = Math.round((jgbCompound + spreadBp / 100) * 1000) / 1000;
  return {
    jgbSimplePct: milli / 1000,
    jgbCompoundPct: jgbCompound,
    theoreticalPct: theoretical,
    couponPct: theoretical,
    priceYen: 100,
    bondSimplePct: theoretical,
    bondCompoundPct: theoretical,
  };
}

/** 中心の国債単利から、上下へ 0.005% ずつ。既定は上下10段。 */
export function pricingByJgb(centerSimplePct: number, spreadBp: number, steps = 10): PricingRow[] {
  const centerMilli = Math.round(centerSimplePct * 1000);
  const snapped = centerMilli - (((centerMilli % 5) + 5) % 5);
  const spread = Math.round(spreadBp);
  const rows: PricingRow[] = [];
  for (let i = -steps; i <= steps; i++) {
    const row = pricingRow((snapped + i * 5) / 1000, spread);
    if (row) rows.push(row);
  }
  return rows;
}
