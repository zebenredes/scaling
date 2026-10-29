import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, PageHeader, Select } from "@/components/ui";
import { createVoiceAgent } from "./actions";

export default async function VoiceAgentsPage() {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: agents }, { data: clients }] = await Promise.all([
    supabase
      .from("voice_agents")
      .select("*, calls(count), clients(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="7 · Agente IA de Voz (Smart Calling)"
        subtitle="Agentes telefónicos que llaman a tus leads, califican y agendan. Transcripción y resumen van directos al CRM."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4 md:grid-cols-2">
          {!agents?.length && (
            <div className="card md:col-span-2">
              <Empty>Crea tu primer agente de voz.</Empty>
            </div>
          )}
          {agents?.map((a) => (
            <Link key={a.id} href={`/agentes-voz/${a.id}`} className="card hover:border-brand">
              <span className="badge">{a.provider}</span>
              <h3 className="mt-2 font-semibold">{a.name}</h3>
              <p className="muted text-sm">
                {(a.clients as { name: string } | null)?.name ?? "Mi agencia"} · {(a.calls as { count: number }[])[0]?.count ?? 0}{" "}
                llamadas
              </p>
              {a.goal && <p className="mt-1 text-xs">🎯 {a.goal}</p>}
            </Link>
          ))}
        </div>
        <form action={createVoiceAgent} className="card space-y-3">
          <h3 className="font-semibold">Nuevo agente de voz</h3>
          <Field label="Nombre" name="name" required placeholder="Setter de citas — Inmobiliaria" />
          <Select
            label="Cliente"
            name="client_id"
            options={[{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Field label="Objetivo de la llamada" name="goal" placeholder="Agendar visita al piso" />
          <Field label="Primera frase" name="first_message" placeholder="Hola, ¿hablo con {{nombre}}? Te llamo de…" />
          <button className="btn w-full">Crear</button>
        </form>
      </div>
    </>
  );
}
