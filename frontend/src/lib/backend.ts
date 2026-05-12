import backendConfig from "@/config/backend.config";
import { getToken } from "@/lib/auth";

export const getBackendOrigin = () => {
  if (typeof window !== "undefined") {
    const selected = window.localStorage.getItem("jb-homeserver");
    if (selected) return normalizeLoopback(selected);
  }
  if (backendConfig.url) return normalizeLoopback(backendConfig.url);
  // Backend runs on port 6000, frontend on 6001
  return `http://localhost:6000`;
};

export const normalizeLoopback = (url: string) => url.replace("://localhost", "://127.0.0.1");

export async function backendFetch(path: string, opts: RequestInit = {}) {
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
    headers.set("x-jb-homeserver", getBackendOrigin());
    return fetch(proxyUrl, { ...opts, headers });
  }

  try {
    return await fetch(url, { ...opts, headers });
  } catch (error) {
    if (typeof window === "undefined" || path.startsWith("http")) throw error;
    const proxyUrl = `/backend-proxy${path.startsWith("/") ? path : "/" + path}`;
    headers.set("x-jb-homeserver", getBackendOrigin());
    return fetch(proxyUrl, { ...opts, headers });
  }
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
  const res = await backendFetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export default {
  getBackendOrigin,
  backendFetch,
  backendJson,
};
