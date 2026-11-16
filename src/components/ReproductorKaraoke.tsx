import {useCallback, useEffect, useRef, useState} from 'react';
import {Pause, Play} from 'lucide-react';
import {
  MotorKaraoke,
  formatoTiempo,
  karaokeService,
  lineaActual,
} from '../services/karaokeService';
import type {LineaLetra, PistaKaraoke} from '../services/karaokeService';

/** Pistas que se reproducen en el Modo Karaoke. */
const PISTAS: PistaKaraoke[] = ['audio_instrumental'];

/** Linea de la letra; en la actual se resaltan las palabras ya cantadas. */
const Linea = ({
  linea,
  posicion,
  actual,
}: {
  linea?: LineaLetra;
  posicion: number;
  actual: boolean;
}) => {
  if (!linea) return <p className="min-h-[2.5rem]">{' '}</p>;
  if (!actual) {
    return (
      <p className="text-xl md:text-2xl text-gray-400">
        {linea.palabras.map(p => p.texto).join(' ')}
      </p>
    );
  }
  return (
    <p className="text-3xl md:text-5xl font-bold leading-snug">
      {linea.palabras.map((palabra, i) => (
        <span
          key={i}
          data-cantada={posicion >= palabra.inicio}
          className={posicion >= palabra.inicio ? 'text-sky-400' : 'text-white'}
        >
          {palabra.texto + ' '}
        </span>
      ))}
    </p>
  );
};

/**
 * Reproductor del Modo Karaoke (Pb-5): carga las pistas, las reproduce y
 * resalta cada palabra segun la posicion real del audio.
 */
export default function ReproductorKaraoke({
  jobId,
  lineas,
  letraLista,
}: {
  jobId: string;
  lineas: LineaLetra[];
  letraLista: boolean;
}) {
  const motor = useRef<MotorKaraoke | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posicion, setPosicion] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);

  // cargar(pistas, letra): descarga y decodifica las pistas de la cancion
  useEffect(() => {
    const nuevo = new MotorKaraoke();
    motor.current = nuevo;
    let vigente = true;
    void (async () => {
      try {
        const datos = await Promise.all(
          PISTAS.map(p => karaokeService.obtenerPista(jobId, p)),
        );
        await nuevo.cargar(datos, [1]);
        if (!vigente) return;
        setDuracion(nuevo.duracion);
        setListo(true);
      } catch {
        if (vigente) setError('No se pudo cargar el audio de la canción.');
      }
    })();
    return () => {
      vigente = false;
      void nuevo.cerrar();
    };
  }, [jobId]);

  // resaltarPalabra(posicionAudio): en cada cuadro mientras suena
  useEffect(() => {
    if (!reproduciendo) return;
    let cuadro = 0;
    const actualizar = () => {
      const m = motor.current;
      if (!m) return;
      const actual = m.posicion();
      setPosicion(actual);
      if (actual >= m.duracion) {
        m.pausar();
        setReproduciendo(false);
        return;
      }
      cuadro = requestAnimationFrame(actualizar);
    };
    cuadro = requestAnimationFrame(actualizar);
    return () => cancelAnimationFrame(cuadro);
  }, [reproduciendo]);

  const alternar = useCallback(async () => {
    const m = motor.current;
    if (!m) return;
    if (m.reproduciendo) {
      m.pausar();
      setPosicion(m.posicion());
      setReproduciendo(false);
    } else {
      await m.reproducir();
      setReproduciendo(true);
    }
  }, []);

  const buscar = useCallback(async (segundos: number) => {
    const m = motor.current;
    if (!m) return;
    await m.buscar(segundos);
    setPosicion(m.posicion());
  }, []);

  const indice = lineaActual(lineas, posicion);
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-gray-900 rounded-xl px-6 py-12 text-center flex flex-col gap-8 min-h-[18rem] justify-center">
        {lineas.length === 0 ? (
          <p className="text-gray-400 text-xl">
            {letraLista ? 'Esta canción no tiene letra.' : 'Cargando la letra…'}
          </p>
        ) : (
          <>
            <Linea
              linea={lineas[indice - 1]}
              posicion={posicion}
              actual={false}
            />
            <Linea linea={lineas[indice]} posicion={posicion} actual />
            <Linea
              linea={lineas[indice + 1]}
              posicion={posicion}
              actual={false}
            />
          </>
        )}
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          onClick={() => void alternar()}
          disabled={!listo}
          aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
          className="h-12 w-12 shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white flex items-center justify-center"
        >
          {reproduciendo ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6" />
          )}
        </button>
        <span className="text-gray-300 text-sm w-12 text-right">
          {formatoTiempo(posicion)}
        </span>
        <input
          type="range"
          min={0}
          max={duracion || 0}
          step={0.1}
          value={posicion}
          disabled={!listo}
          onChange={e => void buscar(Number(e.target.value))}
          aria-label="Posición de la canción"
          className="flex-1 accent-blue-500"
        />
        <span className="text-gray-300 text-sm w-12">
          {formatoTiempo(duracion)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-white font-semibold w-24">Voz guía</span>
        <input
          type="range"
          min={0}
          max={100}
          value={30}
          disabled
          readOnly
          aria-label="Volumen de la voz guía"
          className="w-64 accent-blue-500"
        />
        <span className="text-gray-200 text-sm">30 %</span>
      </div>
      <p className="text-gray-400 text-sm">
        La palabra resaltada sigue la posición del audio.
      </p>
    </div>
  );
}
