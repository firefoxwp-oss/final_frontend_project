import {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {HomePage} from '../components/HomePage';
import {LoadingScreen} from '../components/LoadingScreen';
import {ResultsPage} from '../components/ResultsPage';
import {API_BASE_URL, ensureFreshToken} from '../services/authService';
import {
  jobService,
  etiquetaEtapa,
  guardarDesdeUrl,
} from '../services/jobService';

type VideoType = 'karaoke' | 'instrumental';

const UploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<VideoType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Progreso real publicado por el backend
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState('Preparando…');

  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<number | null>(null);

  // Proyecto desde el que se entró (ProjectsPage lo pasa al navegar)
  const location = useLocation();
  const projectId =
    (location.state as {projectId?: number} | null)?.projectId ?? null;

  const detenerPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => detenerPolling(), []);

  useEffect(() => {
    return () => {
      if (originalVideoUrl) URL.revokeObjectURL(originalVideoUrl);
    };
  }, [originalVideoUrl]);

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setJobId(null);
    setVideoType(null);
    setFile(selectedFile);

    const originalName = selectedFile.name.split('.').slice(0, -1).join('.');
    sessionStorage.setItem('originalFileName', originalName);

    setOriginalVideoUrl(URL.createObjectURL(selectedFile));
  };

  /** Consulta el progreso real mientras la subida sigue en curso. */
  const iniciarPolling = (id: string) => {
    detenerPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const estado = await jobService.getStatus(id);
        setProgress(estado.progress);
        setStageLabel(etiquetaEtapa(estado.stage));
        if (estado.status !== 'running') detenerPolling();
      } catch {
        // El trabajo aún no existe en los primeros instantes: se reintenta.
      }
    }, 2000);
  };

  const handleAutoProcess = async (selectedFile: File) => {
    const nuevoJobId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setLoading(true);
    setError(null);
    setProgress(2);
    setStageLabel('Subiendo el archivo');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('job_id', nuevoJobId);
      if (projectId !== null) formData.append('project_id', String(projectId));

      iniciarPolling(nuevoJobId);

      // Token renovado antes de empezar: el procesamiento dura mas que la
      // vida del token y no queremos que caduque a mitad de la subida.
      const token = (await ensureFreshToken()) ?? '';

      const response = await fetch(`${API_BASE_URL}/procesar-video/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        let detalle = `Error ${response.status}`;
        try {
          const cuerpo = await response.json();
          if (cuerpo?.detail) detalle = cuerpo.detail;
          else if (cuerpo?.error) detalle = cuerpo.error;
        } catch {
          /* la respuesta no era JSON */
        }
        throw new Error(detalle);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const headerJobId = response.headers.get('X-Job-ID') ?? nuevoJobId;
      // El backend indica si pudo generar el karaoke o solo el instrumental;
      // el nombre del archivo descargado debe reflejarlo.
      const tipo =
        (response.headers.get('X-Video-Type') as VideoType | null) ??
        'instrumental';

      setJobId(headerJobId);
      setVideoType(tipo);
      sessionStorage.setItem('currentJobId', headerJobId);

      const originalName = selectedFile.name.split('.').slice(0, -1).join('.');
      guardarDesdeUrl(url, `${originalName}_${tipo}.mp4`);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setFile(null);
        setOriginalVideoUrl(null);
      } else {
        const mensaje =
          err instanceof Error ? err.message : 'Error desconocido al procesar';
        setError(mensaje);
      }
    } finally {
      detenerPolling();
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    detenerPolling();
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setVideoType(null);
    setError(null);
    setOriginalVideoUrl(null);
    sessionStorage.removeItem('currentJobId');
  };

  if (!file) {
    return (
      <HomePage
        onFileSelect={handleFileSelect}
        onAutoProcess={handleAutoProcess}
        error={error}
      />
    );
  }

  if (loading) {
    return (
      <LoadingScreen
        loading={loading}
        fileName={file.name}
        progress={progress}
        stageLabel={stageLabel}
        onCancel={handleCancel}
      />
    );
  }

  if (error) {
    return (
      <HomePage
        onFileSelect={handleFileSelect}
        onAutoProcess={handleAutoProcess}
        error={error}
      />
    );
  }

  return (
    <ResultsPage
      originalVideoUrl={originalVideoUrl}
      jobId={jobId}
      originalFileName={sessionStorage.getItem('originalFileName')}
      videoType={videoType}
      onBack={handleReset}
    />
  );
};

export default UploadPage;
