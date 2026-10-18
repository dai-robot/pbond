export function NotImplementedTab({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="p-4 max-w-3xl">
      <div className="panel px-4 py-3 border-dashed">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-[14px]">{title}</h2>
          <span className="text-[10px] px-1.5 py-px rounded-sm bg-slate-100 border border-slate-300 text-slate-600 font-semibold tracking-wide">試作 / 未実装</span>
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">この画面は今回のファーストドラフトでは実装対象外。仕様上の位置づけのみ記載。</p>
        <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-ink-2)] list-disc pl-5">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
