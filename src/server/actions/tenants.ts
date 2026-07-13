"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireMaster } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { defaultSiteConfig } from "@/lib/site-config";

// Gestion de paginas independientes (solo master): alta con usuario admin,
// comision, dominio propio y estado.

export async function createTenantAction(formData: FormData) {
  await requireMaster();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (name.length < 3) throw new Error("Nombre muy corto");
  if (!email || password.length < 8) throw new Error("Email o contraseña inválidos (mínimo 8 caracteres)");

  const base = slugify(name);
  let slug = base;
  for (let i = 2; await db.tenant.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const tenant = await db.tenant.create({
    data: {
      name,
      slug,
      tagline,
      commissionPct: Number(formData.get("commissionPct")) || null,
      siteConfig: defaultSiteConfig(name, tagline),
      users: {
        create: {
          email,
          name: String(formData.get("adminName") ?? name).trim(),
          passwordHash: await bcrypt.hash(password, 10),
          role: "TENANT_ADMIN",
        },
      },
    },
  });

  revalidatePath("/master/operadores");
  redirect(`/master/operadores/${tenant.id}`);
}

export async function updateTenantAction(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  const commissionRaw = String(formData.get("commissionPct") ?? "").trim();
  await db.tenant.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      tagline: String(formData.get("tagline") ?? "").trim() || null,
      customDomain: String(formData.get("customDomain") ?? "").trim().toLowerCase() || null,
      commissionPct: commissionRaw === "" ? null : Number(commissionRaw),
      status: formData.get("status") === "PAUSED" ? "PAUSED" : "ACTIVE",
    },
  });
  revalidatePath(`/master/operadores/${id}`);
  revalidatePath("/master/operadores");
}
