import {Pause, Play} from 'lucide-react';
import {formatoTiempo, lineaActual} from '../services/karaokeService';
import type {LineaLetra} from '../services/karaokeService';

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
          className={posicion >= palabra.inicio ? 'text-sky-400' : 'text-white'}
        >
          {palabra.texto + ' '}
        </span>
      ))}
    </p>
  );
};

/**
 * Reproductor del Modo Karaoke: letra en vivo y controles de la cancion,
 * segun el prototipo de Pb-5 y Pb-6.
 */
export default function ReproductorKaraoke({
  lineas,
  posicion,
  duracion,
  reproduciendo,
  volumenVoz,
  listo,
  onReproducir,
  onBuscar,
  onVolumenVoz,
}: {
  lineas: LineaLetra[];
  posicion: number;
  duracion: number;
  reproduciendo: boolean;
  /** Volumen de la voz guia, de 0 a 100. */
  volumenVoz: number;
  listo: boolean;
  onReproducir: () => void;
  onBuscar: (segundos: number) => void;
  onVolumenVoz: (valor: number) => void;
}) {
  const indice = lineaActual(lineas, posicion);
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-gray-900 rounded-xl px-6 py-12 text-center flex flex-col gap-8 min-h-[18rem] justify-center">
        {lineas.length === 0 ? (
          <p className="text-gray-400 text-xl">
            {listo ? 'Esta canción no tiene letra.' : 'Cargando la letra…'}
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

      <div className="flex items-center gap-4">
        <button
          onClick={onReproducir}
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
          onChange={e => onBuscar(Number(e.target.value))}
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
          value={volumenVoz}
          disabled={!listo}
          onChange={e => onVolumenVoz(Number(e.target.value))}
          aria-label="Volumen de la voz guía"
          className="w-64 accent-blue-500"
        />
        <span className="text-gray-200 text-sm">{volumenVoz} %</span>
      </div>
      <p className="text-gray-400 text-sm">
        La palabra resaltada sigue la posición del audio.
      </p>
    </div>
  );
}
