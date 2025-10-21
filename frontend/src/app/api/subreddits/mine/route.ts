import { NextResponse } from "next/server";
import backendConfig from "@/config/backend.config";

const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url;
  const port = process.env.NEXT_PUBLIC_PORT || "3001";
  return `http://localhost:${port}`;
};

export async function GET(req: Request) {
  const origin = getBackendOrigin();
  const url = `${origin}/users/me/subreddits`;

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
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  });
}
