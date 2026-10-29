import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { addLead, cleanList, importCsv, pushListToCrm, startScrape, syncScrapeJob } from "../actions";

const SCRAPE_KINDS = [
  { value: "google_maps", label: "Google Maps (negocios locales)" },
  { value: "decision_makers", label: "Tomadores de decisiones (cargos)" },
  { value: "complex", label: "Avatares complejos (Google Search)" },
  { value: "clay", label: "Clay + enrichment (envía esta lista)" },
];

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { listId } = await params;
  const { supabase } = await getCtx();
  const [{ data: list }, { data: leads }, { data: jobs }] = await Promise.all([
    supabase.from("lead_lists").select("*, icps(*)").eq("id", listId).single(),
    supabase.from("leads").select("*").eq("list_id", listId).order("created_at", { ascending: false }).limit(500),
    supabase.from("scrape_jobs").select("*").eq("list_id", listId).order("created_at", { ascending: false }),
  ]);
  if (!list) notFound();

  const stats = {
    total: leads?.length ?? 0,
    clean: leads?.filter((l) => l.status === "clean").length ?? 0,
    invalid: leads?.filter((l) => l.status === "invalid").length ?? 0,
    withEmail: leads?.filter((l) => l.email).length ?? 0,
  };

  return (
    <>
      <PageHeader title={list.name} subtitle={`Fuente: ${list.source}`} back="/captacion">
        <form action={cleanList}>
          <input type="hidden" name="list_id" value={listId} />
          <button className="btn-ghost">🧹 Limpiar datos</button>
        </form>
        <form action={pushListToCrm}>
          <input type="hidden" name="list_id" value={listId} />
          <button className="btn">Enviar limpios al CRM</button>
        </form>
      </PageHeader>
      <Flash {...await searchParams} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Object.entries({ Total: stats.total, Limpios: stats.clean, Inválidos: stats.invalid, "Con email": stats.withEmail }).map(
          ([k, v]) => (
            <div key={k} className="card">
              <div className="muted text-xs uppercase">{k}</div>
              <div className="text-2xl font-semibold tabular-nums">{v}</div>
            </div>
          ),
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          {!leads?.length ? (
            <Empty>Lista vacía. Lanza un scraping o importa un CSV.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contacto</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Ciudad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="font-medium">{l.company ?? "—"}</div>
                      <div className="muted text-xs">{l.website}</div>
                    </td>
                    <td>
                      {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                      <div className="muted text-xs">{l.title}</div>
                    </td>
                    <td className={l.email_valid === false ? "text-red-500" : ""}>{l.email ?? "—"}</td>
                    <td>{l.phone ?? "—"}</td>
                    <td>{l.city ?? "—"}</td>
                    <td>
                      <span className="badge">{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          <form action={startScrape} className="card space-y-3">
            <h3 className="font-semibold">Scraping de leads</h3>
            <input type="hidden" name="list_id" value={listId} />
            <Select label="Estrategia" name="kind" options={SCRAPE_KINDS} />
            <Field
              label="Búsqueda / cargos"
              name="query"
              placeholder="clínica dental · o · CEO, Fundador"
              defaultValue={list.icps?.industry}
            />
            <Field label="Ubicación" name="location" defaultValue={list.icps?.location} />
            <Field label="Límite" name="limit" type="number" defaultValue={50} />
            <button className="btn w-full">Lanzar</button>
          </form>

          {!!jobs?.length && (
            <div className="card space-y-2">
              <h3 className="font-semibold">Trabajos</h3>
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="badge">{j.kind}</span> <span className="muted text-xs">{fmtDate(j.created_at)}</span>
                    <div className="text-xs">
                      {j.status} · {j.result_count} leads {j.error && <span className="text-red-500">({j.error})</span>}
                    </div>
                  </div>
                  {j.status === "running" && (
                    <form action={syncScrapeJob}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <button className="btn-ghost">Actualizar</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          <form action={importCsv} className="card space-y-3">
            <h3 className="font-semibold">Importar CSV</h3>
            <input type="hidden" name="list_id" value={listId} />
            <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
            <Field
              label="…o pega el CSV"
              name="csv"
              textarea
              rows={3}
              placeholder={"company,first_name,email,phone\nAcme,Ana,ana@acme.com,+34600000000"}
            />
            <button className="btn w-full">Importar</button>
          </form>

          <details className="card">
            <summary className="cursor-pointer font-semibold">Añadir lead manual</summary>
            <form action={addLead} className="mt-3 space-y-2">
              <input type="hidden" name="list_id" value={listId} />
              <Field label="Empresa" name="company" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre" name="first_name" />
                <Field label="Apellido" name="last_name" />
              </div>
              <Field label="Cargo" name="title" />
              <Field label="Email" name="email" type="email" />
              <Field label="Teléfono" name="phone" />
              <Field label="Web" name="website" />
              <Field label="Ciudad" name="city" />
              <button className="btn w-full">Añadir</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
