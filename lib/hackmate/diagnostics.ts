// Local, bounded diagnostics. Never store prompts, document contents, audio, or keys.
export type Diagnostic = {
  at: string;
  event: string;
  details: Record<string, string | number | boolean>;
};
let pending: Promise<void> = Promise.resolve();
// Capture locations, never error messages (which can contain documents or keys).
export function installRuntimeLogging(onFailure: () => void) {
  const report = (event: string, reason: unknown) => {
    const error = reason instanceof Error ? reason : undefined;
    const frame = error?.stack?.split("\n").slice(1).find(line => /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(line));
    const location = frame?.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/([^\s)?]+)(?:\?[^\s)]*)?/)?.[1] || "unknown";
    logEvent(event, { name: error?.name || typeof reason, location: location.slice(0, 250) });
    onFailure();
  };
  const rejection = (event: PromiseRejectionEvent) => report("runtime.unhandled_rejection", event.reason);
  const error = (event: ErrorEvent) => report("runtime.error", event.error);
  window.addEventListener("unhandledrejection", rejection);
  window.addEventListener("error", error);
  return () => {
    window.removeEventListener("unhandledrejection", rejection);
    window.removeEventListener("error", error);
  };
}
export function logEvent(event: string, details: Diagnostic["details"] = {}) {
  const entry = { at: new Date().toISOString(), event, details };
  console.info("[Pip]", JSON.stringify(entry));
  if (typeof window === "undefined") return;
  pending = pending
    .catch(() => {})
    .then(async () => {
      const db = await openLogs();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        const store = tx.objectStore("events");
        store.add(entry);
        const keys = store.getAllKeys();
        keys.onsuccess = () =>
          keys.result
            .slice(0, Math.max(0, keys.result.length - 500))
            .forEach((key) => store.delete(key));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    });
  void pending.catch(() =>
    console.warn("[Pip] Diagnostic storage unavailable"),
  );
}
function openLogs(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pip-diagnostics", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("events", { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readLogs(): Promise<Diagnostic[]> {
  await pending.catch(() => {});
  const db = await openLogs();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("events", "readonly");
    const request = tx.objectStore("events").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function exportLogs() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(await readLogs(), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "pip-diagnostics.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function installRequestLogging() {
  const marker = Symbol.for("pip.requestLogging");
  const original = window.fetch;
  if ((original as typeof fetch & { [key: symbol]: boolean })[marker]) return () => {};
  const wrapped: typeof fetch = async (input, options) => {
    const path = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.href,
    ).pathname;
    if (!path.startsWith("/api/")) return original.call(window, input, options);
    const id = crypto.randomUUID(),
      started = performance.now();
    logEvent("request.started", { id, path, method: options?.method || (input instanceof Request ? input.method : "GET") });
    try {
      const response = await original.call(window, input, options);
      logEvent("request.headers", {
        id,
        path,
        status: response.status,
        serverId: response.headers.get("X-Pip-Request-Id") || "",
        milliseconds: Math.round(performance.now() - started),
      });
      return response;
    } catch (error) {
      logEvent("request.failed", {
        id,
        path,
        canceled: error instanceof Error && error.name === "AbortError",
        milliseconds: Math.round(performance.now() - started),
      });
      throw error;
    }
  };
  Object.defineProperty(wrapped, marker, { value: true });
  window.fetch = wrapped;
  return () => {
    if (window.fetch === wrapped) window.fetch = original;
  };
}
