/**
 * Validación de archivos antes de subirlos.
 *
 * Los mismos límites que aplica el backend, para avisar al usuario sin gastar
 * una subida completa. El backend vuelve a validarlos: esto es solo la primera
 * barrera.
 */

export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
export const MAX_DURATION_SECONDS = 60 * 60; // 60 min
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;

export const EXTENSIONES_PERMITIDAS = [
  '.mp4',
  '.avi',
  '.mkv',
  '.mp3',
  '.mov',
  '.m4v',
  '.webm',
];

export const ACCEPT_ATTR = EXTENSIONES_PERMITIDAS.join(',');

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const extensionDe = (nombre: string): string => {
  const i = nombre.lastIndexOf('.');
  return i === -1 ? '' : nombre.slice(i).toLowerCase();
};

const formatearMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Lee metadatos del vídeo sin subirlo: resolución y duración. */
const inspeccionarVideo = (file: File): Promise<ValidationResult> =>
  new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);

    const limpiar = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const {videoWidth: w, videoHeight: h, duration} = video;
      limpiar();

      if (duration && duration > MAX_DURATION_SECONDS) {
        resolve({
          isValid: false,
          error: `El vídeo dura ${Math.round(
            duration / 60,
          )} minutos y el máximo son ${MAX_DURATION_SECONDS / 60}.`,
        });
        return;
      }
      // Un MP3 no tiene pista de vídeo: ancho y alto valen 0 y es correcto.
      if (w > 0 && h > 0 && (w < MIN_WIDTH || h < MIN_HEIGHT)) {
        resolve({
          isValid: false,
          error: `La resolución mínima es ${MIN_WIDTH}x${MIN_HEIGHT} (este archivo es ${w}x${h}).`,
        });
        return;
      }
      resolve({isValid: true});
    };

    video.onerror = () => {
      limpiar();
      resolve({
        isValid: false,
        error: 'No se pudo leer el archivo. ¿Está dañado o incompleto?',
      });
    };

    video.src = url;
  });

export const validateFile = async (file: File): Promise<ValidationResult> => {
  if (file.size === 0) {
    return {isValid: false, error: 'El archivo está vacío.'};
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `El archivo pesa ${formatearMB(
        file.size,
      )} MB y el máximo es ${formatearMB(MAX_FILE_SIZE)} MB.`,
    };
  }

  const ext = extensionDe(file.name);
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
    return {
      isValid: false,
      error: `Formato no admitido (${ext || 'sin extensión'}). Admitidos: ${EXTENSIONES_PERMITIDAS.join(
        ', ',
      )}.`,
    };
  }

  return inspeccionarVideo(file);
};
