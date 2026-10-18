import type { DemoTime } from "./types.ts";

/** 実験の基準時刻（JST）。画面の「戻す」でここへ戻る。 */
export const DEMO_NOW_BASE: DemoTime = "2026-09-23 19:00";

/** 画面上の現在時刻。実験用に setDemoNow で動かす。グラフや締切の判定はここを見る。 */
export let DEMO_NOW: DemoTime = DEMO_NOW_BASE;

export function setDemoNow(next: DemoTime) {
  DEMO_NOW = next;
}

/** 描画のたびに今の実験時刻を読む。import した DEMO_NOW のコピーを使わない。 */
export function demoNow() {
  return DEMO_NOW;
}

export function shiftDemoDays(days: number, from: DemoTime = DEMO_NOW): DemoTime {
  const [date, time] = from.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.toISOString().slice(0, 10)} ${time || "00:00"}`;
}

export function todayOf(t: DemoTime) {
  return t.slice(0, 10);
}

/** "2026-09-15 09:12" → 同日なら "09:12"、別日なら "9/14 19:30" */
export function fmtTime(t: DemoTime | undefined, opts?: { always?: boolean }) {
  if (!t) return "—";
  const [date, time] = t.split(" ");
  if (!opts?.always && date === todayOf(DEMO_NOW)) return time;
  const [, m, d] = date.split("-");
  const md = `${Number(m)}/${Number(d)}`;
  return time ? `${md} ${time}` : md;
}

/** "2026-09-17" → "9/17 (木)" */
export function fmtDate(d: string | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${m}/${day} (${dow})`;
}

export function fmtDateFull(d: string | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${y}/${m}/${day}`;
}

/** 金額の単位は1億円。整数は小数を出さない。 */
export function fmtBn(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  const text = Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.0+$/, "");
  return `${text}億円`;
}

export function fmtBp(v: number | undefined) {
  if (v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v}bp`;
}

export function fmtPct(v: number | undefined, digits = 2) {
  if (v === undefined) return "—";
  return `${v.toFixed(digits)}%`;
}

export function fmtCoverage(v: number | null) {
  if (v === null) return "—";
  return `${v.toFixed(2)}x`;
}

/** 現在時刻からの残り時間（分単位） */
function toMinutes(t: DemoTime) {
  const [date, time] = t.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60000;
}

export function minutesUntil(t: DemoTime) {
  return toMinutes(t) - toMinutes(DEMO_NOW);
}

export function fmtRemaining(t: DemoTime) {
  const min = minutesUntil(t);
  if (min < 0) return "経過";
  if (min < 60) return `あと${min}分`;
  if (min < 60 * 24) return `あと${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}`;
  return `あと${Math.floor(min / 60 / 24)}日`;
}

export function isPast(t: DemoTime) {
  return t <= DEMO_NOW;
}
