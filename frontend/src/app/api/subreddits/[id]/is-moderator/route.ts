import { NextResponse } from "next/server";
import backendConfig from "@/config/backend.config";

const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  const port = process.env.NEXT_PUBLIC_PORT || "3001";
  return `http://localhost:${port}`;
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const origin = getBackendOrigin();
  // params may be a Promise in the current Next.js runtime. Await it before using properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedParams: any = await (params as any);
  const id = resolvedParams?.id;
  const url = `${origin}/subreddits/${encodeURIComponent(id)}/is-moderator`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(req.headers.get("authorization")
        ? { Authorization: req.headers.get("authorization")! }
        : {}),
    },
    credentials: "include",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "text/plain",
    },
  });
}
