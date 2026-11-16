import {
  apiClient,
  authService,
  ensureFreshToken,
  API_BASE_URL,
} from "./authService";

export type MediaKind =
  | "video_karaoke"
  | "video_instrumental"
  | "video_karaoke_preview"
  | "audio_original"
  | "audio_vocals"
  | "audio_instrumental"
  | "subtitulos_srt"
  | "subtitulos_ass";

/** Detalle completo de un procesamiento (el backend devuelve lo mismo en
 *  `GET /jobs` y en `GET /jobs/{id}`, para poder reabrirlo desde el historial). */
export interface JobDetail {
  id: string;
  source_filename: string;
  status: "running" | "done" | "error";
  stage: string | null;
  progress: number;
  video_type: "karaoke" | "instrumental" | null;
  project_id: number | null;
  duration_seconds: number | null;
  error: string | null;
  created_at: string;
  artifacts: Record<string, boolean>;
}

export type JobSummary = JobDetail;
export type JobStatus = JobDetail;

/** Etiquetas legibles para cada etapa real del pipeline. */
export const ETAPAS: Record<string, string> = {
  recibiendo: "Recibiendo el archivo",
  extrayendo_audio: "Extrayendo el audio",
  separando_voces: "Separando voces y música",
  generando_instrumental: "Generando la pista instrumental",
  transcribiendo: "Transcribiendo la letra",
  generando_subtitulos: "Creando los subtítulos",
  generando_karaoke: "Montando el vídeo karaoke",
  completado: "Completado",
};

export const etiquetaEtapa = (stage: string | null | undefined): string =>
  (stage && ETAPAS[stage]) || "Procesando tu vídeo";

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
  token?: string | null
): string => {
  const t = token ?? authService.getAccessToken() ?? "";
  return `${API_BASE_URL}/descargar/${kind}/${encodeURIComponent(
    jobId
  )}?token=${encodeURIComponent(t)}`;
};

export const previewUrl = (jobId: string, token?: string | null): string => {
  const t = token ?? authService.getAccessToken() ?? "";
  return `${API_BASE_URL}/karaoke/preview/${encodeURIComponent(
    jobId
  )}?token=${encodeURIComponent(t)}`;
};

/** Token válido para incrustar en URLs de reproducción. */
export const tokenParaMedios = (
  margenSegundos?: number
): Promise<string | null> => ensureFreshToken(margenSegundos);

/** Convierte un error de axios (incluido un cuerpo Blob) en texto legible. */
export const mensajeDeError = async (
  e: unknown,
  porDefecto = "Algo no ha ido bien."
): Promise<string> => {
  const err = e as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const status = err?.response?.status;

  let detalle = "";
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const texto = await data.text();
      const json = JSON.parse(texto) as { detail?: string; error?: string };
      detalle = json.detail || json.error || "";
    } catch {
      /* el cuerpo no era JSON */
    }
  } else if (data && typeof data === "object") {
    const obj = data as { detail?: string; error?: string };
    detalle = obj.detail || obj.error || "";
  }

  if (status === 401)
    return "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.";
  if (status === 403)
    return "Este archivo pertenece a otra cuenta.";
  if (status === 404)
    return "Ese archivo todavía no está disponible para este vídeo.";
  if (!err?.response)
    return "No se pudo conectar con el servidor. Comprueba que esté en marcha.";

  return detalle || err?.message || porDefecto;
};

/** Dispara la descarga de una URL ya existente (por ejemplo un object URL). */
export const guardarDesdeUrl = (url: string, nombre: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const guardarBlob = (blob: Blob, nombre: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const jobService = {
  async getStatus(jobId: string): Promise<JobDetail> {
    const res = await apiClient.get(`/jobs/${encodeURIComponent(jobId)}`);
    return res.data;
  },

  async listJobs(projectId?: number | null): Promise<JobDetail[]> {
    const res = await apiClient.get("/jobs", {
      params: projectId != null ? { project_id: projectId } : undefined,
    });
    return res.data;
  },

  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`/jobs/${encodeURIComponent(jobId)}`);
  },

  async getWaveform(jobId: string, kind: MediaKind): Promise<number[]> {
    const res = await apiClient.get(
      `/jobs/${encodeURIComponent(jobId)}/waveform/${kind}`
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
    nombre: string
  ): Promise<void> {
    const res = await apiClient.get(
      `/descargar/${kind}/${encodeURIComponent(jobId)}`,
      { responseType: "blob" }
    );
    guardarBlob(res.data as Blob, nombre);
  },

  async descargarTodo(jobId: string, nombre: string): Promise<void> {
    const res = await apiClient.get(
      `/descargar/todo/${encodeURIComponent(jobId)}`,
      { responseType: "blob" }
    );
    guardarBlob(res.data as Blob, nombre);
  },
};
