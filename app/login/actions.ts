"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isMoneySupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function login(formData: FormData) {
  if (!isMoneySupabaseConfigured()) {
    redirect("/login?error=Money%20Supabase%20is%20not%20configured");
  }

  const email = value(formData, "email");
  const password = value(formData, "password");
  const next = value(formData, "next");

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/");
}

export async function signup(formData: FormData) {
  if (!isMoneySupabaseConfigured()) {
    redirect("/login?error=Money%20Supabase%20is%20not%20configured");
  }

  const email = value(formData, "email");
  const password = value(formData, "password");

  if (!email || password.length < 8) {
    redirect("/login?error=Use%20a%20valid%20email%20and%20a%20password%20of%20at%20least%208%20characters");
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/setup");
  }

  redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account");
}
