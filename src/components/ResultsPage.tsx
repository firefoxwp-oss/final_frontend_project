import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  jobService,
  mediaUrl,
  previewUrl,
  tokenParaMedios,
  mensajeDeError,
} from "../services/jobService";
import type { MediaKind } from "../services/jobService";

interface ResultsPageProps {
  originalVideoUrl: string | null;
  jobId: string | null;
  originalFileName: string | null;
  /** karaoke si se pudo incrustar la letra, instrumental si no. */
  videoType?: "karaoke" | "instrumental" | null;
  onBack?: () => void;
}

type TrackId = "original" | "vocals" | "background";

const PISTAS: {
  id: TrackId;
  title: string;
  kind: MediaKind;
  waveformColor: string;
}[] = [
  {
    id: "original",
    title: "Audio Original",
    kind: "audio_original",
    waveformColor: "#60A5FA",
  },
  {
    id: "vocals",
    title: "Voces",
    kind: "audio_vocals",
    waveformColor: "#34D399",
  },
  {
    id: "background",
    title: "Música de Fondo",
    kind: "audio_instrumental",
    waveformColor: "#34D399",
  },
];

const estadoInicial = { isPlaying: false, currentTime: 0, duration: 0 };

export const ResultsPage: React.FC<ResultsPageProps> = ({
  originalVideoUrl,
  jobId,
  originalFileName,
  videoType,
  onBack,
}) => {
  const { logout } = useAuth();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const [audioStates, setAudioStates] = useState<Record<TrackId, typeof estadoInicial>>({
    original: { ...estadoInicial },
    vocals: { ...estadoInicial },
    background: { ...estadoInicial },
  });

  const [waveforms, setWaveforms] = useState<Record<TrackId, number[]>>({
    original: [],
    vocals: [],
    background: [],
  });

  // Token válido para las URLs de reproducción. Un procesamiento dura más que
  // la vida del token, así que hay que renovarlo antes de construirlas.
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const reintentos = useRef<Record<string, boolean>>({});

  const [aviso, setAviso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Record<TrackId, HTMLAudioElement | null>>({
    original: null,
    vocals: null,
    background: null,
  });

  // --------------------------------------------------------------- token
  useEffect(() => {
    let vivo = true;
    (async () => {
      const t = await tokenParaMedios();
      if (!vivo) return;
      setMediaToken(t);
      setListo(true);
      if (!t) setAviso("Tu sesión ha caducado. Vuelve a iniciar sesión.");
    })();

    // Renovación periódica para sesiones largas de escucha.
    const id = window.setInterval(async () => {
      const t = await tokenParaMedios();
      if (vivo && t) setMediaToken(t);
    }, 10 * 60 * 1000);

    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  /** Renueva el token y reintenta una vez el elemento que ha fallado. */
  const reintentarConTokenNuevo = useCallback(async (clave: string) => {
    if (reintentos.current[clave]) {
      setAviso(
        "No se pudo cargar el audio. Si el problema sigue, vuelve a iniciar sesión."
      );
      return;
    }
    reintentos.current[clave] = true;
    const t = await tokenParaMedios(0);
    if (t) {
      setMediaToken(t);
      setAviso(null);
    } else {
      setAviso("Tu sesión ha caducado. Vuelve a iniciar sesión.");
    }
  }, []);

  // ------------------------------------------------------------- fuentes
  const fuentesVideo = (
    [
      jobId && videoType !== "instrumental" ? previewUrl(jobId, mediaToken) : null,
      jobId ? mediaUrl(jobId, "video_instrumental", mediaToken) : null,
      originalVideoUrl,
    ].filter(Boolean) as string[]
  );
  const [fuenteIndex, setFuenteIndex] = useState(0);
  const videoSrc = listo ? fuentesVideo[fuenteIndex] : undefined;

  const tituloVideo = originalFileName
    ? `${originalFileName} - ${videoType === "instrumental" ? "Instrumental" : "Karaoke"}`
    : "Vídeo Karaoke";

  // ------------------------------------------------------------ waveforms
  useEffect(() => {
    if (!jobId) return;
    let cancelado = false;

    (async () => {
      for (const pista of PISTAS) {
        try {
          const peaks = await jobService.getWaveform(jobId, pista.kind);
          if (!cancelado && peaks.length) {
            setWaveforms((prev) => ({ ...prev, [pista.id]: peaks }));
          }
        } catch {
          /* la pista puede no existir todavía */
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [jobId]);

  // ---------------------------------------------------------------- vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => setDuration(video.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoSrc]);

  // --------------------------------------------------------------- audios
  // Un único efecto para las tres pistas: antes eran tres bloques idénticos.
  useEffect(() => {
    const limpiezas: (() => void)[] = [];

    PISTAS.forEach(({ id }) => {
      const audio = audioRefs.current[id];
      if (!audio) return;

      const actualizar = (cambios: Partial<typeof estadoInicial>) =>
        setAudioStates((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));

      const onTime = () => actualizar({ currentTime: audio.currentTime });
      const onMeta = () => actualizar({ duration: audio.duration || 0 });
      const onPlay = () => actualizar({ isPlaying: true });
      const onPause = () => actualizar({ isPlaying: false });
      const onEnded = () => actualizar({ isPlaying: false, currentTime: 0 });
      const onError = () => {
        actualizar({ isPlaying: false });
        void reintentarConTokenNuevo(`audio-${id}`);
      };

      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("loadedmetadata", onMeta);
      audio.addEventListener("play", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      limpiezas.push(() => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("loadedmetadata", onMeta);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      });
    });

    return () => limpiezas.forEach((fn) => fn());
  }, [jobId, mediaToken, reintentarConTokenNuevo]);

  // ------------------------------------------------------------ controles
  const handleVideoPlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      void video.play().catch(() => {
        setAviso("No se pudo reproducir el vídeo. Reintentando con la sesión renovada…");
        void reintentarConTokenNuevo("video");
      });
    }
  };

  const handleVideoSeek = (time: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(time)) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nuevo = !isMuted;
    video.muted = nuevo;
    setIsMuted(nuevo);
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void (video.requestFullscreen?.() ?? Promise.resolve());
    }
  };

  const pausarTodas = useCallback(() => {
    PISTAS.forEach(({ id }) => audioRefs.current[id]?.pause());
  }, []);

  const handleTrackToggle = async (id: TrackId) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (audioStates[id].isPlaying) {
      audio.pause();
      return;
    }

    pausarTodas();
    videoRef.current?.pause();
    setAviso(null);

    try {
      await audio.play();
      reintentos.current[`audio-${id}`] = false;
    } catch {
      // Causa habitual: el token de la URL caducó mientras se procesaba.
      await reintentarConTokenNuevo(`audio-${id}`);
      try {
        audio.load();
        await audio.play();
      } catch {
        setAviso(
          "No se pudo reproducir esta pista. Prueba a recargar la página o a iniciar sesión de nuevo."
        );
      }
    }
  };

  const formatTime = (segundos: number) => {
    if (!isFinite(segundos) || segundos < 0) return "0:00";
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // ------------------------------------------------------------ descargas
  const nombre = originalFileName || "video";

  const descargar = async (kind: MediaKind, sufijo: string, etiqueta: string) => {
    if (!jobId) return;
    setAviso(null);
    setDescargando(etiqueta);
    try {
      await jobService.descargarArchivo(jobId, kind, `${nombre}${sufijo}`);
    } catch (e) {
      setAviso(await mensajeDeError(e, "No se pudo descargar el archivo."));
    } finally {
      setDescargando(null);
    }
  };

  const descargarTodo = async () => {
    if (!jobId) return;
    setAviso(null);
    setDescargando("todo");
    try {
      await jobService.descargarTodo(jobId, `${nombre}_completo.zip`);
    } catch (e) {
      setAviso(await mensajeDeError(e, "No se pudo preparar el ZIP."));
    } finally {
      setDescargando(null);
    }
  };

  const botonesAudio: {
    kind: MediaKind;
    sufijo: string;
    label: string;
    color: string;
  }[] = [
    { kind: "audio_original", sufijo: "_original.wav", label: "Descargar Audio", color: "bg-green-600 hover:bg-green-700" },
    { kind: "audio_vocals", sufijo: "_vocal.wav", label: "Descargar Audio (Vocal)", color: "bg-emerald-600 hover:bg-emerald-700" },
    { kind: "audio_instrumental", sufijo: "_instrumental.wav", label: "Descargar Audio Instrumental", color: "bg-teal-600 hover:bg-teal-700" },
  ];

  const IconoDescarga = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );

  const textoBoton = (etiqueta: string, porDefecto: string) =>
    descargando === etiqueta ? "Preparando…" : porDefecto;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="flex min-h-screen">
        {/* Sección izquierda - Pistas de audio */}
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={onBack}
              title="Procesar otro vídeo"
              className="text-gray-400 hover:text-white transition-colors mr-4"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-white text-xl font-semibold">Pistas de Audio</h2>
            <button onClick={logout} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg">
              Cerrar sesión
            </button>
          </div>

          {/* Avisos: antes el navegador mostraba el JSON crudo del error */}
          {aviso && (
            <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-amber-500 bg-amber-900/40 px-4 py-3 text-amber-100 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">{aviso}</p>
              </div>
              <button
                onClick={() => setAviso(null)}
                className="text-amber-200 hover:text-white flex-shrink-0"
                title="Cerrar aviso"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Reproductor de video */}
          <div className="mb-8 max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-black text-lg font-medium mb-4">{tituloVideo}</h3>

              <div className="bg-black rounded-lg overflow-hidden">
                <div className="relative">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="w-full h-80 object-contain bg-black"
                    playsInline
                    onError={() => {
                      if (fuenteIndex < fuentesVideo.length - 1) {
                        setFuenteIndex((i) => i + 1);
                      } else {
                        void reintentarConTokenNuevo("video");
                      }
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-4">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={handleVideoPlayPause}
                        className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
                      >
                        {isPlaying ? (
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      <span className="text-white text-sm">{formatTime(currentTime)}</span>

                      <div
                        className="flex-1 h-1 bg-gray-600 rounded-full cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pct = (e.clientX - rect.left) / rect.width;
                          handleVideoSeek(pct * duration);
                        }}
                      >
                        <div
                          className="h-1 bg-white rounded-full transition-all duration-200"
                          style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
                        ></div>
                      </div>

                      <span className="text-white text-sm">{formatTime(duration)}</span>

                      <button onClick={handleToggleMute} className="text-white hover:text-gray-300 transition-colors">
                        {isMuted ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 2.007A.75.75 0 0110 2.75v14.5a.75.75 0 01-1.617.493L5.66 14.5H3.25A.75.75 0 012.5 13.75v-7.5a.75.75 0 01.75-.75h2.41l2.723-2.743a.75.75 0 011.009-.003zM15.53 9.47a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm-2.69-2.69a.75.75 0 010 1.06L11.72 9.53a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 2.007A.75.75 0 0110 2.75v14.5a.75.75 0 01-1.617.493L5.66 14.5H3.25A.75.75 0 012.5 13.75v-7.5a.75.75 0 01.75-.75h2.41l2.723-2.743a.75.75 0 011.009-.003zM16.25 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={handleFullscreen}
                        title="Pantalla completa"
                        className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
                      >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {videoType === "instrumental" && (
                <p className="mt-3 text-sm text-amber-700">
                  No se pudieron generar los subtítulos de esta canción; se muestra la pista instrumental.
                </p>
              )}
            </div>
          </div>

          {/* Pistas de audio */}
          <div className="space-y-4 max-w-2xl mx-auto">
            {PISTAS.map((track) => {
              const estado = audioStates[track.id];
              const picos = waveforms[track.id];
              const progreso =
                estado.duration > 0 ? estado.currentTime / estado.duration : 0;

              return (
                <div
                  key={track.id}
                  className={`bg-gray-800 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-gray-700 ${
                    estado.isPlaying ? "ring-2 ring-blue-500" : ""
                  }`}
                  onClick={() => void handleTrackToggle(track.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-medium text-lg">{track.title}</h3>
                    <div className="flex items-center space-x-3">
                      <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        {estado.isPlaying ? (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <span className="text-gray-400 text-sm font-mono">
                        {formatTime(estado.currentTime)} / {formatTime(estado.duration)}
                      </span>
                    </div>
                  </div>

                  {/* Forma de onda real del audio */}
                  <div className="flex items-end gap-px h-12">
                    {(picos.length ? picos : new Array(120).fill(0.12)).map((alto, index, arr) => {
                      const reproducido = index / arr.length <= progreso;
                      return (
                        <div
                          key={index}
                          className="flex-1 rounded-full transition-opacity duration-200"
                          style={{
                            height: `${Math.max(4, alto * 100)}%`,
                            backgroundColor: track.waveformColor,
                            opacity: estado.isPlaying ? (reproducido ? 1 : 0.45) : 0.7,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sección derecha - Panel de descarga */}
        <div className="w-80 bg-gray-900 p-6 flex flex-col justify-start">
          <div className="mb-8">
            <button
              onClick={descargarTodo}
              disabled={!jobId || descargando !== null}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{textoBoton("todo", "Descargar Todo")}</span>
            </button>
          </div>

          <div className="space-y-4">
            {botonesAudio.map((b) => (
              <div key={b.kind} className="h-20 flex items-center">
                <button
                  onClick={() => void descargar(b.kind, b.sufijo, b.kind)}
                  disabled={!jobId || descargando !== null}
                  className={`w-full ${b.color} disabled:opacity-40 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors`}
                >
                  <IconoDescarga />
                  <span>{textoBoton(b.kind, b.label)}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Vídeos y subtítulos generados */}
          <div className="mt-6 border-t border-gray-700 pt-6 space-y-3">
            {videoType !== "instrumental" && (
              <button
                onClick={() => void descargar("video_karaoke", "_karaoke.mp4", "video_karaoke")}
                disabled={!jobId || descargando !== null}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors"
              >
                <IconoDescarga />
                <span>{textoBoton("video_karaoke", "Descargar Vídeo Karaoke")}</span>
              </button>
            )}
            <button
              onClick={() => void descargar("video_instrumental", "_instrumental.mp4", "video_instrumental")}
              disabled={!jobId || descargando !== null}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors"
            >
              <IconoDescarga />
              <span>{textoBoton("video_instrumental", "Descargar Vídeo Instrumental")}</span>
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => void descargar("subtitulos_srt", ".srt", "srt")}
                disabled={!jobId || descargando !== null}
                className="w-1/2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white py-2 px-3 rounded-lg text-sm transition-colors"
              >
                {textoBoton("srt", "Subtítulos .SRT")}
              </button>
              <button
                onClick={() => void descargar("subtitulos_ass", ".ass", "ass")}
                disabled={!jobId || descargando !== null}
                className="w-1/2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white py-2 px-3 rounded-lg text-sm transition-colors"
              >
                {textoBoton("ass", "Karaoke .ASS")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Elementos de audio ocultos.
          preload="none": antes se pedían los tres WAV (43 MB cada uno) nada más
          abrir la página, compitiendo con el vídeo por las conexiones. */}
      {listo &&
        PISTAS.map((track) => (
          <audio
            key={`${track.id}-${mediaToken ?? "sin-token"}`}
            ref={(el) => {
              audioRefs.current[track.id] = el;
            }}
            src={jobId ? mediaUrl(jobId, track.kind, mediaToken) : undefined}
            preload="none"
          />
        ))}
    </div>
  );
};
