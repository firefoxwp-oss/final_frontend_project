import {apiClient} from './authService';

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

/** Pista de audio que se pide al servicio de descarga. */
export type PistaKaraoke = 'audio_instrumental';

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

export const karaokeService = {
  /** Letra sincronizada por palabra (servicio RutasKaraoke). */
  async obtenerLetra(jobId: string): Promise<Letra> {
    const respuesta = await apiClient.get<Letra>(
      `/jobs/${encodeURIComponent(jobId)}/letra`,
    );
    return respuesta.data;
  },

  /** Audio de una pista del servicio de descarga (RutasTrabajos). */
  async obtenerPista(jobId: string, pista: PistaKaraoke): Promise<ArrayBuffer> {
    const respuesta = await apiClient.get<ArrayBuffer>(
      `/descargar/${pista}/${encodeURIComponent(jobId)}`,
      {responseType: 'arraybuffer'},
    );
    return respuesta.data;
  },
};

/**
 * Reproduce las pistas de una cancion sincronizadas entre si con la Web Audio
 * API. La posicion se toma del reloj de audio (descontando la latencia de
 * salida), no de temporizadores, para que la letra siga al sonido (RR-07).
 */
export class MotorKaraoke {
  private readonly contexto = new AudioContext();
  private pistas: {buffer: AudioBuffer; ganancia: GainNode}[] = [];
  private fuentes: AudioBufferSourceNode[] = [];
  private inicio = 0;
  private desde = 0;
  reproduciendo = false;

  /** Decodifica las pistas; cada una con su volumen inicial (0 a 1). */
  async cargar(datos: ArrayBuffer[], volumenes: number[]): Promise<void> {
    const buffers = await Promise.all(
      datos.map(d => this.contexto.decodeAudioData(d)),
    );
    this.pistas = buffers.map((buffer, i) => {
      const ganancia = this.contexto.createGain();
      ganancia.gain.value = volumenes[i] ?? 1;
      ganancia.connect(this.contexto.destination);
      return {buffer, ganancia};
    });
  }

  get duracion(): number {
    return Math.max(0, ...this.pistas.map(p => p.buffer.duration));
  }

  /** Segundos de la cancion que se estan escuchando. */
  posicion(): number {
    if (!this.reproduciendo) return this.desde;
    const latencia = this.contexto.outputLatency || 0;
    const actual =
      this.desde + this.contexto.currentTime - this.inicio - latencia;
    return Math.min(Math.max(actual, 0), this.duracion);
  }

  async reproducir(): Promise<void> {
    if (this.reproduciendo || this.pistas.length === 0) return;
    if (this.desde >= this.duracion) this.desde = 0;
    await this.contexto.resume();
    // Todas las pistas empiezan en el mismo instante del reloj de audio
    this.inicio = this.contexto.currentTime + 0.05;
    this.fuentes = this.pistas.map(({buffer, ganancia}) => {
      const fuente = this.contexto.createBufferSource();
      fuente.buffer = buffer;
      fuente.connect(ganancia);
      fuente.start(this.inicio, this.desde);
      return fuente;
    });
    this.reproduciendo = true;
  }

  pausar(): void {
    if (!this.reproduciendo) return;
    this.desde = this.posicion();
    this.detenerFuentes();
    this.reproduciendo = false;
  }

  async buscar(segundos: number): Promise<void> {
    const seguia = this.reproduciendo;
    this.pausar();
    this.desde = Math.min(Math.max(segundos, 0), this.duracion);
    if (seguia) await this.reproducir();
  }

  /** Cambia el volumen de una pista sin cortar la reproduccion. */
  volumen(indice: number, valor: number): void {
    const pista = this.pistas[indice];
    if (pista) {
      pista.ganancia.gain.setTargetAtTime(
        valor,
        this.contexto.currentTime,
        0.01,
      );
    }
  }

  async cerrar(): Promise<void> {
    this.detenerFuentes();
    await this.contexto.close();
  }

  private detenerFuentes(): void {
    for (const fuente of this.fuentes) {
      fuente.stop();
      fuente.disconnect();
    }
    this.fuentes = [];
  }
}
