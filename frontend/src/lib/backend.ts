import backendConfig from "@/config/backend.config";
import { getToken } from "@/lib/auth";

export const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  // Backend runs on port 3000, frontend on 3001
  return `http://localhost:3000`;
};

export async function backendFetch(path: string, opts: RequestInit = {}) {
  const origin = getBackendOrigin();
  const url = path.startsWith("http")
    ? path
    : `${origin}${path.startsWith("/") ? path : "/" + path}`;

  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);

  try {
    const res = await fetch(url, { ...opts, headers });
    return res;
  } catch (e) {
    // fallback: try a relative request in case dev server is proxying the backend
    try {
      const relUrl = path.startsWith("/") ? path : "/" + path;
      const res2 = await fetch(relUrl, { ...opts, headers });
      return res2;
    } catch (e2) {
      // rethrow original error for upstream handling
      throw e;
    }
  }
}

export async function backendJson(
  method: string,
  path: string,
  body?: any,
  opts: RequestInit = {}
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
