import { AppCampo } from '@/components/campo/app-campo';
import { getConfigAudio } from '@/lib/audio/config';

export const dynamic = 'force-dynamic';

/**
 * App de campo: la que se instala en el celular del encuestador.
 *
 * Todo el trabajo pasa del lado del cliente contra IndexedDB, para que funcione en
 * los barrios sin señal. El servidor solo entrega el armazón y, cuando hay red, el
 * cuestionario y la lista de viviendas.
 */
export default function PaginaCampo() {
  return <AppCampo audioHabilitado={getConfigAudio().habilitado} />;
}
