import Link from "next/link";
import { getCtx } from "@/lib/context";
import { Empty, Field, PageHeader, Select } from "@/components/ui";
import { createCampaign } from "./actions";

export default async function ColdEmailPage() {
  const { supabase, workspaceId } = await getCtx();
  const [{ data: campaigns }, { data: clients }] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select("*, email_enrollments(count), email_steps(count), clients(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="2 · Cold Email Marketing IA"
        subtitle="Secuencias escritas por IA, personalizadas por lead y enviadas automáticamente respetando el límite diario."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          {!campaigns?.length ? (
            <Empty>Sin campañas todavía.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Cliente</th>
                  <th>Pasos</th>
                  <th>Inscritos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cold-email/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td>{(c.clients as { name: string } | null)?.name ?? "Agencia"}</td>
                    <td className="tabular-nums">{(c.email_steps as { count: number }[])[0]?.count ?? 0}</td>
                    <td className="tabular-nums">{(c.email_enrollments as { count: number }[])[0]?.count ?? 0}</td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createCampaign} className="card space-y-3">
          <h3 className="font-semibold">Nueva campaña</h3>
          <Field label="Nombre" name="name" required />
          <Select
            label="Cliente"
            name="client_id"
            options={[{ value: "", label: "Mi agencia (captación propia)" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Field label="Oferta" name="offer" textarea rows={2} placeholder="Agente IA que responde WhatsApp 24/7 y agenda citas" />
          <Field label="Nombre remitente" name="from_name" />
          <Field label="Email remitente (dominio verificado)" name="from_email" type="email" />
          <Field label="Límite diario" name="daily_limit" type="number" defaultValue={30} />
          <button className="btn w-full">Crear</button>
        </form>
      </div>
    </>
  );
}
