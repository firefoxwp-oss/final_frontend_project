import {
  apiClient,
  authService,
  ensureFreshToken,
  API_BASE_URL,
} from './authService';

export type MediaKind =
  | 'video_karaoke'
  | 'video_instrumental'
  | 'video_karaoke_preview'
  | 'audio_original'
  | 'audio_vocals'
  | 'audio_instrumental'
  | 'subtitulos_srt'
  | 'subtitulos_ass';

/** Estados de un trabajo de procesamiento (la cola vive en el servidor). */
export type EstadoTrabajo =
  'queued' | 'running' | 'done' | 'error' | 'cancelled';

/** Tipo de video que se pide al subir el archivo. */
export type TipoVideo = 'karaoke' | 'instrumental';

/** Respuesta de la subida: el trabajo queda en la cola del servidor. */
export interface TrabajoEncolado {
  job_id: string;
  status: EstadoTrabajo;
}

/** Pide confirmacion antes de cancelar (regla de Pb-3). */
export const confirmarCancelacion = (nombreArchivo: string): boolean =>
  window.confirm(
    `¿Cancelar el procesamiento de "${nombreArchivo}"? Si ya empezó, se detendrá y se borrarán sus archivos.`,
  );

/** Un trabajo sigue en curso mientras espera en la cola o se procesa. */
export const enCurso = (estado: EstadoTrabajo): boolean =>
  estado === 'queued' || estado === 'running';

/** Detalle completo de un procesamiento (el backend devuelve lo mismo en
 *  `GET /jobs` y en `GET /jobs/{id}`, para poder reabrirlo desde el historial). */
export interface JobDetail {
  id: string;
  source_filename: string;
  status: EstadoTrabajo;
  stage: string | null;
  progress: number;
  video_type: 'karaoke' | 'instrumental' | null;
  project_id: number | null;
  duration_seconds: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** Posicion en la cola (1 = el siguiente); null si ya no espera. */
  queue_position: number | null;
  artifacts: Record<string, boolean>;
}

export type JobSummary = JobDetail;
export type JobStatus = JobDetail;

/** Etiquetas legibles de cada estado de un trabajo. */
export const ESTADOS: Record<EstadoTrabajo, string> = {
  queued: 'En cola',
  running: 'Procesando',
  done: 'Terminado',
  error: 'Error',
  cancelled: 'Cancelado',
};

/** Etiquetas legibles para cada etapa real del pipeline. */
export const ETAPAS: Record<string, string> = {
  en_cola: 'En cola, esperando su turno',
  recibiendo: 'Recibiendo el archivo',
  extrayendo_audio: 'Extrayendo el audio',
  separando_voces: 'Separando voces y música',
  generando_instrumental: 'Generando la pista instrumental',
  transcribiendo: 'Transcribiendo la letra',
  generando_subtitulos: 'Creando los subtítulos',
  generando_karaoke: 'Montando el vídeo karaoke',
  completado: 'Completado',
};

export const etiquetaEtapa = (stage: string | null | undefined): string =>
  (stage && ETAPAS[stage]) || 'Procesando tu vídeo';

/**
 * URL de un archivo del trabajo.
 *
 * Los elementos <audio> y <video> no pueden enviar la cabecera Authorization,
 * así que el token viaja como parámetro. Se pasa explícitamente para poder
 * reconstruir las URLs con un token recién renovado: un procesamiento dura más
 * que la vida del token y, si no, las pistas dejan de sonar a mitad de sesión.
 */
export const mediaUrl = (
  jobId: string,
  kind: MediaKind,
  token?: string | null,
): string => {
  const t = token ?? authService.getAccessToken() ?? '';
  return `${API_BASE_URL}/descargar/${kind}/${encodeURIComponent(
    jobId,
  )}?token=${encodeURIComponent(t)}`;
};

export const previewUrl = (jobId: string, token?: string | null): string => {
  const t = token ?? authService.getAccessToken() ?? '';
  return `${API_BASE_URL}/karaoke/preview/${encodeURIComponent(
    jobId,
  )}?token=${encodeURIComponent(t)}`;
};

/** Token válido para incrustar en URLs de reproducción. */
export const tokenParaMedios = (
  margenSegundos?: number,
): Promise<string | null> => ensureFreshToken(margenSegundos);

/** Convierte un error de axios (incluido un cuerpo Blob) en texto legible. */
export const mensajeDeError = async (
  e: unknown,
  porDefecto = 'Algo no ha ido bien.',
): Promise<string> => {
  const err = e as {
    response?: {status?: number; data?: unknown};
    message?: string;
  };
  const status = err?.response?.status;

  let detalle = '';
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const texto = await data.text();
      const json = JSON.parse(texto) as {detail?: string; error?: string};
      detalle = json.detail || json.error || '';
    } catch {
      /* el cuerpo no era JSON */
    }
  } else if (data && typeof data === 'object') {
    const obj = data as {detail?: string; error?: string};
    detalle = obj.detail || obj.error || '';
  }

  if (status === 401)
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.';
  if (status === 403) return 'Este archivo pertenece a otra cuenta.';
  if (status === 404)
    return 'Ese archivo todavía no está disponible para este vídeo.';
  if (!err?.response)
    return 'No se pudo conectar con el servidor. Comprueba que esté en marcha.';

  return detalle || err?.message || porDefecto;
};

const guardarBlob = (blob: Blob, nombre: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const jobService = {
  /**
   * Sube el archivo y lo deja en la cola del servidor.
   *
   * Responde en cuanto termina la subida, con el id del trabajo: el
   * procesamiento continua en el servidor aunque se cierre el navegador.
   */
  async subirVideo(
    archivo: File,
    tipoVideo: TipoVideo,
    projectId: number | null,
    opciones: {
      signal?: AbortSignal;
      onProgreso?: (porcentaje: number) => void;
    } = {},
  ): Promise<TrabajoEncolado> {
    const formData = new FormData();
    formData.append('file', archivo);
    formData.append('video_type', tipoVideo);
    if (projectId !== null) formData.append('project_id', String(projectId));

    const res = await apiClient.post('/procesar-video/', formData, {
      // El cliente por defecto envia JSON: un formulario necesita multipart
      headers: {'Content-Type': 'multipart/form-data'},
      signal: opciones.signal,
      onUploadProgress: evento => {
        if (evento.total) {
          opciones.onProgreso?.(
            Math.round((evento.loaded * 100) / evento.total),
          );
        }
      },
    });
    return res.data;
  },

  async getStatus(jobId: string): Promise<JobDetail> {
    const res = await apiClient.get(`/jobs/${encodeURIComponent(jobId)}`);
    return res.data;
  },

  async listJobs(projectId?: number | null): Promise<JobDetail[]> {
    const res = await apiClient.get('/jobs', {
      params:
        projectId !== null && projectId !== undefined
          ? {project_id: projectId}
          : undefined,
    });
    return res.data;
  },

  /** Cancela un trabajo en cola o en proceso (Pb-3). */
  async cancelarTrabajo(jobId: string): Promise<void> {
    await apiClient.post(`/jobs/${encodeURIComponent(jobId)}/cancelar`);
  },

  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`/jobs/${encodeURIComponent(jobId)}`);
  },

  async getWaveform(jobId: string, kind: MediaKind): Promise<number[]> {
    const res = await apiClient.get(
      `/jobs/${encodeURIComponent(jobId)}/waveform/${kind}`,
    );
    return res.data?.peaks ?? [];
  },

  /**
   * Descarga un archivo del trabajo.
   *
   * Va por axios (cabecera Authorization, con renovación automática del token)
   * en lugar de navegar a la URL: así un error se puede capturar y mostrar en
   * la interfaz, en vez de dejar al navegador enseñando un JSON crudo.
   */
  async descargarArchivo(
    jobId: string,
    kind: MediaKind,
    nombre: string,
  ): Promise<void> {
    const res = await apiClient.get(
      `/descargar/${kind}/${encodeURIComponent(jobId)}`,
      {responseType: 'blob'},
    );
    guardarBlob(res.data as Blob, nombre);
  },

  async descargarTodo(jobId: string, nombre: string): Promise<void> {
    const res = await apiClient.get(
      `/descargar/todo/${encodeURIComponent(jobId)}`,
      {responseType: 'blob'},
    );
    guardarBlob(res.data as Blob, nombre);
  },
};

/** Aviso de un trabajo que termino mientras el usuario estaba en la web. */
export interface Aviso {
  jobId: string;
  archivo: string;
  terminado: boolean;
}

/**
 * Trabajos que estaban en cola o en proceso y ahora terminaron (bien o con
 * error), comparando dos consultas sucesivas del estado.
 */
export const detectarFinalizados = (
  anteriores: JobDetail[],
  actuales: JobDetail[],
): Aviso[] => {
  const enCursoAntes = new Set(
    anteriores.filter(job => enCurso(job.status)).map(job => job.id),
  );
  return actuales
    .filter(
      job =>
        enCursoAntes.has(job.id) &&
        (job.status === 'done' || job.status === 'error'),
    )
    .map(job => ({
      jobId: job.id,
      archivo: job.source_filename,
      terminado: job.status === 'done',
    }));
};
