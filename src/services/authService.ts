import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const authAPI = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

authAPI.interceptors.request.use(
  config => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

authAPI.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/refresh`, {
            refresh_token: refreshToken,
          });
          const {access_token, refresh_token: newRefreshToken} = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefreshToken);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return authAPI(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

/** Lee el `exp` del JWT sin dependencias externas. */
const expiracionDe = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json) as {exp?: number};
    return typeof data.exp === 'number' ? data.exp : null;
  } catch {
    return null;
  }
};

// Evita lanzar varias renovaciones simultaneas.
let renovacionEnCurso: Promise<string | null> | null = null;

/**
 * Devuelve un access token que seguira siendo valido un rato.
 *
 * Necesario porque el token viaja dentro de las URLs de audio y video (los
 * elementos <audio>/<video> no pueden enviar cabeceras), y un procesamiento
 * puede durar mas que la vida del token.
 */
export const ensureFreshToken = async (
  margenSegundos = 300,
): Promise<string | null> => {
  const token = localStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token');

  if (token) {
    const exp = expiracionDe(token);
    if (exp === null || exp * 1000 - Date.now() > margenSegundos * 1000) {
      return token;
    }
  }

  if (!refresh) return token;

  if (!renovacionEnCurso) {
    renovacionEnCurso = axios
      .post(`${API_BASE_URL}/refresh`, {refresh_token: refresh})
      .then(res => {
        const {access_token, refresh_token} = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return access_token as string;
      })
      .catch(() => null)
      .finally(() => {
        renovacionEnCurso = null;
      });
  }

  return renovacionEnCurso;
};

export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
  plan: 'gratuito' | 'premium';
  /** Canciones que le quedan en el mes; null si su plan no tiene límite. */
  canciones_restantes: number | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  /** Acepta los términos y condiciones y la política de privacidad. */
  acepta_terminos: boolean;
}

/** Error de una peticion HTTP (axios), con los campos que se consultan. */
export interface ErrorHttp {
  code?: string;
  message?: string;
  response?: {status?: number; data?: {detail?: string}};
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const authService = {
  async register(userData: RegisterRequest): Promise<User> {
    const response = await authAPI.post('/register', userData);
    return response.data;
  },

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await authAPI.post('/login', credentials);
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const response = await axios.post(`${API_BASE_URL}/refresh`, {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await authAPI.get('/me');
    return response.data;
  },

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  },

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  },

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};

export const apiClient = authAPI;
