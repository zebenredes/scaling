import { getCtx } from "@/lib/context";
import { Empty, Field, Flash, PageHeader, Select, fmtDate } from "@/components/ui";
import { deletePost, generatePlan, publishNow, savePost, scheduleAllDrafts } from "./actions";

const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "x"];
const STATUS = ["draft", "scheduled", "published", "failed"];

/** ISO → valor para <input type="datetime-local"> (hora local del servidor). */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, workspaceId } = await getCtx();
  let q = supabase
    .from("social_posts")
    .select("*, clients(name)")
    .eq("workspace_id", workspaceId)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (sp.status) q = q.eq("status", sp.status);
  const [{ data: posts }, { data: clients }] = await Promise.all([
    q,
    supabase.from("clients").select("id, name").eq("workspace_id", workspaceId),
  ]);
  const clientOpts = [{ value: "", label: "Mi agencia" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))];

  return (
    <>
      <PageHeader
        title="4 · Automatización de Redes Sociales"
        subtitle="La IA planifica y redacta el calendario; tú apruebas y se publica solo (vía webhook a n8n / Make / Zapier)."
      >
        <form action={scheduleAllDrafts}>
          <button className="btn-ghost">Programar todos los borradores</button>
        </form>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <a href="/social" className={`btn-ghost ${!sp.status ? "border-brand" : ""}`}>
              Todos
            </a>
            {STATUS.map((s) => (
              <a key={s} href={`/social?status=${s}`} className={`btn-ghost ${sp.status === s ? "border-brand" : ""}`}>
                {s}
              </a>
            ))}
          </div>
          {!posts?.length && (
            <div className="card">
              <Empty>No hay publicaciones. Genera un calendario con IA.</Empty>
            </div>
          )}
          {posts?.map((p) => (
            <div key={p.id} className="card">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="badge">{p.platform}</span>
                <span className="badge">{p.status}</span>
                <span className="muted">{(p.clients as { name: string } | null)?.name ?? "Mi agencia"}</span>
                <span className="muted ml-auto">{fmtDate(p.scheduled_at)}</span>
              </div>
              <form action={savePost} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <textarea name="content" defaultValue={p.content} rows={5} className="input" />
                <div className="grid gap-2 md:grid-cols-[1fr_200px_140px_auto]">
                  <input name="media_url" defaultValue={p.media_url ?? ""} placeholder="URL de imagen/vídeo" className="input" />
                  <input name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(p.scheduled_at)} className="input" />
                  <select name="status" defaultValue={p.status} className="input">
                    {STATUS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button className="btn-ghost">Guardar</button>
                </div>
              </form>
              {p.error && <p className="mt-2 text-xs text-red-500">{p.error}</p>}
              <div className="mt-2 flex gap-3 text-xs">
                {p.status !== "published" && (
                  <form action={publishNow}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="hover:underline">Publicar ahora</button>
                  </form>
                )}
                <form action={deletePost}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-red-500 hover:underline">Eliminar</button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <form action={generatePlan} className="card space-y-3">
            <h3 className="font-semibold">✨ Calendario con IA</h3>
            <Select label="Cliente" name="client_id" options={clientOpts} />
            <Select label="Red social" name="platform" options={PLATFORMS} />
            <Field label="Temas / objetivo" name="topic" textarea rows={2} />
            <Field label="Tono" name="tone" placeholder="cercano y profesional" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Días" name="days" type="number" defaultValue={14} />
              <Field label="Posts / semana" name="per_week" type="number" defaultValue={3} />
            </div>
            <button className="btn w-full">Generar calendario</button>
          </form>
          <details className="card">
            <summary className="cursor-pointer font-semibold">Post manual</summary>
            <form action={savePost} className="mt-3 space-y-3">
              <Select label="Cliente" name="client_id" options={clientOpts} />
              <Select label="Red social" name="platform" options={PLATFORMS} />
              <Field label="Contenido" name="content" textarea rows={4} required />
              <Field label="URL media" name="media_url" />
              <Field label="Programar para" name="scheduled_at" type="datetime-local" />
              <input type="hidden" name="status" value="scheduled" />
              <button className="btn w-full">Programar</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
