import { getLocalSqlite } from "./local-sqlite";

export function registerOfflineApp(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void getLocalSqlite().catch(() => undefined);
  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.register("/service-worker.js");
    },
    { once: true },
  );
}
