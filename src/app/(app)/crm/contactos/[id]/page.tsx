import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { addActivity, createOpportunity, scoreContact, syncToGhl } from "../../actions";

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { supabase, workspaceId } = await getCtx();
  const [{ data: c }, { data: acts }, { data: opps }, { data: calls }, { data: convs }, { data: stages }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("id", id).single(),
      supabase.from("activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supabase.from("opportunities").select("*, pipeline_stages(name)").eq("contact_id", id),
      supabase.from("calls").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supabase.from("conversations").select("id, channel, updated_at, text_agents(name)").eq("contact_id", id),
      supabase.from("pipeline_stages").select("id, name").eq("workspace_id", workspaceId).order("position"),
    ]);
  if (!c) notFound();
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Contacto";

  return (
    <>
      <PageHeader title={name} subtitle={[c.company, c.email, c.phone].filter(Boolean).join(" · ")} back="/crm">
        <form action={scoreContact}>
          <input type="hidden" name="contact_id" value={id} />
          <button className="btn-ghost">🧠 Puntuar con IA</button>
        </form>
        <form action={syncToGhl}>
          <input type="hidden" name="contact_id" value={id} />
          <button className="btn">{c.ghl_id ? "Re-sincronizar GHL" : "Enviar a GoHighLevel"}</button>
        </form>
      </PageHeader>
      <Flash {...await searchParams} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {c.ai_score != null && (
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold tabular-nums">{c.ai_score}</div>
                <div className="muted text-xs uppercase">Score IA</div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{c.ai_summary}</p>
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 font-semibold">Historial</h2>
            {!acts?.length && !calls?.length && !convs?.length && <Empty>Sin actividad.</Empty>}
            <ul className="space-y-3 text-sm">
              {convs?.map((cv) => (
                <li key={cv.id}>
                  <span className="badge">chat · {cv.channel}</span>{" "}
                  <span className="muted text-xs">
                    {(cv.text_agents as unknown as { name: string } | null)?.name} · {fmtDate(cv.updated_at)}
                  </span>
                </li>
              ))}
              {calls?.map((call) => (
                <li key={call.id}>
                  <span className="badge">llamada · {call.status}</span>{" "}
                  <span className="muted text-xs">{fmtDate(call.created_at)}</span>
                  {call.summary && <p className="mt-1">{call.summary}</p>}
                </li>
              ))}
              {acts?.map((a) => (
                <li key={a.id}>
                  <span className="badge">{a.type}</span> <span className="muted text-xs">{fmtDate(a.created_at)}</span>
                  <p className="mt-1 whitespace-pre-line">{a.content}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-2 text-sm">
            <h3 className="font-semibold">Oportunidades</h3>
            {!opps?.length && <p className="muted text-xs">Ninguna.</p>}
            {opps?.map((o) => (
              <div key={o.id} className="flex justify-between">
                <span>
                  {o.title} <span className="badge">{(o.pipeline_stages as { name: string } | null)?.name}</span>
                </span>
                <span className="tabular-nums">${Number(o.value).toLocaleString("es")}</span>
              </div>
            ))}
            <form action={createOpportunity} className="space-y-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <input type="hidden" name="contact_id" value={id} />
              <Field label="Título" name="title" required defaultValue={c.company} />
              <Select label="Etapa" name="stage_id" options={(stages ?? []).map((s) => ({ value: s.id, label: s.name }))} />
              <Field label="Valor" name="value" type="number" />
              <button className="btn-ghost w-full">Añadir oportunidad</button>
            </form>
          </div>

          <form action={addActivity} className="card space-y-3">
            <h3 className="font-semibold">Registrar actividad</h3>
            <input type="hidden" name="contact_id" value={id} />
            <Select label="Tipo" name="type" options={["note", "email", "call", "chat", "sms"]} />
            <Field label="Detalle" name="content" textarea rows={3} required />
            <button className="btn w-full">Guardar</button>
          </form>
        </div>
      </div>
    </>
  );
}
