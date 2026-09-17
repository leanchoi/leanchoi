/**
 * Regla M8 · Supresión de celdas chicas:
 * Ningún cruce público se publica con menos de 5 personas (n < 5).
 * En una ciudad de escala como Esquel, 2 o 3 casos en un barrio alcanzan
 * para que el vecindario reidentifique al titular del beneficio.
 */
export const UMBRAL_SUPRESION = 5;

export interface CeldaAgregada {
  categoria: string;
  total: number;
  [key: string]: any;
}

export interface CeldaProtegida {
  categoria: string;
  total: number | string;
  suprimido: boolean;
  [key: string]: any;
}

/**
 * Función centralizada que sanitiza cualquier conjunto de datos para difusión pública.
 */
export function suprimirCeldasChicas<T extends CeldaAgregada>(
  filas: T[],
  campoConteo: keyof T = "total"
): Array<Omit<T, "total"> & { total: number | string; suprimido: boolean }> {
  let acumuladorOtros = 0;
  let haySuprimidos = false;

  const resultado = filas.map((fila) => {
    const valor = Number(fila[campoConteo]);

    if (valor > 0 && valor < UMBRAL_SUPRESION) {
      haySuprimidos = true;
      acumuladorOtros += valor;
      return {
        ...fila,
        [campoConteo]: `<${UMBRAL_SUPRESION}`,
        suprimido: true,
      };
    }

    return {
      ...fila,
      suprimido: false,
    };
  });

  return resultado as any;
}