import Link from "next/link";
import { getCtx } from "@/lib/context";
import { SERVICES } from "@/lib/services";
import { PageHeader } from "@/components/ui";

export default async function Dashboard() {
  const { supabase, workspaceId } = await getCtx();

  const counts = await Promise.all(
    SERVICES.map((s) =>
      supabase.from(s.table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    ),
  );
  const [{ count: clients }, { data: mrr }, { count: sent }, { count: calls }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("clients").select("monthly_fee").eq("workspace_id", workspaceId),
    supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  const totalMrr = (mrr ?? []).reduce((acc, c) => acc + Number(c.monthly_fee ?? 0), 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Resumen de tu agencia de IA" />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Clientes activos" value={clients ?? 0} />
        <Kpi label="MRR" value={totalMrr.toLocaleString("es", { style: "currency", currency: "USD" })} />
        <Kpi label="Emails enviados" value={sent ?? 0} />
        <Kpi label="Llamadas IA" value={calls ?? 0} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((s, i) => (
          <Link key={s.slug} href={`/${s.slug}`} className="card transition hover:border-brand">
            <div className="flex items-start justify-between">
              <span className="badge">Servicio {s.n}</span>
              <span className="text-2xl font-semibold tabular-nums">{counts[i].count ?? 0}</span>
            </div>
            <h2 className="mt-3 font-semibold">{s.name}</h2>
            <p className="muted mt-1 text-sm">{s.short}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="muted text-xs uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
