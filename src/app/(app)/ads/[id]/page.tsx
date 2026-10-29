import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader } from "@/components/ui";
import { analyzeCampaign, generateCreatives, setAdCampaignStatus, updateCreative } from "../actions";

export default async function AdCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getCtx();
  const [{ data: c }, { data: creatives }] = await Promise.all([
    supabase.from("ad_campaigns").select("*").eq("id", id).single(),
    supabase.from("ad_creatives").select("*").eq("campaign_id", id).order("created_at"),
  ]);
  if (!c) notFound();

  const totals = (creatives ?? []).reduce(
    (a, cr) => ({
      impressions: a.impressions + cr.impressions,
      clicks: a.clicks + cr.clicks,
      conversions: a.conversions + cr.conversions,
      spend: a.spend + Number(cr.spend),
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
  );

  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.platform} · ${c.objective} · ${c.audience ?? ""}`} back="/ads">
        <form action={setAdCampaignStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={c.status === "active" ? "paused" : "active"} />
          <button className="btn-ghost">{c.status === "active" ? "⏸ Pausar" : "▶ Marcar activa"}</button>
        </form>
        <form action={analyzeCampaign}>
          <input type="hidden" name="campaign_id" value={id} />
          <button className="btn">🧠 Analizar con IA</button>
        </form>
      </PageHeader>
      <Flash {...await searchParams} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ["Impresiones", totals.impressions.toLocaleString("es")],
          ["Clics", totals.clicks.toLocaleString("es")],
          ["CTR", totals.impressions ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : "—"],
          ["Conversiones", totals.conversions],
          ["CPA", totals.conversions ? `$${(totals.spend / totals.conversions).toFixed(2)}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="card">
            <div className="muted text-xs uppercase">{k}</div>
            <div className="text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {c.ai_insights && (
        <div className="card mb-6">
          <h2 className="mb-2 font-semibold">Recomendaciones de la IA</h2>
          <div className="whitespace-pre-line text-sm">{c.ai_insights}</div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          {!creatives?.length && (
            <div className="card md:col-span-2">
              <Empty>Genera tus primeras creatividades con IA.</Empty>
            </div>
          )}
          {creatives?.map((cr) => (
            <div key={cr.id} className="card space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="badge">{cr.angle}</span>
                <span className="muted text-xs">{cr.status}</span>
              </div>
              <div className="font-semibold">{cr.headline}</div>
              <p className="whitespace-pre-line">{cr.primary_text}</p>
              {cr.description && <p className="muted text-xs">{cr.description}</p>}
              <div className="text-xs">
                CTA: <b>{cr.cta}</b>
              </div>
              <details className="text-xs">
                <summary className="muted cursor-pointer">Prompt de imagen</summary>
                <p className="mt-1 font-mono">{cr.image_prompt}</p>
              </details>
              <form action={updateCreative} className="grid grid-cols-4 gap-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <input type="hidden" name="id" value={cr.id} />
                <input type="hidden" name="campaign_id" value={id} />
                {(["impressions", "clicks", "conversions", "spend"] as const).map((k) => (
                  <input
                    key={k}
                    name={k}
                    type="number"
                    step="any"
                    defaultValue={cr[k]}
                    title={k}
                    className="input px-2 py-1 text-xs"
                  />
                ))}
                <select name="status" defaultValue={cr.status} className="input col-span-2 px-2 py-1 text-xs">
                  {["draft", "approved", "live", "paused"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button className="btn-ghost col-span-2 text-xs">Guardar</button>
              </form>
            </div>
          ))}
        </div>
        <form action={generateCreatives} className="card h-fit space-y-3">
          <h3 className="font-semibold">✨ Generar creatividades</h3>
          <input type="hidden" name="campaign_id" value={id} />
          <Field label="Cantidad (máx. 10)" name="count" type="number" defaultValue={5} />
          <p className="muted text-xs">Cada variación usa un ángulo distinto respetando los límites de {c.platform}.</p>
          <button className="btn w-full">Generar</button>
        </form>
      </div>
    </>
  );
}
