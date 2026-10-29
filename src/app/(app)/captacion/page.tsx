import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select } from "@/components/ui";
import { createIcp, createList, generateIcp } from "./actions";

export default async function CaptacionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: icps }, { data: lists }] = await Promise.all([
    supabase.from("icps").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    supabase
      .from("lead_lists")
      .select("*, leads(count), icps(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title="1 · Captación de clientes"
        subtitle="Define tu ICP, extrae leads (Google Maps, decisores, avatares complejos, Clay) y límpialos antes de lanzar campañas."
      />
      <Flash {...await searchParams} />

      <section className="mb-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card">
          <h2 className="mb-3 font-semibold">Perfiles de Cliente Ideal (ICP)</h2>
          {!icps?.length ? (
            <Empty>Crea tu primer ICP o genéralo con IA.</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {icps.map((icp) => (
                <div key={icp.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
                  <div className="font-medium">{icp.name}</div>
                  <div className="muted text-xs">
                    {[icp.industry, icp.location, icp.company_size].filter(Boolean).join(" · ")}
                  </div>
                  {icp.job_titles?.length > 0 && <div className="mt-2 text-xs">🎯 {icp.job_titles.join(", ")}</div>}
                  {icp.pains && <p className="muted mt-2 whitespace-pre-line text-xs">{icp.pains}</p>}
                  {icp.offer && <p className="mt-2 text-xs font-medium">💡 {icp.offer}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <form action={generateIcp} className="card space-y-3">
            <h3 className="font-semibold">✨ Generar ICP con IA</h3>
            <Field
              label="Describe tu servicio y a quién va dirigido"
              name="description"
              textarea
              rows={3}
              placeholder="Chatbots de WhatsApp para clínicas dentales en Madrid que pierden citas fuera de horario"
              required
            />
            <button className="btn w-full">Generar</button>
          </form>
          <details className="card">
            <summary className="cursor-pointer font-semibold">Crear ICP manualmente</summary>
            <form action={createIcp} className="mt-3 space-y-3">
              <Field label="Nombre" name="name" required />
              <Field label="Industria" name="industry" />
              <Field label="Ubicación" name="location" />
              <Field label="Tamaño de empresa" name="company_size" />
              <Field label="Cargos (separados por coma)" name="job_titles" />
              <Field label="Dolores" name="pains" textarea rows={2} />
              <Field label="Oferta" name="offer" />
              <button className="btn w-full">Guardar ICP</button>
            </form>
          </details>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Listas de leads</h2>
          {!lists?.length ? (
            <Empty>Sin listas todavía.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Lista</th>
                  <th>ICP</th>
                  <th>Fuente</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/captacion/${l.id}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                    </td>
                    <td>{(l.icps as { name: string } | null)?.name ?? "—"}</td>
                    <td>
                      <span className="badge">{l.source}</span>
                    </td>
                    <td className="tabular-nums">{(l.leads as { count: number }[])[0]?.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createList} className="card space-y-3">
          <h3 className="font-semibold">Nueva lista</h3>
          <Field label="Nombre" name="name" required placeholder="Dentistas Madrid — Oct" />
          <Select
            label="ICP"
            name="icp_id"
            options={[{ value: "", label: "— Ninguno —" }, ...(icps ?? []).map((i) => ({ value: i.id, label: i.name }))]}
          />
          <button className="btn w-full">Crear lista</button>
        </form>
      </section>
    </>
  );
}
