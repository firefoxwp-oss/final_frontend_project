import {Routes, Route} from 'react-router-dom';
import {UploadPage} from './pages';
import {LoginPage} from './pages/LoginPage';
import {ProtectedRoute} from './components/ProtectedRoute';
import ProjectsPage from './pages/ProjectsPage';
import ResultPage from './pages/ResultPage';
import MisProcesamientos from './pages/MisProcesamientos';
import ModoKaraoke from './pages/ModoKaraoke';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <UploadPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/resultado/:jobId"
        element={
          <ProtectedRoute>
            <ResultPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/procesamientos"
        element={
          <ProtectedRoute>
            <MisProcesamientos />
          </ProtectedRoute>
        }
      />

      <Route
        path="/karaoke/:jobId"
        element={
          <ProtectedRoute>
            <ModoKaraoke />
          </ProtectedRoute>
        }
      />

      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

export default App;
