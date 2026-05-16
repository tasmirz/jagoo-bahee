import backendConfig from "@/config/backend.config";
import { clearCredentials, getToken, saveToken } from "@/lib/auth";

export const normalizeLoopback = (url: string) => url.replace("://localhost", "://127.0.0.1").replace(/\/$/, "");
const DEFAULT_BACKEND_URL = (backendConfig.url || "http://localhost:6000").replace(/\/$/, "");
const DEFAULT_BACKEND_ORIGIN = normalizeLoopback(DEFAULT_BACKEND_URL);

export const getBackendOrigin = () => {
  if (typeof window !== "undefined") {
    const selected = window.localStorage.getItem("jb-homeserver");
    if (selected) return normalizeLoopback(selected);
  }
  return DEFAULT_BACKEND_ORIGIN;
};

const retryableMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const retryableStatuses = new Set([502, 503, 504]);

export async function backendFetch(path: string, opts: RequestInit = {}, retryAuth = true): Promise<Response> {
  const origin = getBackendOrigin();
  const url = path.startsWith("http")
    ? path
    : `${origin}${path.startsWith("/") ? path : "/" + path}`;

  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);

  if (typeof window !== "undefined" && !path.startsWith("http")) {
    const proxyUrl = `/backend-proxy${path.startsWith("/") ? path : "/" + path}`;
    const selectedOrigin = getBackendOrigin();
    headers.set("x-jb-homeserver", selectedOrigin);
    const response = await fetchWithRetry(proxyUrl, { ...opts, headers });
    repairLoopbackHomeserver(response);
    if (response.status !== 502 || selectedOrigin === DEFAULT_BACKEND_ORIGIN) {
      return retryAuthResponse(response, path, opts, retryAuth);
    }

    if (isLoopbackOrigin(selectedOrigin)) {
      window.localStorage.setItem("jb-homeserver", DEFAULT_BACKEND_URL);
    }
    const fallbackHeaders = new Headers(headers);
    fallbackHeaders.set("x-jb-homeserver", DEFAULT_BACKEND_ORIGIN);
    const fallbackResponse = await fetchWithRetry(proxyUrl, { ...opts, headers: fallbackHeaders });
    return retryAuthResponse(fallbackResponse, path, opts, retryAuth);
  }

  try {
    const response = await fetchWithRetry(url, { ...opts, headers });
    return retryAuthResponse(response, path, opts, retryAuth);
  } catch (error) {
    if (typeof window === "undefined" || path.startsWith("http")) throw error;
    const proxyUrl = `/backend-proxy${path.startsWith("/") ? path : "/" + path}`;
    headers.set("x-jb-homeserver", DEFAULT_BACKEND_ORIGIN);
    const response = await fetchWithRetry(proxyUrl, { ...opts, headers });
    return retryAuthResponse(response, path, opts, retryAuth);
  }
}

async function retryAuthResponse(response: Response, path: string, opts: RequestInit, retryAuth: boolean): Promise<Response> {
  if (!retryAuth || response.status !== 401 || path === "/auth/refresh" || path === "/auth/logout") {
    return response;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) return response;
  return backendFetch(path, opts, false);
}

async function fetchWithRetry(url: string, opts: RequestInit) {
  const method = (opts.method || "GET").toUpperCase();
  const attempts = retryableMethods.has(method) ? 3 : 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, opts);
    if (!retryableStatuses.has(response.status) || attempt === attempts) {
      return response;
    }
    await delay(100 * attempt);
  }

  throw new Error("unreachable retry state");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoopbackOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function repairLoopbackHomeserver(response: Response) {
  const fallbackOrigin = response.headers.get("x-jb-homeserver-fallback");
  if (!fallbackOrigin || !isLoopbackOrigin(fallbackOrigin)) return;
  window.localStorage.setItem("jb-homeserver", DEFAULT_BACKEND_URL);
}

export async function backendJson(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  opts: RequestInit = {},
) {
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  let res = await backendFetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/logout") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await backendFetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  return res;
}

async function refreshAccessToken() {
  try {
    const response = await backendFetch(
      "/auth/refresh",
      {
        method: "GET",
        credentials: "include",
      },
      false,
    );
    if (!response.ok) {
      if (response.status === 401) clearCredentials();
      return false;
    }
    const data = await response.json();
    if (!data?.accessToken) return false;
    saveToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

const backend = {
  getBackendOrigin,
  backendFetch,
  backendJson,
};

export default backend;
