import { logEvent } from "./diagnostics";

// Cleanup must not turn a successful read or a handled cancellation into a failure.
export async function cleanupResource(action: () => unknown, resource: string) {
  try {
    await action();
  } catch {
    logEvent("resource.cleanup_failed", { resource });
  }
}
