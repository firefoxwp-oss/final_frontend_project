import {CheckCircle, X, XCircle} from 'lucide-react';
import type {Aviso} from '../services/jobService';

/**
 * Aviso de finalizacion en la web (Pb-4): equivale a la notificacion del
 * celular y se muestra sin recargar la pagina.
 */
export default function AvisoFinalizacion({
  avisos,
  onAbrir,
  onCerrar,
}: {
  avisos: Aviso[];
  onAbrir: (jobId: string) => void;
  onCerrar: (jobId: string) => void;
}) {
  if (avisos.length === 0) return null;
  return (
    <div
      className="fixed top-6 right-6 z-50 flex w-96 max-w-[calc(100vw-3rem)] flex-col gap-3"
      role="status"
      aria-live="polite"
    >
      {avisos.map(aviso => (
        <div
          key={aviso.jobId}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xl ${
            aviso.terminado
              ? 'border-green-500 bg-green-900 text-green-100'
              : 'border-red-500 bg-red-900 text-red-100'
          }`}
        >
          {aviso.terminado ? (
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {aviso.terminado
                ? 'Tu canción está lista'
                : 'No se pudo procesar tu canción'}
            </p>
            <p className="truncate text-sm" title={aviso.archivo}>
              {aviso.terminado
                ? `${aviso.archivo} ya se puede cantar`
                : `${aviso.archivo}: revisa el motivo en su tarjeta`}
            </p>
            {aviso.terminado && (
              <button
                onClick={() => onAbrir(aviso.jobId)}
                className="mt-2 text-sm font-semibold underline"
              >
                Abrir
              </button>
            )}
          </div>
          <button
            onClick={() => onCerrar(aviso.jobId)}
            aria-label="Cerrar aviso"
            className="opacity-80 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
