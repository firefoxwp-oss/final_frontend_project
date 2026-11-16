import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  ESTADOS,
  confirmarCancelacion,
  enCurso,
  etiquetaEtapa,
  jobService,
  mensajeDeError,
} from '../services/jobService';
import type {EstadoTrabajo, JobDetail} from '../services/jobService';

/** Retraso maximo del estado mostrado (criterio de Pb-2: 3 s). */
const INTERVALO_ACTUALIZACION_MS = 3000;

const COLOR_ESTADO: Record<EstadoTrabajo, string> = {
  queued: 'bg-gray-600 text-gray-100',
  running: 'bg-blue-600 text-white',
  done: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  cancelled: 'bg-gray-700 text-gray-300',
};

/** Linea de detalle de un trabajo segun su estado. */
const detalle = (job: JobDetail): string => {
  switch (job.status) {
    case 'queued':
      return job.queue_position !== null
        ? `Posición en la cola: ${job.queue_position}`
        : 'En cola';
    case 'running':
      return `Etapa: ${etiquetaEtapa(job.stage)}`;
    case 'done':
      return job.video_type === 'karaoke'
        ? 'Karaoke listo'
        : 'Instrumental listo';
    case 'error':
      return job.error || 'El procesamiento terminó con un error.';
    case 'cancelled':
      return 'Procesamiento cancelado';
  }
};

/** Tarjeta de un procesamiento (patron del mockup de Pb-2). */
const TarjetaTrabajo = ({
  job,
  onAbrir,
  onCancelar,
}: {
  job: JobDetail;
  onAbrir: (id: string) => void;
  onCancelar: (job: JobDetail) => void;
}) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg flex flex-col gap-4">
    <p
      className="text-white text-lg font-semibold truncate"
      title={job.source_filename}
    >
      {job.source_filename}
    </p>
    <span
      className={`self-start rounded-full px-4 py-1 text-sm font-semibold ${COLOR_ESTADO[job.status]}`}
    >
      {ESTADOS[job.status]}
    </span>
    <p
      className={
        job.status === 'error'
          ? 'text-amber-300 text-sm break-words'
          : 'text-gray-200'
      }
    >
      {detalle(job)}
    </p>

    {enCurso(job.status) && (
      <div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div
            className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
            style={{width: `${job.progress}%`}}
          ></div>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-400">Se actualiza automáticamente</span>
          <span className="text-gray-300">{job.progress} %</span>
        </div>
      </div>
    )}

    <div className="flex items-center justify-between mt-auto">
      <span className="text-gray-400 text-xs">
        {new Date(job.created_at).toLocaleString()}
      </span>
      {enCurso(job.status) && (
        <button
          onClick={() => onCancelar(job)}
          className="border-2 border-blue-500 text-blue-300 hover:bg-blue-500 hover:text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Cancelar
        </button>
      )}
      {job.status === 'done' && (
        <button
          onClick={() => onAbrir(job.id)}
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          Abrir
        </button>
      )}
    </div>
  </div>
);

/**
 * Mis procesamientos: estado de cada trabajo del usuario, con su posicion
 * en la cola mientras espera y su etapa y avance mientras se procesa.
 */
export default function MisProcesamientos() {
  const navigate = useNavigate();
  const [trabajos, setTrabajos] = useState<JobDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTrabajos(await jobService.listJobs());
      setError(null);
    } catch (e) {
      setError(
        await mensajeDeError(e, 'No se pudieron cargar los procesamientos.'),
      );
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Diagrama de secuencia de Pb-3: MisProcesamientos.cancelar(job_id)
  const cancelar = async (job: JobDetail) => {
    if (!confirmarCancelacion(job.source_filename)) return;
    try {
      await jobService.cancelarTrabajo(job.id);
      await cargar();
    } catch (e) {
      setError(
        await mensajeDeError(e, 'No se pudo cancelar el procesamiento.'),
      );
    }
  };

  // Mientras haya trabajos en cola o en proceso, el estado se consulta cada
  // pocos segundos; se pausa si la pestana no esta visible.
  const hayEnCurso = trabajos?.some(job => enCurso(job.status)) ?? false;
  useEffect(() => {
    if (!hayEnCurso) return;
    const temporizador = window.setInterval(() => {
      if (document.visibilityState === 'visible') void cargar();
    }, INTERVALO_ACTUALIZACION_MS);
    return () => window.clearInterval(temporizador);
  }, [hayEnCurso, cargar]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-8 flex items-center justify-between">
        <h1 className="text-4xl font-bold text-white">Mis procesamientos</h1>
        <button
          onClick={() => void navigate('/')}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
        >
          Volver a proyectos
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {trabajos === null && !error && (
          <p className="text-gray-300">Cargando los procesamientos…</p>
        )}

        {trabajos?.length === 0 && (
          <p className="text-gray-300">
            Todavía no has procesado ningún vídeo.
          </p>
        )}

        {trabajos && trabajos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {trabajos.map(job => (
              <TarjetaTrabajo
                key={job.id}
                job={job}
                onAbrir={id => void navigate(`/resultado/${id}`)}
                onCancelar={j => void cancelar(j)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
