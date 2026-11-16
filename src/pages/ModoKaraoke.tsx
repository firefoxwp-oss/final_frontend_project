import {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import ReproductorKaraoke from '../components/ReproductorKaraoke';
import {jobService, mensajeDeError} from '../services/jobService';
import type {JobDetail} from '../services/jobService';
import {karaokeService} from '../services/karaokeService';
import type {LineaLetra} from '../services/karaokeService';

/**
 * Modo Karaoke en la web (Pb-5 y Pb-6): reproduce el instrumental con la
 * letra resaltada palabra por palabra y la voz guia ajustable.
 */
export default function ModoKaraoke() {
  const {jobId} = useParams<{jobId: string}>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaLetra[]>([]);
  const [letraLista, setLetraLista] = useState(false);

  // abrir(job_id): datos de la cancion y obtenerLetra(job_id)
  useEffect(() => {
    if (!jobId) return;
    void (async () => {
      try {
        const detalle = await jobService.getStatus(jobId);
        setJob(detalle);
        if (detalle.status !== 'done' || detalle.video_type !== 'karaoke') {
          setError(
            'El Modo Karaoke solo está disponible para canciones karaoke terminadas.',
          );
          return;
        }
      } catch (e) {
        setError(await mensajeDeError(e, 'No se pudo abrir la canción.'));
        return;
      }
      try {
        setLineas((await karaokeService.obtenerLetra(jobId)).lineas);
      } catch {
        // Sin letra la cancion igual se puede reproducir
        setLineas([]);
      }
      setLetraLista(true);
    })();
  }, [jobId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold text-white">Modo Karaoke</h1>
            <p className="text-gray-300 truncate">{job?.source_filename}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => void navigate('/procesamientos')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
            >
              Volver
            </button>
            <button className="border-2 border-blue-400 text-blue-200 hover:bg-blue-500 hover:text-white font-semibold px-4 py-2 rounded-lg">
              Pantalla completa
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">
            {error}
          </div>
        ) : (
          jobId &&
          job && (
            <ReproductorKaraoke
              jobId={jobId}
              lineas={lineas}
              letraLista={letraLista}
            />
          )
        )}
      </div>
    </div>
  );
}
