import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export function orderCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `AND-${code}`;
}

export function firstImage(images: unknown): string {
  if (Array.isArray(images) && typeof images[0] === "string") return images[0];
  return "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=80";
}

export function imageList(images: unknown): string[] {
  if (Array.isArray(images)) return images.filter((i): i is string => typeof i === "string");
  return [];
}
