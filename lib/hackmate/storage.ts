import type { Workspace } from "./types";
import { logEvent } from "./diagnostics";
// IndexedDB keeps uploaded PDFs out of localStorage's small quota.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("hackmate-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadWorkspace(): Promise<Workspace | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readonly");
    const request = tx.objectStore("state").get("workspace");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
async function writeWorkspace(workspace: Workspace): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(workspace, "workspace");
    tx.oncomplete = () => {
      db.close();
      resolve();
      logEvent("workspace.saved", {
        members: workspace.members.length,
        tasks: workspace.tasks.length,
        documents: workspace.documents.length,
        stage: workspace.intake?.stage || "legacy",
      });
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
      logEvent("workspace.save_failed");
    };
  });
}

let writes: Promise<void> = Promise.resolve();
export function saveWorkspace(workspace: Workspace): Promise<void> {
  // A cloning/storage error must use the same rejection path as async writes.
  try {
    const snapshot = structuredClone(workspace);
    const write = writes.then(() => writeWorkspace(snapshot));
    // Keep the internal queue settled while returning errors to the caller.
    writes = write.catch(() => {});
    return write;
  } catch (error) {
    return Promise.reject(error);
  }
}
