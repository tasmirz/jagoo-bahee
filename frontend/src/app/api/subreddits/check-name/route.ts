import { NextResponse } from "next/server";
import backendConfig from "@/config/backend.config";

const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  const port = process.env.NEXT_PUBLIC_PORT || "3001";
  return `http://localhost:${port}`;
};

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const name = urlObj.searchParams.get('name') || '';
  if (!name) return new NextResponse(JSON.stringify({ available: false }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const origin = getBackendOrigin();
  // backend supports GET /subreddits/:id where :id may be a name
  const url = `${origin}/subreddits/${encodeURIComponent(name)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {})
    },
    credentials: 'include'
  });

  if (res.status === 200) {
    // subreddit exists
    return NextResponse.json({ available: false }, { status: 200 });
  }
  if (res.status === 404) {
    return NextResponse.json({ available: true }, { status: 200 });
  }
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' } });
}
