import axios from 'axios';
import { auth } from '../firebase';

// Must match ADMIN_SECRET_TOKEN in backend/.env
const ADMIN_SECRET_TOKEN = 'gdpr-admin-secret-2025';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  timeout: 30000,
});

// Attach the right token to every request:
//   - Admin local session  → static secret token (no Firebase)
//   - Normal Firebase user → Firebase JWT
client.interceptors.request.use(async (config) => {
  // Check if admin session is active (set by AuthContext on local admin login)
  const isAdminSession = sessionStorage.getItem('gdpr_admin_session') === 'true';

  if (isAdminSession) {
    config.headers.Authorization = `Bearer ${ADMIN_SECRET_TOKEN}`;
    return config;
  }

  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken(false);
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      console.error('[API] Failed to get ID token:', err.message);
    }
  }
  return config;
}, (error) => Promise.reject(error));

// On 401: refresh Firebase token once. Admin token never expires so skip for admin.
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAdminSession = sessionStorage.getItem('gdpr_admin_session') === 'true';

    if (error.response?.status === 401 && !original._retried && !isAdminSession && auth.currentUser) {
      original._retried = true;
      try {
        const freshToken = await auth.currentUser.getIdToken(true);
        original.headers.Authorization = `Bearer ${freshToken}`;
        return client(original);
      } catch (refreshErr) {
        console.error('[API] Token refresh failed:', refreshErr.message);
      }
    }
    if (error.response?.status === 401 && !isAdminSession) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default client;
