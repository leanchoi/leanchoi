"use server";

import { redirect } from "next/navigation";
import { login, destroySession } from "@/lib/auth";

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await login(email, password);
  if (!session) return { error: "Email o contraseña incorrectos" };
  redirect(session.role === "MASTER" ? "/master" : "/panel");
}

export async function logoutAction() {
  destroySession();
  redirect("/login");
}
