import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, PageHeader, Select } from "@/components/ui";
import { createAdCampaign } from "./actions";

const PLATFORMS = [
  { value: "meta", label: "Meta (Facebook / Instagram)" },
  { value: "google", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "linkedin", label: "LinkedIn Ads" },
];

export default async function AdsPage() {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: campaigns }, { data: clients }] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("*, ad_creatives(count), clients(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="3 · ADS IA Automatizados"
        subtitle="Genera decenas de creatividades por ángulo, registra métricas y deja que la IA decida qué pausar y qué escalar."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          {!campaigns?.length ? (
            <Empty>Sin campañas de anuncios.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Cliente</th>
                  <th>Plataforma</th>
                  <th>Creatividades</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/ads/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td>{(c.clients as { name: string } | null)?.name ?? "—"}</td>
                    <td>{c.platform}</td>
                    <td className="tabular-nums">{(c.ad_creatives as { count: number }[])[0]?.count ?? 0}</td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createAdCampaign} className="card space-y-3">
          <h3 className="font-semibold">Nueva campaña</h3>
          <Field label="Nombre" name="name" required />
          <Select
            label="Cliente"
            name="client_id"
            options={[{ value: "", label: "— Ninguno —" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select label="Plataforma" name="platform" options={PLATFORMS} />
          <Select
            label="Objetivo"
            name="objective"
            options={[
              { value: "leads", label: "Generación de leads" },
              { value: "sales", label: "Ventas" },
              { value: "traffic", label: "Tráfico" },
              { value: "awareness", label: "Reconocimiento" },
            ]}
          />
          <Field label="Producto / oferta" name="product" textarea rows={2} />
          <Field label="Audiencia" name="audience" textarea rows={2} />
          <Field label="Presupuesto diario (USD)" name="budget_daily" type="number" />
          <button className="btn w-full">Crear</button>
        </form>
      </div>
    </>
  );
}
