import { loggedRequest } from "@/lib/hackmate/request-log";
async function handlePOST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "This request must come from the app." },
      { status: 403 },
    );
  const key = process.env.ELEVENLABS_API_KEY,
    voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice)
    return Response.json(
      {
        error:
          "ElevenLabs is not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID on the server.",
      },
      { status: 400 },
    );
  try {
    const { text, expression } = (await request.json()) as {
      text?: unknown;
      expression?: unknown;
    };
    if (typeof text !== "string" || !text.trim() || text.length > 1500)
      return Response.json(
        { error: "Voice accepts 1–1,500 characters." },
        { status: 400 },
      );
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${expression === "celebrating" || expression === "encouraging" ? "[excited]" : expression === "asking" || expression === "suggesting" ? "[curious]" : "[warmly]"} ${text.replace(/\[[^\]]*\]/g, "")}`,
          model_id: process.env.ELEVENLABS_MODEL || "eleven_v4_turbo",
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      return Response.json(
        {
          error: `Voice provider error (${response.status}). Check your key, voice ID, and quota.`,
        },
        { status: 502 },
      );
    return new Response(response.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Voice could not connect. Your text response is still available.",
      },
      { status: 502 },
    );
  }
}

export const POST = (request: Request) =>
  loggedRequest("voice", request, handlePOST);
