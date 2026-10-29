import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, PageHeader, Select } from "@/components/ui";
import { createContact, moveOpportunity } from "./actions";

export default async function CrmPage() {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: stages }, { data: opps }, { data: contacts }, { data: clients }] = await Promise.all([
    supabase.from("pipeline_stages").select("*").eq("workspace_id", workspaceId).order("position"),
    supabase
      .from("opportunities")
      .select("*, contacts(first_name, last_name, company, ai_score)")
      .eq("workspace_id", workspaceId)
      .eq("status", "open"),
    supabase
      .from("contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);
  const stageOpts = (stages ?? []).map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <PageHeader
        title="5 · CRM Inteligente"
        subtitle="Pipeline de ventas con scoring por IA. Los leads de captación, chats y llamadas aterrizan aquí. Sincroniza con GoHighLevel."
      />

      <div className="mb-8 flex gap-4 overflow-x-auto pb-2">
        {stages?.map((s) => {
          const items = opps?.filter((o) => o.stage_id === s.id) ?? [];
          const total = items.reduce((a, o) => a + Number(o.value), 0);
          return (
            <div key={s.id} className="card w-64 shrink-0 p-3">
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>{s.name}</span>
                <span className="muted tabular-nums">${total.toLocaleString("es")}</span>
              </div>
              <div className="space-y-2">
                {items.map((o) => {
                  const c = o.contacts as { first_name: string; last_name: string; company: string; ai_score: number } | null;
                  return (
                    <div key={o.id} className="rounded-lg border p-2 text-sm" style={{ borderColor: "var(--line)" }}>
                      <Link href={o.contact_id ? `/crm/contactos/${o.contact_id}` : "#"} className="font-medium hover:underline">
                        {o.title}
                      </Link>
                      <div className="muted text-xs">
                        {[c?.first_name, c?.last_name].filter(Boolean).join(" ")} · ${Number(o.value).toLocaleString("es")}
                        {c?.ai_score != null && <> · 🔥 {c.ai_score}</>}
                      </div>
                      <form action={moveOpportunity} className="mt-2 flex gap-1">
                        <input type="hidden" name="id" value={o.id} />
                        <select name="stage_id" defaultValue={s.id} className="input px-1 py-0.5 text-xs">
                          {stageOpts.map((so) => (
                            <option key={so.value} value={so.value}>
                              {so.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost px-2 py-0.5 text-xs">↵</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Contactos</h2>
          {!contacts?.length ? (
            <Empty>Sin contactos. Envía leads limpios desde Captación o crea uno.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Empresa</th>
                  <th>Fuente</th>
                  <th>Score IA</th>
                  <th>GHL</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/crm/contactos/${c.id}`} className="font-medium hover:underline">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}
                      </Link>
                      <div className="muted text-xs">{c.email ?? c.phone}</div>
                    </td>
                    <td>{c.company ?? "—"}</td>
                    <td>{c.source ?? "—"}</td>
                    <td className="tabular-nums">{c.ai_score ?? "—"}</td>
                    <td>{c.ghl_id ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createContact} className="card space-y-3">
          <h3 className="font-semibold">Nuevo contacto</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre" name="first_name" />
            <Field label="Apellido" name="last_name" />
          </div>
          <Field label="Email" name="email" type="email" />
          <Field label="Teléfono" name="phone" />
          <Field label="Empresa" name="company" />
          <Field label="Etiquetas (coma)" name="tags" />
          <Select
            label="Cliente"
            name="client_id"
            options={[{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select label="Crear oportunidad en" name="stage_id" options={[{ value: "", label: "— No crear —" }, ...stageOpts]} />
          <Field label="Valor (USD)" name="value" type="number" />
          <button className="btn w-full">Guardar</button>
        </form>
      </div>
    </>
  );
}
