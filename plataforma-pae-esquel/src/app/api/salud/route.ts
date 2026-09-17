import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Verificar conexión a la base de datos
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      sistema: "Trocha · PAE Esquel",
      baseDatos: "conectada",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        sistema: "Trocha · PAE Esquel",
        baseDatos: "desconectada",
        detalle: error?.message ?? "Error de conexión",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}