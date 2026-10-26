import { projectWorld } from "@/domain/project";
import { readWorld } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** ログイン中の人に見える、確定済みプライシングだけを返す。オーダーやチャットは含めない。 */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { world } = readWorld();
  const shown = projectWorld(world, actor);
  const deals = new Map(shown.deals.map((deal) => [deal.id, deal]));
  const rows = shown.tranches.flatMap((tranche) => {
    const confirmed = tranche.pricingConfirmed;
    const deal = deals.get(tranche.dealId);
    if (!confirmed || !deal) return [];
    return [{
      dealId: deal.id,
      issuer: deal.issuer,
      issuerShort: deal.issuerShort,
      tenorLabel: tranche.tenorLabel,
      at: confirmed.at,
      couponPct: confirmed.couponPct,
      priceYen: confirmed.priceYen,
      bondSimplePct: confirmed.bondSimplePct,
    }];
  });
  return Response.json({ actor: { id: actor.id, label: actor.label }, rows });
}
