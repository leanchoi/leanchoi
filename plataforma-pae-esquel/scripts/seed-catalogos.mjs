import { PrismaClient, EstadoJunta } from "@prisma/client";

const prisma = new PrismaClient();

// Listado de las 13 juntas vecinales identificadas en fuentes públicas
// NOTA OFICIAL: Son 18 juntas en Esquel. Las 5 restantes deben solicitarse a la Dirección de Juntas Vecinales.
const JUNTAS_VERIFICADAS = [
  { nombre: "Junta Vecinal Barrio Buenos Aires", barrio: "Buenos Aires", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Bella Vista", barrio: "Bella Vista", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Lennart Englund", barrio: "Lennart Englund", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Malvinas", barrio: "Malvinas", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Matadero", barrio: "Matadero", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Los Sauces", barrio: "Los Sauces", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Sargento Cabral", barrio: "Sargento Cabral", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Estación", barrio: "Estación", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Winter", barrio: "Winter", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Don Bosco", barrio: "Don Bosco", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio 28 de Junio", barrio: "28 de Junio", estado: EstadoJunta.VIGENTE },
  { nombre: "Junta Vecinal Barrio Ceferino", barrio: "Ceferino", estado: EstadoJunta.EN_REGULARIZACION },
  { nombre: "Junta Vecinal Área Centro", barrio: "Centro", estado: EstadoJunta.VIGENTE },
];

async function main() {
  console.log("🌱 Iniciando carga de catálogo maestro: Barrios y Juntas Vecinales de Esquel...");

  for (const item of JUNTAS_VERIFICADAS) {
    const junta = await prisma.juntaVecinal.upsert({
      where: { nombre: item.nombre },
      update: { estado: item.estado },
      create: {
        nombre: item.nombre,
        estado: item.estado,
      },
    });

    await prisma.barrio.upsert({
      where: { nombre: item.barrio },
      update: { juntaVecinalId: junta.id },
      create: {
        nombre: item.barrio,
        juntaVecinalId: junta.id,
      },
    });
  }

  console.log(`✅ ${JUNTAS_VERIFICADAS.length} juntas vecinales y barrios cargados exitosamente.`);
  console.log("⚠️ AVISO: El catálogo está marcado como INCOMPLETO (13/18). Solicitar el listado oficial a la Dirección de Juntas Vecinales.");
}

main()
  .catch((e) => {
    console.error("Error al cargar catálogo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });