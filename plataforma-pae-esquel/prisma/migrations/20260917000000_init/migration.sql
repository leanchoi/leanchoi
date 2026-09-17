-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoDoc" AS ENUM ('DNI', 'LC', 'LE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "OrigenDato" AS ENUM ('DECLARADO', 'DOCUMENTO', 'CRUCE_EXTERNO', 'VERIFICADO_AGENTE');

-- CreateEnum
CREATE TYPE "EstadoJunta" AS ENUM ('VIGENTE', 'MANDATO_VENCIDO', 'EN_REGULARIZACION', 'SIN_DATOS');

-- CreateEnum
CREATE TYPE "CanalOrigen" AS ENUM ('WEB', 'PRESENCIAL', 'SEDE_VECINAL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EstadoPostulacion" AS ENUM ('BORRADOR', 'PRESENTADA', 'EN_EVALUACION', 'OBSERVADA', 'RECHAZADA', 'LISTA_ESPERA', 'ADMITIDA', 'ACTIVA', 'EN_RIESGO', 'EN_ACOMPANAMIENTO', 'SUSPENDIDA', 'BAJA', 'EGRESADA');

-- CreateEnum
CREATE TYPE "NivelEducativo" AS ENUM ('PRIMARIO', 'SECUNDARIO', 'SUPERIOR', 'FORMACION_PROFESIONAL');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI_FRENTE', 'DNI_DORSO', 'DOMICILIO', 'REGULARIDAD', 'INGRESOS', 'CBU', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoValidacion" AS ENUM ('PENDIENTE', 'VALIDADO', 'OBSERVADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('REGULARIDAD_VENCIDA', 'RENDIMIENTO_EN_CAIDA', 'HORAS_ATRASADAS', 'INASISTENCIA', 'SIN_CONTACTO', 'CAMBIO_SITUACION_HOGAR', 'RECHAZO_BANCARIO', 'DERIVACION_OTRA_AREA');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('INFORMATIVA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EstadoAlerta" AS ENUM ('ABIERTA', 'EN_GESTION', 'CERRADA', 'ESCALADA');

-- CreateEnum
CREATE TYPE "ResultadoIntervencion" AS ENUM ('RESUELTA', 'DERIVADA', 'SIN_RESPUESTA', 'ESCALADA');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'VALIDADA', 'EXPORTADA', 'CONCILIADA');

-- CreateEnum
CREATE TYPE "EstadoItemPago" AS ENUM ('PENDIENTE', 'ENVIADO', 'ACREDITADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ESTUDIANTE', 'REFERENTE_SEDE', 'OPERADOR_AREA', 'DIRECCION_EDUCACION', 'TESORERIA', 'INTENDENCIA', 'AUDITORIA', 'ADMIN');

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "tipoDocumento" "TipoDoc" NOT NULL DEFAULT 'DNI',
    "numeroDocumento" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaNacimiento" DATE NOT NULL,
    "genero" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "origenDato" "OrigenDato" NOT NULL DEFAULT 'DECLARADO',
    "verificadoEn" TIMESTAMP(3),
    "domicilioId" TEXT,
    "grupoFamiliarId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoFamiliar" (
    "id" TEXT NOT NULL,
    "cantidadIntegrantes" INTEGER NOT NULL,
    "ingresoMensualCentavos" BIGINT NOT NULL,
    "ingresoDeclaradoEn" TIMESTAMP(3) NOT NULL,
    "origenDato" "OrigenDato" NOT NULL DEFAULT 'DECLARADO',
    "observaciones" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrupoFamiliar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domicilio" (
    "id" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero" TEXT,
    "piso" TEXT,
    "depto" TEXT,
    "barrioId" TEXT NOT NULL,

    CONSTRAINT "Domicilio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barrio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "juntaVecinalId" TEXT,

    CONSTRAINT "Barrio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JuntaVecinal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoJunta" NOT NULL DEFAULT 'VIGENTE',
    "mandatoHasta" TIMESTAMP(3),

    CONSTRAINT "JuntaVecinal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sede" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "juntaVecinalId" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "radioMetros" INTEGER NOT NULL DEFAULT 150,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sigla" TEXT,

    CONSTRAINT "Programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ciclo" (
    "id" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "aperturaInscripcion" TIMESTAMP(3) NOT NULL,
    "cierreInscripcion" TIMESTAMP(3) NOT NULL,
    "montoBaseCentavos" BIGINT NOT NULL,
    "topeIngresoCentavos" BIGINT NOT NULL,
    "indiceReferencia" TEXT,
    "indiceBase" DOUBLE PRECISION,
    "periodicidadMeses" INTEGER NOT NULL DEFAULT 4,
    "techoPresupuestarioCentavos" BIGINT,
    "cupoTotal" INTEGER,

    CONSTRAINT "Ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Postulacion" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "estado" "EstadoPostulacion" NOT NULL DEFAULT 'BORRADOR',
    "nivel" "NivelEducativo" NOT NULL,
    "puntajeElegibilidad" DOUBLE PRECISION,
    "posicionListaEspera" INTEGER,
    "canalOrigen" "CanalOrigen" NOT NULL DEFAULT 'WEB',
    "horasComprometidas" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Postulacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransicionEstado" (
    "id" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "desde" "EstadoPostulacion",
    "hacia" "EstadoPostulacion" NOT NULL,
    "motivo" TEXT NOT NULL,
    "fundamento" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransicionEstado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrayectoriaEducativa" (
    "id" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "institucion" TEXT NOT NULL,
    "nivel" "NivelEducativo" NOT NULL,
    "carreraOAnio" TEXT,
    "condicion" TEXT,

    CONSTRAINT "TrayectoriaEducativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regularidad" (
    "id" TEXT NOT NULL,
    "trayectoriaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "vigenteHasta" TIMESTAMP(3) NOT NULL,
    "origenDato" "OrigenDato" NOT NULL DEFAULT 'DOCUMENTO',
    "documentoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Regularidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "vigenteHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoComunitario" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "competencias" TEXT[],
    "cupo" INTEGER NOT NULL,
    "diaSemana" INTEGER,
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "referenteId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProyectoComunitario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignacion" (
    "id" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "puntajeAfinidad" DOUBLE PRECISION,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroHoras" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "entradaEn" TIMESTAMP(3) NOT NULL,
    "salidaEn" TIMESTAMP(3),
    "minutos" INTEGER NOT NULL DEFAULT 0,
    "dentroDeGeocerca" BOOLEAN,
    "precisionMetros" INTEGER,
    "evidenciaRutaArchivo" TEXT,
    "evidenciaBorrarEn" TIMESTAMP(3),
    "estado" "EstadoValidacion" NOT NULL DEFAULT 'PENDIENTE',
    "validadoPorId" TEXT,
    "validadoEn" TIMESTAMP(3),
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroHoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credencial" (
    "id" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "codigoVerificacion" TEXT NOT NULL,
    "horasTotales" INTEGER NOT NULL,
    "tareas" TEXT[],
    "referenteNombre" TEXT NOT NULL,
    "emitidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadaEn" TIMESTAMP(3),

    CONSTRAINT "Credencial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerta" (
    "id" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "severidad" "Severidad" NOT NULL,
    "puntaje" DOUBLE PRECISION NOT NULL,
    "desglose" JSONB NOT NULL,
    "vencimientoSla" TIMESTAMP(3) NOT NULL,
    "responsableId" TEXT,
    "estado" "EstadoAlerta" NOT NULL DEFAULT 'ABIERTA',
    "escalada" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),

    CONSTRAINT "Alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervencion" (
    "id" TEXT NOT NULL,
    "alertaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "resultado" "ResultadoIntervencion" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Intervencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "montoUnitarioCentavos" BIGINT NOT NULL,
    "indiceAplicado" DOUBLE PRECISION,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "generadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exportadaEn" TIMESTAMP(3),

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPago" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "postulacionId" TEXT NOT NULL,
    "montoCentavos" BIGINT NOT NULL,
    "estado" "EstadoItemPago" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "acreditadoEn" TIMESTAMP(3),

    CONSTRAINT "ItemPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashClave" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "sedeId" TEXT,
    "totpSecret" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAuditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoDato" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoDato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Persona_apellido_nombre_idx" ON "Persona"("apellido", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_tipoDocumento_numeroDocumento_key" ON "Persona"("tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "Domicilio_barrioId_idx" ON "Domicilio"("barrioId");

-- CreateIndex
CREATE UNIQUE INDEX "Barrio_nombre_key" ON "Barrio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "JuntaVecinal_nombre_key" ON "JuntaVecinal"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Programa_nombre_key" ON "Programa"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Ciclo_programaId_anio_key" ON "Ciclo"("programaId", "anio");

-- CreateIndex
CREATE INDEX "Postulacion_cicloId_estado_idx" ON "Postulacion"("cicloId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Postulacion_personaId_cicloId_key" ON "Postulacion"("personaId", "cicloId");

-- CreateIndex
CREATE INDEX "TransicionEstado_postulacionId_creadoEn_idx" ON "TransicionEstado"("postulacionId", "creadoEn");

-- CreateIndex
CREATE INDEX "Regularidad_vigenteHasta_idx" ON "Regularidad"("vigenteHasta");

-- CreateIndex
CREATE INDEX "Documento_personaId_tipo_idx" ON "Documento"("personaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Asignacion_postulacionId_proyectoId_key" ON "Asignacion"("postulacionId", "proyectoId");

-- CreateIndex
CREATE INDEX "RegistroHoras_asignacionId_estado_idx" ON "RegistroHoras"("asignacionId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Credencial_codigoVerificacion_key" ON "Credencial"("codigoVerificacion");

-- CreateIndex
CREATE INDEX "Alerta_estado_vencimientoSla_idx" ON "Alerta"("estado", "vencimientoSla");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_cicloId_periodo_key" ON "Liquidacion"("cicloId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPago_liquidacionId_postulacionId_key" ON "ItemPago"("liquidacionId", "postulacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "EventoAuditoria_entidad_entidadId_idx" ON "EventoAuditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "EventoAuditoria_creadoEn_idx" ON "EventoAuditoria"("creadoEn");

-- CreateIndex
CREATE INDEX "AccesoDato_personaId_creadoEn_idx" ON "AccesoDato"("personaId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_domicilioId_fkey" FOREIGN KEY ("domicilioId") REFERENCES "Domicilio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_grupoFamiliarId_fkey" FOREIGN KEY ("grupoFamiliarId") REFERENCES "GrupoFamiliar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domicilio" ADD CONSTRAINT "Domicilio_barrioId_fkey" FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barrio" ADD CONSTRAINT "Barrio_juntaVecinalId_fkey" FOREIGN KEY ("juntaVecinalId") REFERENCES "JuntaVecinal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sede" ADD CONSTRAINT "Sede_juntaVecinalId_fkey" FOREIGN KEY ("juntaVecinalId") REFERENCES "JuntaVecinal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ciclo" ADD CONSTRAINT "Ciclo_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Postulacion" ADD CONSTRAINT "Postulacion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Postulacion" ADD CONSTRAINT "Postulacion_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "Ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransicionEstado" ADD CONSTRAINT "TransicionEstado_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransicionEstado" ADD CONSTRAINT "TransicionEstado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrayectoriaEducativa" ADD CONSTRAINT "TrayectoriaEducativa_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regularidad" ADD CONSTRAINT "Regularidad_trayectoriaId_fkey" FOREIGN KEY ("trayectoriaId") REFERENCES "TrayectoriaEducativa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regularidad" ADD CONSTRAINT "Regularidad_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComunitario" ADD CONSTRAINT "ProyectoComunitario_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComunitario" ADD CONSTRAINT "ProyectoComunitario_referenteId_fkey" FOREIGN KEY ("referenteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoComunitario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroHoras" ADD CONSTRAINT "RegistroHoras_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "Asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroHoras" ADD CONSTRAINT "RegistroHoras_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credencial" ADD CONSTRAINT "Credencial_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervencion" ADD CONSTRAINT "Intervencion_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervencion" ADD CONSTRAINT "Intervencion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "Ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPago" ADD CONSTRAINT "ItemPago_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPago" ADD CONSTRAINT "ItemPago_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES "Postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoDato" ADD CONSTRAINT "AccesoDato_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoDato" ADD CONSTRAINT "AccesoDato_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

