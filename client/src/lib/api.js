const BASE = '/api';

export async function apiFetch(path, options = {}) {
  const method = options.method || 'GET';
  const token = localStorage.getItem('access_token');

  if (!token) {
    // CLIENT_001: No access token in localStorage — user is not logged in or storage was cleared
    console.warn(`[API][CLIENT_001] ${method} ${path} — no access_token in localStorage`);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  console.log(`[API] -> ${method} ${path}`);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch (networkErr) {
    // CLIENT_NET_001: fetch() itself threw — server unreachable, DNS failure, CORS preflight crash
    console.error(`[API][CLIENT_NET_001] Network error on ${method} ${path} | ${networkErr.message}`);
    throw networkErr;
  }

  console.log(`[API] <- ${method} ${path} ${res.status} ${res.statusText}`);

  if (res.status === 401) {
    console.warn(`[API][CLIENT_401] 401 on ${method} ${path} — attempting token refresh`);
    const refreshToken = localStorage.getItem('refresh_token');

    if (!refreshToken) {
      // CLIENT_401a: No refresh token to attempt rotation — force logout
      console.warn(`[API][CLIENT_401a] No refresh_token in localStorage — clearing session and redirecting to /login`);
      localStorage.clear();
      window.location.href = '/login';
      return res;
    }

    console.log(`[API] Calling POST /api/auth/refresh`);
    let refreshRes;
    try {
      refreshRes = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (networkErr) {
      // CLIENT_NET_002: Network error during the refresh call itself
      console.error(`[API][CLIENT_NET_002] Network error calling /auth/refresh | ${networkErr.message}`);
      localStorage.clear();
      window.location.href = '/login';
      return res;
    }

    if (refreshRes.ok) {
      const { access_token } = await refreshRes.json();
      console.log(`[API] Token refreshed OK — retrying ${method} ${path}`);
      localStorage.setItem('access_token', access_token);
      headers.Authorization = `Bearer ${access_token}`;
      try {
        res = await fetch(`${BASE}${path}`, { ...options, headers });
      } catch (retryErr) {
        // CLIENT_NET_003: Network error on the retry after token refresh
        console.error(`[API][CLIENT_NET_003] Network error on retry of ${method} ${path} | ${retryErr.message}`);
        throw retryErr;
      }
      console.log(`[API] <- ${method} ${path} ${res.status} (after refresh)`);
    } else {
      // CLIENT_401b: Refresh request returned non-OK — token is revoked or expired
      console.warn(`[API][CLIENT_401b] /auth/refresh returned ${refreshRes.status} — clearing session and redirecting to /login`);
      localStorage.clear();
      window.location.href = '/login';
      return res;
    }
  }

  if (res.status >= 500) {
    // CLIENT_5XX: Server returned a 5xx error — log it so it's visible in browser devtools
    console.error(`[API][CLIENT_5XX] Server error ${res.status} on ${method} ${path}`);
  } else if (res.status >= 400 && res.status !== 401) {
    // CLIENT_4XX: Client error other than auth — bad request, not found, conflict, etc.
    console.warn(`[API][CLIENT_4XX] Client error ${res.status} on ${method} ${path}`);
  }

  return res;
}

export const api = {
  get:    (path)        => apiFetch(path),
  post:   (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)  => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (path, body)  => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)        => apiFetch(path, { method: 'DELETE' }),
};
