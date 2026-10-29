import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { draftVoiceScript, startCall, updateVoiceAgent } from "../actions";

export default async function VoiceAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { supabase, workspaceId } = await getCtx();
  const [{ data: a }, { data: clients }, { data: calls }, { data: contacts }] = await Promise.all([
    supabase.from("voice_agents").select("*").eq("id", id).single(),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
    supabase
      .from("calls")
      .select("*, contacts(first_name, last_name, company)")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company, phone")
      .eq("workspace_id", workspaceId)
      .not("phone", "is", null)
      .limit(200),
  ]);
  if (!a) notFound();

  return (
    <>
      <PageHeader title={a.name} subtitle={a.goal ?? undefined} back="/agentes-voz" />
      <Flash {...await searchParams} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <form action={updateVoiceAgent} className="card space-y-3">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nombre" name="name" defaultValue={a.name} required />
              <Select label="Proveedor" name="provider" defaultValue={a.provider} options={["vapi", "retell"]} />
            </div>
            <Select
              label="Cliente"
              name="client_id"
              defaultValue={a.client_id ?? ""}
              options={[{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Field label="Objetivo" name="goal" defaultValue={a.goal} />
            <Field label="Primera frase" name="first_message" defaultValue={a.first_message} />
            <Field label="Guion / prompt del agente" name="script" textarea rows={10} defaultValue={a.script} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="ID de voz (ElevenLabs)" name="voice" defaultValue={a.voice} />
              <Field label="Assistant ID existente (opcional)" name="provider_agent_id" defaultValue={a.provider_agent_id} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={a.active} /> Activo
            </label>
            <button className="btn w-full">Guardar</button>
          </form>

          <form action={draftVoiceScript} className="card space-y-3">
            <h3 className="font-semibold">✨ Generar guion con IA</h3>
            <input type="hidden" name="id" value={id} />
            <Field label="Contexto" name="brief" textarea rows={3} placeholder="Leads que pidieron info en Facebook Ads sobre pisos en Valencia" />
            <button className="btn-ghost w-full">Generar (reemplaza el guion)</button>
          </form>
        </div>

        <div className="space-y-4">
          <form action={startCall} className="card space-y-3">
            <h3 className="font-semibold">📞 Lanzar llamada</h3>
            <input type="hidden" name="agent_id" value={id} />
            <Select
              label="Contacto del CRM"
              name="contact_id"
              options={[
                { value: "", label: "— Número manual —" },
                ...(contacts ?? []).map((c) => ({
                  value: c.id,
                  label: `${[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company} · ${c.phone}`,
                })),
              ]}
            />
            <Field label="…o número (+34…)" name="to_number" type="tel" />
            <button className="btn w-full" disabled={!a.active}>
              Llamar ahora
            </button>
            <p className="muted text-xs">Requiere VAPI_API_KEY y VAPI_PHONE_NUMBER_ID. Respeta la normativa local sobre llamadas comerciales.</p>
          </form>

          <div className="card">
            <h3 className="mb-3 font-semibold">Llamadas</h3>
            {!calls?.length && <Empty>Sin llamadas todavía.</Empty>}
            <div className="space-y-3">
              {calls?.map((call) => {
                const ct = call.contacts as { first_name: string; last_name: string; company: string } | null;
                return (
                  <details key={call.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {[ct?.first_name, ct?.last_name].filter(Boolean).join(" ") || ct?.company || call.to_number}
                      </span>
                      <span className="badge">{call.status}</span>
                      {call.outcome && <span className="badge">{call.outcome}</span>}
                      <span className="muted ml-auto text-xs">
                        {call.duration_sec ? `${Math.round(call.duration_sec)}s · ` : ""}
                        {fmtDate(call.created_at)}
                      </span>
                    </summary>
                    {call.summary && <p className="mt-2">{call.summary}</p>}
                    {call.recording_url && <audio controls src={call.recording_url} className="mt-2 w-full" />}
                    {call.transcript && (
                      <pre className="muted mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs">{call.transcript}</pre>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
