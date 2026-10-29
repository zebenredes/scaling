import { revalidatePath } from "next/cache";
import { getCtx, field, numField } from "@/lib/context";
import { SERVICES } from "@/lib/services";
import { Empty, Field, PageHeader } from "@/components/ui";

async function createClientAction(form: FormData) {
  "use server";
  const { supabase, workspaceId } = await getCtx();
  await supabase.from("clients").insert({
    workspace_id: workspaceId,
    name: field(form, "name")!,
    industry: field(form, "industry"),
    website: field(form, "website"),
    monthly_fee: numField(form, "monthly_fee"),
    services: form.getAll("services").map(String),
    notes: field(form, "notes"),
  });
  revalidatePath("/clientes");
}

async function deleteClientAction(form: FormData) {
  "use server";
  const { supabase } = await getCtx();
  await supabase.from("clients").delete().eq("id", field(form, "id")!);
  revalidatePath("/clientes");
}

export default async function ClientsPage() {
  const { supabase, workspaceId } = await getCtx();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Clientes de la agencia" subtitle="Empresas a las que vendes tus servicios de IA" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          {!clients?.length ? (
            <Empty>Aún no tienes clientes.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servicios</th>
                  <th>Fee mensual</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium">{c.name}</div>
                      <div className="muted text-xs">{[c.industry, c.website].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="space-x-1">
                      {(c.services as string[]).map((s) => (
                        <span key={s} className="badge">
                          {SERVICES.find((x) => x.slug === s)?.name ?? s}
                        </span>
                      ))}
                    </td>
                    <td className="tabular-nums">{c.monthly_fee ? `$${c.monthly_fee}` : "—"}</td>
                    <td>
                      <form action={deleteClientAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createClientAction} className="card space-y-3">
          <h2 className="font-semibold">Nuevo cliente</h2>
          <Field label="Nombre" name="name" required />
          <Field label="Industria" name="industry" />
          <Field label="Web" name="website" />
          <Field label="Fee mensual (USD)" name="monthly_fee" type="number" />
          <fieldset>
            <span className="label">Servicios contratados</span>
            <div className="space-y-1 text-sm">
              {SERVICES.map((s) => (
                <label key={s.slug} className="flex items-center gap-2">
                  <input type="checkbox" name="services" value={s.slug} /> {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Notas" name="notes" textarea rows={2} />
          <button className="btn w-full">Guardar</button>
        </form>
      </div>
    </>
  );
}
