import { NextResponse } from "next/server";
import backendConfig from "@/config/backend.config";

const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  const port = process.env.NEXT_PUBLIC_PORT || "3001";
  return `http://localhost:${port}`;
};

export async function POST(req: Request) {
  // proxy POST body and headers to backend origin
  const origin = getBackendOrigin();
  const url = `${origin}/subreddits`;
  // read body as text to avoid streaming/duplex issues
  const bodyText = await req.text();

  // forward the incoming request to backend, including Authorization header if present
  const res = await fetch(url, {
    method: "POST",
    headers: {
      // copy content-type if present
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(req.headers.get("authorization")
        ? { Authorization: req.headers.get("authorization")! }
        : {}),
    },
    body: bodyText,
    // include credentials so cookies can be forwarded by the server if configured
    credentials: "include",
  });

  const respText = await res.text();
  return new NextResponse(respText, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "text/plain",
    },
  });
}
