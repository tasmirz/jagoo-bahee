import { NextRequest } from "next/server";
import backendConfig from "@/config/backend.config";
import http from "http";
import https from "https";

const defaultBackendOrigin = (backendConfig.url || "http://localhost:6000").replace("://localhost", "://127.0.0.1");
export const runtime = "nodejs";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const requestedHomeserver = request.headers.get("x-jb-homeserver");
  const backendOrigin = resolveHomeserver(requestedHomeserver);
  const upstreamUrl = new URL(`/${path.join("/")}`, backendOrigin);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
    headers.set(key, value);
  }

  try {
    const upstream = await requestWithNode(upstreamUrl, request.method, headers, ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.from(await request.arrayBuffer()));

    return new Response(new Uint8Array(upstream.body), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (error) {
    return Response.json(
      {
        message: "Backend is unreachable",
        upstream: upstreamUrl.origin,
        detail: error instanceof Error ? error.message : "Unknown network error",
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

function requestWithNode(url: URL, method: string, headers: Headers, body?: Buffer) {
  return new Promise<{ status: number; statusText: string; headers: Headers; body: Buffer }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const outgoingHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      outgoingHeaders[key] = value;
    });

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: outgoingHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
            else if (value !== undefined) responseHeaders.set(key, String(value));
          }
          resolve({
            status: res.statusCode || 502,
            statusText: res.statusMessage || "",
            headers: responseHeaders,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function resolveHomeserver(value: string | null) {
  if (!value) return defaultBackendOrigin;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return defaultBackendOrigin;
    return parsed.origin.replace("://localhost", "://127.0.0.1");
  } catch {
    return defaultBackendOrigin;
  }
}
