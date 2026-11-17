import {useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {HomePage} from '../components/HomePage';
import {LoadingScreen} from '../components/LoadingScreen';
import {jobService, mensajeDeError} from '../services/jobService';

/**
 * Sube el archivo y lo deja en la cola del servidor.
 *
 * No espera el procesamiento: en cuanto el servidor confirma el trabajo, se
 * pasa a su pagina de seguimiento, que muestra la posicion en la cola, el
 * avance y, al terminar, los resultados.
 */
const UploadPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Proyecto desde el que se entró (ProjectsPage lo pasa al navegar)
  const location = useLocation();
  const projectId =
    (location.state as {projectId?: number} | null)?.projectId ?? null;

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
  };

  const subirVideo = async (archivo: File) => {
    setFile(archivo);
    setSubiendo(true);
    setProgresoSubida(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const trabajo = await jobService.subirVideo(
        archivo,
        'karaoke',
        projectId,
        {signal: controller.signal, onProgreso: setProgresoSubida},
      );
      void navigate(`/resultado/${trabajo.job_id}`);
    } catch (e) {
      if (controller.signal.aborted) {
        setFile(null);
      } else {
        setError(await mensajeDeError(e, 'No se pudo subir el archivo.'));
      }
    } finally {
      abortRef.current = null;
      setSubiendo(false);
    }
  };

  const cancelarSubida = () => {
    abortRef.current?.abort();
  };

  if (subiendo && file) {
    return (
      <LoadingScreen
        loading
        fileName={file.name}
        progress={progresoSubida}
        stageLabel="Subiendo el archivo"
        onCancel={cancelarSubida}
      />
    );
  }

  return (
    <HomePage
      onFileSelect={handleFileSelect}
      onAutoProcess={archivo => void subirVideo(archivo)}
      error={error}
    />
  );
};

export default UploadPage;
