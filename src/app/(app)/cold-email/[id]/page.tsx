import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { addStep, deleteStep, enrollList, generateSequence, markEnrollment, setCampaignStatus } from "../actions";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { supabase, workspaceId } = await getCtx();
  const [{ data: c }, { data: steps }, { data: enrollments }, { data: lists }, { data: icps }] =
    await Promise.all([
      supabase.from("email_campaigns").select("*").eq("id", id).single(),
      supabase.from("email_steps").select("*").eq("campaign_id", id).order("step_order"),
      supabase
        .from("email_enrollments")
        .select("*, leads(first_name, last_name, company, email)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("lead_lists").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("icps").select("id, name").eq("workspace_id", workspaceId),
    ]);
  if (!c) notFound();

  const replied = enrollments?.filter((e) => e.status === "replied").length ?? 0;
  const total = enrollments?.length ?? 0;
  const nextStatus = c.status === "active" ? "paused" : "active";

  return (
    <>
      <PageHeader title={c.name} subtitle={c.offer ?? undefined} back="/cold-email">
        <span className="badge self-center">{c.status}</span>
        <form action={setCampaignStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={nextStatus} />
          <button className="btn" disabled={!steps?.length || !c.from_email}>
            {nextStatus === "active" ? "▶ Activar envíos" : "⏸ Pausar"}
          </button>
        </form>
      </PageHeader>
      <Flash {...await searchParams} />
      {!c.from_email && <Flash error="Configura el email remitente para poder activar la campaña." />}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="card">
          <div className="muted text-xs uppercase">Inscritos</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <div className="card">
          <div className="muted text-xs uppercase">Respuestas</div>
          <div className="text-2xl font-semibold">{replied}</div>
        </div>
        <div className="card">
          <div className="muted text-xs uppercase">Tasa de respuesta</div>
          <div className="text-2xl font-semibold">{total ? Math.round((replied / total) * 100) : 0}%</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold">Secuencia</h2>
            {!steps?.length && <Empty>Sin pasos. Genera la secuencia con IA o añade pasos a mano.</Empty>}
            {steps?.map((s) => (
              <div key={s.id} className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="badge">
                    Paso {s.step_order} · día +{s.delay_days}
                  </span>
                  <form action={deleteStep}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="campaign_id" value={id} />
                    <button className="text-xs text-red-500 hover:underline">Eliminar</button>
                  </form>
                </div>
                <div className="font-medium">{s.subject}</div>
                <p className="muted mt-2 whitespace-pre-line text-sm">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Leads inscritos</h2>
            {!enrollments?.length ? (
              <Empty>Inscribe una lista de leads limpios.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Paso</th>
                    <th>Próximo envío</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => {
                    const l = e.leads as { first_name: string; last_name: string; company: string; email: string };
                    return (
                      <tr key={e.id}>
                        <td>
                          {[l?.first_name, l?.last_name].filter(Boolean).join(" ") || l?.company}
                          <div className="muted text-xs">{l?.email}</div>
                        </td>
                        <td>{e.current_step}</td>
                        <td>{e.status === "active" ? fmtDate(e.next_send_at) : "—"}</td>
                        <td>
                          <span className="badge">{e.status}</span>
                        </td>
                        <td>
                          {e.status === "active" && (
                            <form action={markEnrollment}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="status" value="replied" />
                              <button className="text-xs hover:underline">Marcar respondió</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form action={generateSequence} className="card space-y-3">
            <h3 className="font-semibold">✨ Generar secuencia con IA</h3>
            <input type="hidden" name="campaign_id" value={id} />
            <Select
              label="ICP de referencia"
              name="icp_id"
              options={[{ value: "", label: "— Ninguno —" }, ...(icps ?? []).map((i) => ({ value: i.id, label: i.name }))]}
            />
            <p className="muted text-xs">Reemplaza los pasos actuales por 3 emails nuevos.</p>
            <button className="btn w-full">Generar</button>
          </form>

          <form action={enrollList} className="card space-y-3">
            <h3 className="font-semibold">Inscribir lista</h3>
            <input type="hidden" name="campaign_id" value={id} />
            <Select label="Lista de leads" name="list_id" options={(lists ?? []).map((l) => ({ value: l.id, label: l.name }))} />
            <button className="btn w-full" disabled={!lists?.length}>
              Inscribir
            </button>
          </form>

          <details className="card">
            <summary className="cursor-pointer font-semibold">Añadir paso manual</summary>
            <form action={addStep} className="mt-3 space-y-3">
              <input type="hidden" name="campaign_id" value={id} />
              <Field label="Días tras el paso anterior" name="delay_days" type="number" defaultValue={3} />
              <Field label="Asunto" name="subject" required />
              <Field label="Cuerpo" name="body" textarea rows={6} required placeholder="Hola {{first_name}}, ..." />
              <p className="muted text-xs">Variables: {"{{first_name}} {{company}} {{ai_icebreaker}}"}</p>
              <button className="btn w-full">Añadir</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
