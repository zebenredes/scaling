import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Sesión + workspace activo. Redirige a /login si no hay usuario. */
export async function getCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!member) throw new Error("El usuario no pertenece a ningún workspace");

  const ws = member.workspaces as unknown as { name: string } | null;
  return {
    supabase,
    user,
    workspaceId: member.workspace_id as string,
    workspaceName: ws?.name ?? "Mi Agencia IA",
  };
}

/** Lee un campo de texto de un FormData; cadena vacía → null. */
export function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function numField(form: FormData, key: string): number | null {
  const v = field(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
