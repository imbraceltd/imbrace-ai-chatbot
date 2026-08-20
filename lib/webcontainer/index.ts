/**
 * WebContainer singleton manager.
 * Adapted from bolt.diy's webcontainer/index.ts.
 * Lazy-boots a single WebContainer instance shared across all vibe-code artifacts.
 */

import { WebContainer } from "@webcontainer/api";

const WORK_DIR_NAME = "project";

export interface PreviewInfo {
  port: number;
  url: string;
}

type ServerReadyCallback = (info: PreviewInfo) => void;

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
const serverReadyListeners = new Set<ServerReadyCallback>();

/**
 * Get or boot the WebContainer singleton.
 * First call triggers boot (~3-5s), subsequent calls return cached instance.
 */
export function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return Promise.resolve(webcontainerInstance);
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = WebContainer.boot({
    coep: "credentialless",
    workdirName: WORK_DIR_NAME,
  }).then((instance) => {
    webcontainerInstance = instance;

    // Listen for dev server ready events
    instance.on("server-ready", (port: number, url: string) => {
      console.log("[WebContainer] Server ready on port:", port, url);
      for (const listener of serverReadyListeners) {
        listener({ port, url });
      }
    });

    return instance;
  });

  return bootPromise;
}

/**
 * Register a callback for when a dev server becomes ready inside WebContainer.
 * Returns an unsubscribe function.
 */
export function onServerReady(callback: ServerReadyCallback): () => void {
  serverReadyListeners.add(callback);
  return () => serverReadyListeners.delete(callback);
}

/**
 * Check if WebContainer has been booted.
 */
export function isWebContainerReady(): boolean {
  return webcontainerInstance !== null;
}

export { WORK_DIR_NAME };
