import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, PageHeader, Select } from "@/components/ui";
import { createAgent } from "./actions";

export default async function TextAgentsPage() {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: agents }, { data: clients }] = await Promise.all([
    supabase
      .from("text_agents")
      .select("*, conversations(count), clients(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="6 · Agente IA de Texto"
        subtitle="Chatbots para la web y WhatsApp con base de conocimiento propia. Capturan leads directamente en el CRM."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4 md:grid-cols-2">
          {!agents?.length && (
            <div className="card md:col-span-2">
              <Empty>Crea tu primer agente.</Empty>
            </div>
          )}
          {agents?.map((a) => (
            <Link key={a.id} href={`/agentes-texto/${a.id}`} className="card hover:border-brand">
              <div className="flex items-center justify-between">
                <span className="badge">{a.channel}</span>
                <span className={`text-xs ${a.active ? "text-emerald-500" : "muted"}`}>{a.active ? "● activo" : "○ inactivo"}</span>
              </div>
              <h3 className="mt-2 font-semibold">{a.name}</h3>
              <p className="muted text-sm">
                {(a.clients as { name: string } | null)?.name ?? "Mi agencia"} ·{" "}
                {(a.conversations as { count: number }[])[0]?.count ?? 0} conversaciones
              </p>
            </Link>
          ))}
        </div>
        <form action={createAgent} className="card space-y-3">
          <h3 className="font-semibold">Nuevo agente</h3>
          <Field label="Nombre" name="name" required placeholder="Recepcionista Clínica Sonrisa" />
          <Select
            label="Cliente"
            name="client_id"
            options={[{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            label="Canal"
            name="channel"
            options={[
              { value: "web", label: "Widget web" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "instagram", label: "Instagram DM" },
              { value: "messenger", label: "Messenger" },
            ]}
          />
          <Field label="Mensaje de bienvenida" name="welcome_message" placeholder="¡Hola! ¿En qué te puedo ayudar?" />
          <button className="btn w-full">Crear</button>
        </form>
      </div>
    </>
  );
}
