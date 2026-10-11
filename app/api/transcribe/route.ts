import { loggedRequest } from "@/lib/hackmate/request-log";
// Audio stays in memory: browser recording → ElevenLabs Scribe → plain transcript.
async function handlePOST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "This request must come from the app." },
      { status: 403 },
    );
  if (!process.env.ELEVENLABS_API_KEY)
    return Response.json(
      { error: "ElevenLabs transcription needs the server API key." },
      { status: 400 },
    );
  if (Number(request.headers.get("content-length")) > 6_000_000)
    return Response.json(
      { error: "Please keep recordings under 30 seconds." },
      { status: 413 },
    );
  try {
    const input = await request.formData();
    const file = input.get("file");
    if (
      !(file instanceof File) ||
      file.size < 100 ||
      file.size > 5_000_000 ||
      !/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;|$)/.test(file.type)
    )
      return Response.json(
        { error: "Record a short audio message before sending." },
        { status: 400 },
      );
    const body = new FormData();
    body.set("file", file);
    body.set("model_id", "scribe_v2");
    body.set("tag_audio_events", "false");
    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
        body,
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!response.ok)
      return Response.json(
        {
          error: `Transcription failed (${response.status}). Check ElevenLabs speech-to-text permissions and credits.`,
        },
        { status: 502 },
      );
    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim().slice(0, 4000);
    if (!text)
      return Response.json(
        {
          error: "I didn’t hear words. Try speaking closer to the microphone.",
        },
        { status: 422 },
      );
    return Response.json(
      { text },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Transcription could not connect. Please try again." },
      { status: 502 },
    );
  }
}

export const POST = (request: Request) =>
  loggedRequest("transcribe", request, handlePOST);
