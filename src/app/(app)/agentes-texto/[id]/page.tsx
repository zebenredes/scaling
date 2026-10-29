import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { draftPrompt, updateAgent } from "../actions";
import { Playground } from "./playground";

export default async function TextAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId } = await getCtx();
  const [{ data: a }, { data: clients }, { data: convs }, { data: pg }] = await Promise.all([
    supabase.from("text_agents").select("*").eq("id", id).single(),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
    supabase
      .from("conversations")
      .select("id, channel, external_user, updated_at, contacts(first_name, email, phone), messages(count)")
      .eq("agent_id", id)
      .not("external_user", "like", "playground:%")
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("conversations")
      .select("messages(role, content, created_at)")
      .eq("agent_id", id)
      .eq("external_user", `playground:${user.id}`)
      .maybeSingle(),
  ]);
  if (!a) notFound();

  const initial = ((pg?.messages ?? []) as { role: "user" | "assistant"; content: string; created_at: string }[])
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map(({ role, content }) => ({ role, content }));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tu-app.vercel.app";

  return (
    <>
      <PageHeader title={a.name} subtitle={`Canal: ${a.channel}`} back="/agentes-texto" />
      <Flash {...await searchParams} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <form action={updateAgent} className="card space-y-3">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nombre" name="name" defaultValue={a.name} required />
              <Select
                label="Canal"
                name="channel"
                defaultValue={a.channel}
                options={["web", "whatsapp", "instagram", "messenger"]}
              />
            </div>
            <Select
              label="Cliente"
              name="client_id"
              defaultValue={a.client_id ?? ""}
              options={[{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Field label="Prompt de sistema" name="system_prompt" textarea rows={8} defaultValue={a.system_prompt} />
            <Field
              label="Base de conocimiento (servicios, precios, horarios, FAQs…)"
              name="knowledge"
              textarea
              rows={8}
              defaultValue={a.knowledge}
            />
            <Field label="Mensaje de bienvenida" name="welcome_message" defaultValue={a.welcome_message} />
            {a.channel === "whatsapp" && (
              <Field label="WhatsApp Phone Number ID (Meta)" name="whatsapp_phone_id" defaultValue={a.whatsapp_phone_id} />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={a.active} /> Activo
            </label>
            <button className="btn w-full">Guardar</button>
          </form>

          <form action={draftPrompt} className="card space-y-3">
            <h3 className="font-semibold">✨ Redactar prompt con IA</h3>
            <input type="hidden" name="id" value={id} />
            <Field
              label="Brief del cliente"
              name="brief"
              textarea
              rows={3}
              placeholder="Clínica dental en Madrid. Queremos agendar primeras visitas gratuitas y filtrar urgencias."
            />
            <button className="btn-ghost w-full">Redactar (reemplaza el prompt actual)</button>
          </form>
        </div>

        <div className="space-y-4">
          <Playground agentId={id} initial={initial} />

          <div className="card space-y-2 text-sm">
            <h3 className="font-semibold">Instalación</h3>
            {a.channel === "whatsapp" ? (
              <>
                <p className="muted">En Meta for Developers → WhatsApp → Configuración, usa:</p>
                <code className="block break-all rounded bg-black/5 p-2 text-xs">{appUrl}/api/webhooks/whatsapp</code>
                <p className="muted text-xs">Token de verificación: el valor de WHATSAPP_VERIFY_TOKEN. Suscríbete al campo “messages”.</p>
              </>
            ) : (
              <>
                <p className="muted">Pega este código antes de &lt;/body&gt; en la web del cliente:</p>
                <code className="block break-all rounded bg-black/5 p-2 text-xs">
                  {`<script src="${appUrl}/widget.js" data-agent="${a.public_key}" async></script>`}
                </code>
              </>
            )}
          </div>

          <div className="card text-sm">
            <h3 className="mb-2 font-semibold">Conversaciones recientes</h3>
            {!convs?.length && <p className="muted text-xs">Aún no hay conversaciones reales.</p>}
            <ul className="space-y-1">
              {convs?.map((c) => {
                const ct = c.contacts as unknown as { first_name: string; email: string; phone: string } | null;
                return (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {ct?.first_name ?? ct?.email ?? ct?.phone ?? c.external_user}
                      {ct && <span className="badge ml-1">lead</span>}
                    </span>
                    <span className="muted shrink-0 text-xs">
                      {(c.messages as { count: number }[])[0]?.count ?? 0} msgs · {fmtDate(c.updated_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
