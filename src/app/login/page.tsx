"use client";

import { useState } from "react";
import { FIRMS } from "@/data/demoData";
import { ALL_ISSUERS, INVESTOR_MASTER, SYNDICATION_FIRM_IDS } from "@/data/demoRoles";
import { SALES_PEOPLE } from "@/lib/coverage";
import { DESK_PEOPLE } from "@/lib/desk";
import { dashboardPath, type Role } from "@/lib/roles";

export default function LoginPage() {
  const [actorId, setActorId] = useState("syn:alpha");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorId, password }) });
    const body = (await res.json().catch(() => undefined)) as { error?: string; actor?: { role: Role } } | undefined;
    if (!res.ok || !body?.actor) {
      setBusy(false);
      setError(body?.error ?? "ログインできません");
      return;
    }
    window.location.href = dashboardPath(body.actor.role);
  };

  return (
    <div className="h-full grid place-items-center bg-[#16202c] p-6">
      <form
        className="w-full max-w-md rounded-sm bg-white p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="text-[16px] font-semibold">プライマリーボンド</h1>
        <p className="mt-1 text-[12px] text-[var(--color-ink-2)]">案件・オーダー・配分・チャットは、このサーバに保存されます。練習用のパスワードは pbond です。ログインしたあとも、画面上で人を切り替えられます。</p>
        <label className="mt-4 block text-[12px]">
          人
          <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="mt-1 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5" data-testid="login-actor">
            <optgroup label="シンジケート">
              {SYNDICATION_FIRM_IDS.map((id) => <option key={id} value={`syn:${id}`}>{FIRMS[id].name}</option>)}
            </optgroup>
            <optgroup label="セールス">
              {SALES_PEOPLE.map((p) => <option key={p.id} value={`sales:${p.id}`}>{FIRMS[p.firmId].short} {p.name}</option>)}
            </optgroup>
            <optgroup label="引受">
              {DESK_PEOPLE.filter((p) => p.desk === "UNDERWRITING").map((p) => <option key={p.id} value={`uw:${p.id}`}>{FIRMS[p.firmId].short} {p.name}</option>)}
            </optgroup>
            <optgroup label="ドキュメント">
              {DESK_PEOPLE.filter((p) => p.desk === "DOCUMENTATION").map((p) => <option key={p.id} value={`doc:${p.id}`}>{FIRMS[p.firmId].short} {p.name}</option>)}
            </optgroup>
            <optgroup label="監査人">
              {SYNDICATION_FIRM_IDS.map((id) => <option key={`aud-${id}`} value={`aud:${id}`}>{FIRMS[id].name}</option>)}
            </optgroup>
            <optgroup label="投資家">
              {INVESTOR_MASTER.map((p) => <option key={p.id} value={`inv:${p.id}`}>{p.name}</option>)}
            </optgroup>
            <optgroup label="発行体">
              {ALL_ISSUERS.map((p) => <option key={p.issuer} value={`iss:${p.issuer}`}>{p.short}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="mt-3 block text-[12px]">
          パスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border border-[var(--color-line)] rounded-sm px-2 py-1.5" data-testid="login-password" autoComplete="current-password" />
        </label>
        {error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-50" data-testid="login-submit">
          ログイン
        </button>
      </form>
    </div>
  );
}
