"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { field } from "@/lib/context";

export async function login(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: field(form, "email") ?? "",
    password: field(form, "password") ?? "",
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signup(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: field(form, "email") ?? "",
    password: field(form, "password") ?? "",
    options: {
      data: { agency_name: field(form, "agency_name") ?? "Mi Agencia IA" },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (!data.session) redirect("/login?ok=Revisa tu email para confirmar la cuenta");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
