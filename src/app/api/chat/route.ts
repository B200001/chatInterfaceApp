import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { message?: string; session_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { message, session_id, user_id } = body;
  if (!message) {
    return new Response("Missing 'message' field", { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/plain",
      },
      body: JSON.stringify({
        message,
        user_id: user_id || "11",
        session_id,
      }),
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Backend unreachable at ${BACKEND_URL}: ${msg}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!backendRes.ok || !backendRes.body) {
    const errText = await backendRes.text().catch(() => "");
    return new Response(
      `Backend request failed (${backendRes.status}): ${errText}`,
      {
        status: backendRes.status || 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }
    );
  }

  return new Response(backendRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
