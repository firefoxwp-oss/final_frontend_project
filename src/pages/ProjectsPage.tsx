import {useCallback, useEffect, useState} from 'react';
import {useAuth} from '../context/useAuth';
import {projectService} from '../services/projectService';
import type {Project} from '../services/projectService';
import {jobService, mensajeDeError} from '../services/jobService';
import type {JobSummary} from '../services/jobService';
import {useNavigate} from 'react-router-dom';

export default function ProjectsPage() {
  const {user, logout} = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');

  // Historial de procesamientos por proyecto
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);

  const openProject = (id: number) => {
    void navigate('/upload', {state: {projectId: id}});
  };

  // Reabre un procesamiento con la misma vista que al terminarlo
  const abrirJob = (jobId: string) => navigate(`/resultado/${jobId}`);

  const loadProjects = useCallback(async () => {
    if (!user?.id) return;
    try {
      setError(null);
      const data = await projectService.getProjects(user.id);
      setProjects(data);
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudieron cargar los proyectos.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadJobs = useCallback(async () => {
    if (!user?.id) return;
    try {
      setJobs(await jobService.listJobs());
    } catch {
      /* el historial es complementario: no bloquea la página */
    }
  }, [user]);

  useEffect(() => {
    void loadProjects();
    void loadJobs();
  }, [loadProjects, loadJobs]);

  const createProject = async () => {
    if (!name.trim() || !user) return;
    try {
      setError(null);
      const newProject = await projectService.createProject({
        name: name.trim(),
        user_id: user.id,
      });
      setProjects([newProject, ...projects]);
      setName('');
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudo crear el proyecto.'));
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este proyecto?')) return;
    try {
      setError(null);
      await projectService.deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudo eliminar el proyecto.'));
    }
  };

  const startEditing = (project: Project) => {
    setEditingProject(project);
    setEditName(project.name);
  };

  const saveEdit = async () => {
    if (!editingProject || !editName.trim()) return;
    try {
      setError(null);
      const updated = await projectService.updateProject(editingProject.id, {
        name: editName.trim(),
      });
      setProjects(
        projects.map(p => (p.id === editingProject.id ? updated : p)),
      );
      setEditingProject(null);
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudo guardar el cambio.'));
    }
  };

  const borrarJob = async (jobId: string) => {
    if (!confirm('¿Eliminar este procesamiento y sus archivos?')) return;
    try {
      await jobService.deleteJob(jobId);
      setJobs(jobs.filter(j => j.id !== jobId));
    } catch (e) {
      setError(
        await mensajeDeError(e, 'No se pudo eliminar el procesamiento.'),
      );
    }
  };

  const jobsDe = (projectId: number) =>
    jobs.filter(j => j.project_id === projectId);

  // Las descargas van por axios (cabecera Authorization con renovacion
  // automatica): si fallan, se muestra el motivo en vez de un JSON crudo.
  const descargarZip = async (jobId: string, nombre: string) => {
    try {
      setError(null);
      await jobService.descargarTodo(jobId, nombre);
    } catch (e) {
      setError(await mensajeDeError(e, 'No se pudo preparar el ZIP.'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-4xl font-bold text-white mb-1">
              Tus Proyectos
            </h1>
            <p className="text-gray-300 text-lg">
              Gestiona tus proyectos antes de procesar archivos.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void navigate('/procesamientos')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
            >
              Mis procesamientos
            </button>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6 shadow-lg mb-10 border border-gray-700">
          <h2 className="text-white text-xl font-semibold mb-4">
            Crear Proyecto
          </h2>

          <div className="flex space-x-3">
            <input
              type="text"
              placeholder="Nombre del proyecto"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void createProject()}
              className="w-full px-3 py-2 rounded-md bg-gray-700 text-white border border-gray-600"
            />
            <button
              onClick={createProject}
              className="bg-green-600 hover:bg-green-700 text-white px-4 rounded-lg"
            >
              Crear
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-300">Cargando proyectos...</p>
        ) : projects.length === 0 ? (
          <p className="text-gray-300 text-lg">No tienes proyectos todavía.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map(p => {
              const propios = jobsDe(p.id);
              return (
                <div
                  key={p.id}
                  className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700 transition"
                >
                  <div
                    onClick={() => openProject(p.id)}
                    className="cursor-pointer"
                  >
                    <div className="w-full h-24 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg mb-4 flex items-center justify-center">
                      <span className="text-white text-lg font-semibold">
                        {p.name}
                      </span>
                    </div>

                    <p className="text-gray-300 text-sm text-center">
                      Creado: {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => startEditing(p)}
                      className="w-1/2 bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-lg"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="w-1/2 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg"
                    >
                      Eliminar
                    </button>
                  </div>

                  {/* Historial de procesamientos del proyecto */}
                  <button
                    onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                    className="mt-3 w-full text-gray-300 hover:text-white text-sm underline underline-offset-4"
                  >
                    {abierto === p.id ? 'Ocultar' : 'Ver'} vídeos procesados (
                    {propios.length})
                  </button>

                  {abierto === p.id && (
                    <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                      {propios.length === 0 ? (
                        <p className="text-gray-400 text-sm">
                          Sin procesamientos aún.
                        </p>
                      ) : (
                        propios.map(j => (
                          <div
                            key={j.id}
                            onClick={() => abrirJob(j.id)}
                            className="bg-gray-700 hover:bg-gray-600 rounded-md p-3 cursor-pointer transition-colors"
                            title="Abrir este vídeo procesado"
                          >
                            <p
                              className="text-white text-sm truncate"
                              title={j.source_filename}
                            >
                              {j.source_filename}
                            </p>
                            <p className="text-gray-400 text-xs mb-2">
                              {new Date(j.created_at).toLocaleString()} ·{' '}
                              {j.status === 'done'
                                ? j.video_type === 'karaoke'
                                  ? 'Karaoke'
                                  : 'Instrumental'
                                : j.status === 'error'
                                  ? 'Error'
                                  : `${j.progress}%`}
                            </p>
                            <div
                              className="flex flex-wrap gap-2"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={() => abrirJob(j.id)}
                                className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1 rounded"
                              >
                                Abrir
                              </button>
                              <button
                                onClick={() =>
                                  void descargarZip(
                                    j.id,
                                    `${j.source_filename}_completo.zip`,
                                  )
                                }
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded"
                              >
                                ZIP
                              </button>
                              <button
                                onClick={() => borrarJob(j.id)}
                                className="bg-red-700 hover:bg-red-800 text-white text-xs px-2 py-1 rounded"
                              >
                                Borrar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center pb-8">
        <h2 className="text-white text-2xl font-bold mb-2">
          Elige un proyecto para continuar
        </h2>
        <svg
          className="w-6 h-6 text-white mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {editingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-96 border border-gray-600">
            <h2 className="text-white text-xl mb-4">Editar Proyecto</h2>

            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-gray-700 text-white border border-gray-600"
            />

            <div className="flex justify-end mt-4 gap-3">
              <button
                onClick={() => setEditingProject(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>

              <button
                onClick={saveEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
