import {
  PrismaClient,
  Rol,
  TipoDoc,
  NivelEducativo,
  EstadoPostulacion,
  TipoAlerta,
  Severidad,
  EstadoAlerta,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Cargando datos de demostración sintéticos (esDemo)...");

  // 1. Programa y Ciclo 2026
  const programa = await prisma.programa.upsert({
    where: { nombre: "Programa de Apoyo a la Educación" },
    update: {},
    create: {
      nombre: "Programa de Apoyo a la Educación",
      sigla: "PAE",
    },
  });

  const ciclo = await prisma.ciclo.upsert({
    where: {
      programaId_anio: {
        programaId: programa.id,
        anio: 2026,
      },
    },
    update: {},
    create: {
      programaId: programa.id,
      anio: 2026,
      aperturaInscripcion: new Date("2026-02-08T00:00:00Z"),
      cierreInscripcion: new Date("2026-02-26T23:59:59Z"),
      montoBaseCentavos: 14850000n, // $148.500,00
      topeIngresoCentavos: 35000000n, // $350.000,00
      indiceReferencia: "IPC-PATAGONIA",
      indiceBase: 100.0,
      periodicidadMeses: 4,
      cupoTotal: 300,
    },
  });

  // 2. Usuarios de demostración
  const passHash = await bcrypt.hash("trocha2026", 10);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@esquel.gov.ar" },
    update: {},
    create: {
      email: "admin@esquel.gov.ar",
      nombre: "Administrador del Sistema",
      hashClave: passHash,
      rol: Rol.ADMIN,
      activo: true,
    },
  });

  const directora = await prisma.usuario.upsert({
    where: { email: "aldana.roberts@esquel.gov.ar" },
    update: {},
    create: {
      email: "aldana.roberts@esquel.gov.ar",
      nombre: "Aldana Roberts Marrero",
      hashClave: passHash,
      rol: Rol.DIRECCION_EDUCACION,
      activo: true,
    },
  });

  const intendente = await prisma.usuario.upsert({
    where: { email: "matias.taccetta@esquel.gov.ar" },
    update: {},
    create: {
      email: "matias.taccetta@esquel.gov.ar",
      nombre: "Matías Taccetta",
      hashClave: passHash,
      rol: Rol.INTENDENCIA,
      activo: true,
    },
  });

  // 3. Sede Vecinal 28 de Junio
  const junta28 = await prisma.juntaVecinal.findFirst({
    where: { nombre: { contains: "28 de Junio" } },
  });

  const sede28 = await prisma.sede.create({
    data: {
      nombre: "Sede Vecinal Barrio 28 de Junio",
      direccion: "San Martín y Pasaje 28 de Junio",
      juntaVecinalId: junta28?.id,
      latitud: -42.9133,
      longitud: -71.3197,
      radioMetros: 150,
      activa: true,
    },
  });

  // 4. Proyecto comunitario
  const proyectoApoyo = await prisma.proyectoComunitario.create({
    data: {
      sedeId: sede28.id,
      titulo: "Apoyo escolar a becarios de secundario",
      descripcion: "Acompañamiento en tareas escolares y refuerzo de matemática y lengua.",
      competencias: ["Pedagogía", "Matemática", "Comunicación"],
      cupo: 10,
      referenteId: directora.id,
      activo: true,
    },
  });

  // 5. Estudiante demo
  const personaEst = await prisma.persona.upsert({
    where: {
      tipoDocumento_numeroDocumento: {
        tipoDocumento: TipoDoc.DNI,
        numeroDocumento: "44123456",
      },
    },
    update: {},
    create: {
      tipoDocumento: TipoDoc.DNI,
      numeroDocumento: "44123456",
      apellido: "Ramos",
      nombre: "Camila",
      fechaNacimiento: new Date("2003-05-14"),
      email: "camila.ramos@ejemplo.com",
      telefono: "2945-123456",
    },
  });

  const postulacion = await prisma.postulacion.upsert({
    where: {
      personaId_cicloId: {
        personaId: personaEst.id,
        cicloId: ciclo.id,
      },
    },
    update: {},
    create: {
      personaId: personaEst.id,
      cicloId: ciclo.id,
      estado: EstadoPostulacion.ACTIVA,
      nivel: NivelEducativo.SUPERIOR,
      horasComprometidas: 30,
    },
  });

  // 6. Asignación y Credencial
  const asignacion = await prisma.asignacion.create({
    data: {
      postulacionId: postulacion.id,
      proyectoId: proyectoApoyo.id,
      puntajeAfinidad: 94.0,
    },
  });

  await prisma.credencial.create({
    data: {
      postulacionId: postulacion.id,
      codigoVerificacion: "TR-2026-9B41E",
      horasTotales: 30,
      tareas: ["Apoyo pedagógico", "Refuerzo escolar"],
      referenteNombre: "Gastón Escobar",
    },
  });

  // 7. Registro de Alerta Demo
  await prisma.alerta.create({
    data: {
      postulacionId: postulacion.id,
      tipo: TipoAlerta.REGULARIDAD_VENCIDA,
      severidad: Severidad.CRITICA,
      puntaje: 85.0,
      desglose: [
        { senal: "Regularidad vencida", aporte: 40, descripcion: "Regularidad vencida hace 22 días" },
        { senal: "Horas atrasadas", aporte: 25, descripcion: "Horas al 45% de lo esperado" },
        { senal: "Sin contacto", aporte: 20, descripcion: "Sin contacto hace 51 días" },
      ],
      vencimientoSla: new Date(Date.now() - 86400000 * 2), // Vencida hace 2 días
      responsableId: directora.id,
      estado: EstadoAlerta.ABIERTA,
    },
  });

  console.log("✅ Datos demo generados con éxito para usuarios, ciclo, proyectos y postulaciones.");
}

main()
  .catch((e) => {
    console.error("Error al cargar datos demo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });