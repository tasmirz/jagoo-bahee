import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization") || "";
  const body = await req.json();
  const res = await fetch(
    `${process.env.BACKEND_URL || "http://localhost:3000"}/votes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
