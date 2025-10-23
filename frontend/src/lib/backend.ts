import backendConfig from "@/config/backend.config";
import { getToken } from "@/lib/auth";

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  // Backend runs on port 3000, frontend on 3001
  return `http://localhost:3000`;
};

/**
 * Refresh the access token using the refresh token cookie
 */
async function refreshAccessToken(): Promise<string | null> {
  // If already refreshing, wait for the existing refresh to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const origin = getBackendOrigin();
      const response = await fetch(`${origin}/auth/refresh`, {
        method: "GET",
        credentials: "include", // Send refresh token cookie
      });

      if (response.ok) {
        const data = await response.json();
        const newToken = data.accessToken;

        // Save the new token
        localStorage.setItem("auth:token", newToken);
        console.log("[backendFetch] Token refreshed successfully");
        return newToken;
      } else {
        console.warn("[backendFetch] Token refresh failed:", response.status);
        // Clear tokens on refresh failure
        localStorage.removeItem("auth:token");
        return null;
      }
    } catch (error) {
      console.error("[backendFetch] Token refresh error:", error);
      localStorage.removeItem("auth:token");
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function backendFetch(path: string, opts: RequestInit = {}) {
  const origin = getBackendOrigin();
  const url = path.startsWith("http")
    ? path
    : `${origin}${path.startsWith("/") ? path : "/" + path}`;

  let token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);

  const makeRequest = async (authToken?: string) => {
    const requestHeaders = new Headers(opts.headers || {});
    if (authToken && !requestHeaders.has("Authorization")) {
      requestHeaders.set("Authorization", `Bearer ${authToken}`);
    }

    try {
      const res = await fetch(url, {
        ...opts,
        headers: requestHeaders,
        credentials: "include", // Include cookies for auth
      });
      return res;
    } catch (e) {
      // fallback: try a relative request in case dev server is proxying the backend
      try {
        const relUrl = path.startsWith("/") ? path : "/" + path;
        const res2 = await fetch(relUrl, {
          ...opts,
          headers: requestHeaders,
          credentials: "include",
        });
        return res2;
      } catch (e2) {
        // rethrow original error for upstream handling
        throw e;
      }
    }
  };

  try {
    const res = await makeRequest(token || undefined);

    // If we get a 401 Unauthorized, try to refresh the token
    if (res.status === 401 && !path.includes("/auth/")) {
      console.log("[backendFetch] Got 401, attempting token refresh...");

      const newToken = await refreshAccessToken();

      if (newToken) {
        // Retry the original request with the new token
        console.log("[backendFetch] Retrying request with new token");
        return makeRequest(newToken);
      } else {
        // Refresh failed, but don't redirect immediately
        // Let the component handle the 401
        console.warn(
          "[backendFetch] Token refresh failed, returning 401 response"
        );
      }
    }

    return res;
  } catch (e) {
    throw e;
  }
}

export async function backendJson(
  method: string,
  path: string,
  body?: object,
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
