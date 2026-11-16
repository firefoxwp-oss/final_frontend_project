import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ResultsPage} from '../components/ResultsPage';
import {LoadingScreen} from '../components/LoadingScreen';
import {
  jobService,
  mensajeDeError,
  etiquetaEtapa,
  enCurso,
} from '../services/jobService';
import type {JobDetail} from '../services/jobService';

const sinExtension = (nombre: string) => {
  const i = nombre.lastIndexOf('.');
  return i > 0 ? nombre.slice(0, i) : nombre;
};

/**
 * Sigue un procesamiento mientras espera en la cola o se procesa, y muestra
 * sus resultados al terminar. Tambien reabre un procesamiento terminado
 * desde el historial de proyectos.
 */
export default function ResultPage() {
  const {jobId} = useParams<{jobId: string}>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const volver = useCallback(() => navigate('/'), [navigate]);

  const cargar = useCallback(async () => {
    if (!jobId) return null;
    try {
      const detalle = await jobService.getStatus(jobId);
      setJob(detalle);
      setError(null);
      return detalle;
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudo abrir este procesamiento.'));
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      const detalle = await cargar();
      // Si el trabajo sigue en curso, se sigue su progreso hasta que termine.
      if (vivo && detalle && enCurso(detalle.status)) {
        pollRef.current = window.setInterval(async () => {
          const actual = await cargar();
          if (actual && !enCurso(actual.status) && pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 3000);
      }
    })();

    return () => {
      vivo = false;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [cargar]);

  const Marco = ({children}: {children: React.ReactNode}) => (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-6">
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {children}
      </div>
    </div>
  );

  if (error) {
    return (
      <Marco>
        <h2 className="text-white text-xl font-semibold mb-3">
          No se pudo abrir el vídeo
        </h2>
        <p className="text-gray-300 mb-6">{error}</p>
        <button
          onClick={volver}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Volver a proyectos
        </button>
      </Marco>
    );
  }

  if (!job) {
    return (
      <Marco>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-purple-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Cargando el procesamiento…</p>
      </Marco>
    );
  }

  if (enCurso(job.status)) {
    return (
      <LoadingScreen
        loading
        fileName={job.source_filename}
        progress={job.progress}
        stageLabel={etiquetaEtapa(job.stage)}
        aviso="Puedes cerrar esta página: el procesamiento continúa en el servidor y lo encontrarás en tu proyecto."
        onCancel={volver}
      />
    );
  }

  if (job.status === 'error') {
    return (
      <Marco>
        <h2 className="text-white text-xl font-semibold mb-3">
          Este vídeo no se pudo procesar
        </h2>
        <p className="text-gray-300 mb-2 break-words">{job.source_filename}</p>
        <p className="text-amber-300 text-sm mb-6">
          {job.error || 'El procesamiento terminó con un error.'}
        </p>
        <button
          onClick={volver}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Volver a proyectos
        </button>
      </Marco>
    );
  }

  return (
    <ResultsPage
      originalVideoUrl={null}
      jobId={job.id}
      originalFileName={sinExtension(job.source_filename)}
      videoType={job.video_type}
      onBack={volver}
    />
  );
}
