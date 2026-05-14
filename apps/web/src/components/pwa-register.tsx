"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production only. In development the service worker
 * fights Turbopack's hot-reload chunks (it caches /_next/static/... hashes
 * that change on every save), causing infinite spinners on refresh.
 *
 * On mount in dev mode, if a SW from a previous prod build is still
 * registered, we proactively unregister it and clear its caches so the
 * dev experience is clean.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isDev = process.env.NODE_ENV !== "production";
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isDev || isLocalhost) {
      // Make sure no stale prod SW is still active in dev.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
      if (typeof caches !== "undefined") {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith("harwick-")) void caches.delete(key);
          }
        });
      }
      return;
    }

    let unsubscribed = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (unsubscribed) return;

        registration.addEventListener("updatefound", () => {
          const next = registration.installing;
          if (next === null) return;
          next.addEventListener("statechange", () => {
            if (next.state === "activated" && navigator.serviceWorker.controller !== null) {
              console.info("Harwick: new service worker activated.");
            }
          });
        });
      } catch (error) {
        console.warn("Harwick: service worker registration failed", error);
      }
    };

    void register();

    return () => {
      unsubscribed = true;
    };
  }, []);

  return null;
}
