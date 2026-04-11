import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const { message, session_id, user_id } = await req.json();

  const response = await fetch(`${BACKEND_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      user_id: user_id || "test_user",
      session_id,
    }),
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: "Backend request failed" }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
