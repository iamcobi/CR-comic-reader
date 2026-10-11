// Server-side metadata complements the persistent browser diagnostic log.
// No authorization headers, request bodies, documents, or audio are logged.
export async function loggedRequest(
  name: string,
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  const id = crypto.randomUUID(),
    start = performance.now();
  console.info(
    "[Pip server]",
    JSON.stringify({
      at: new Date().toISOString(),
      id,
      event: "request.started",
      name,
    }),
  );
  try {
    const response = await handler(request);
    console.info(
      "[Pip server]",
      JSON.stringify({
        at: new Date().toISOString(),
        id,
        event: "request.headers",
        name,
        status: response.status,
        milliseconds: Math.round(performance.now() - start),
      }),
    );
    response.headers.set("X-Pip-Request-Id", id);
    return response;
  } catch (error) {
    console.error(
      "[Pip server]",
      JSON.stringify({
        at: new Date().toISOString(),
        id,
        event: "request.failed",
        name,
        canceled: request.signal.aborted,
      }),
    );
    throw error;
  }
}
