import { loggedRequest } from "@/lib/hackmate/request-log";
import {
  inputSchema,
  providerStatus,
  PublicError,
  runAI,
  streamChat,
} from "@/lib/hackmate/ai";

export async function GET() {
  return Response.json(providerStatus());
}
async function handlePOST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "This request must come from the app." },
      { status: 403 },
    );
  try {
    const text = await request.text();
    if (text.length > 16000000)
      throw new PublicError(
        "Your documents are too large. Keep total attachments below 8 MB.",
        413,
      );
    const raw = JSON.parse(text);
    const result = inputSchema.safeParse(raw);
    if (!result.success)
      throw new PublicError(
        "Some fields are empty, too long, or invalid. Check your team and documents.",
      );
    if (raw.stream && result.data.action === "chat") {
      const encoder = new TextEncoder();
      const cancel = new AbortController();
      const body = new ReadableStream({
        async start(controller) {
          const emit = (event: unknown) => {
            if (!cancel.signal.aborted)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          try {
            await streamChat(
              result.data,
              emit,
              AbortSignal.any([request.signal, cancel.signal]),
            );
          } catch (error) {
            emit({
              error:
                error instanceof PublicError
                  ? error.message
                  : "The reply was interrupted. Please retry; your saved work is unchanged.",
            });
          } finally {
            if (!cancel.signal.aborted) controller.close();
          }
        },
        cancel() {
          cancel.abort();
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return Response.json(await runAI(result.data));
  } catch (error) {
    if (error instanceof PublicError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          "The request could not be processed. Please check your input and try again.",
      },
      { status: 400 },
    );
  }
}

export const POST = (request: Request) =>
  loggedRequest("ai", request, handlePOST);
