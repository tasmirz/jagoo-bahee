import { NextResponse } from "next/server";
import backendConfig from "@/config/backend.config";

const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  const port = process.env.NEXT_PUBLIC_PORT || "3001";
  return `http://localhost:${port}`;
};

export async function POST(req: Request) {
  const origin = getBackendOrigin();
  const url = `${origin}/attachments/presigned-upload`;
  // Read body as text first to avoid streaming/duplex issues when forwarding
  const bodyText = await req.text();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      // forward auth header if present
      ...(req.headers.get("authorization")
        ? { Authorization: req.headers.get("authorization")! }
        : {}),
    },
    body: bodyText,
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
