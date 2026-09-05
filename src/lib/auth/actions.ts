"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { createAuthenticatedServerSupabaseClient } from "@/lib/supabase/server";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1024;

function readCredential(formData: FormData, name: "email" | "password") {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signInAdmin(formData: FormData): Promise<never> {
  const email = readCredential(formData, "email").trim();
  const password = readCredential(formData, "password");

  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    redirect("/admin/sign-in?error=authentication");
  }

  const client = await createAuthenticatedServerSupabaseClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) redirect("/admin/sign-in?error=authentication");

  const authorization = await requireAdmin(client);
  if (authorization.status !== "authorized") {
    await client.auth.signOut();
    redirect("/admin/sign-in?error=unavailable");
  }

  redirect("/admin");
}

export async function signOutAdmin(): Promise<never> {
  const client = await createAuthenticatedServerSupabaseClient();
  await client.auth.signOut();
  redirect("/admin/sign-in");
}
