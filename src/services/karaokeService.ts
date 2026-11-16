/** Palabra de la letra con su inicio y fin en segundos (Pb-5). */
export interface PalabraLetra {
  texto: string;
  inicio: number;
  fin: number;
}

/** Linea de la letra, tal como se muestra en el Modo Karaoke. */
export interface LineaLetra {
  inicio: number;
  fin: number;
  palabras: PalabraLetra[];
}

/** Letra sincronizada que entrega GET /jobs/{id}/letra. */
export interface Letra {
  lineas: LineaLetra[];
}

/**
 * Indice de la linea que corresponde a la posicion del audio: la que se esta
 * cantando o, entre dos lineas, la siguiente.
 */
export const lineaActual = (lineas: LineaLetra[], posicion: number): number => {
  const indice = lineas.findIndex(linea => posicion < linea.fin);
  return indice === -1 ? lineas.length - 1 : indice;
};

/** Tiempo en formato m:ss. */
export const formatoTiempo = (segundos: number): string => {
  const total = Math.max(0, Math.floor(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
