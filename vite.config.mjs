import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const nextApiTarget = env.IMBRACE_NEXT_BEST_ACTION_URL || "http://localhost:3000";
  const appGatewayTarget = env.IMBRACE_APP_GATEWAY_URL || "http://localhost:9001";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "."),
      },
    },
    server: {
      port: 6790,
      host: true,
      proxy: {
        // Dev: route `/ai-agent/*` to LOCAL messagesuggestion at port 3000
        // (rewrite prefix to `/api` to match its routes). Production CloudFront/
        // ingress sends `/ai-agent/*` to app-gateway which does the same rewrite.
        // Pointing at local lets us iterate on chatClientAuth + handlers without
        // round-tripping through dev deployment.
        "/ai-agent": {
          target: nextApiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (urlPath) => urlPath.replace(/^\/ai-agent/, "/api"),
          configure: (proxy) => {
            proxy.on("proxyReq", (req, _r, _s) =>
              console.log("[proxy:ai-agent] →", req.method, req.path, "host:", req.getHeader("host"), "x-org:", req.getHeader("x-organization-id") ?? "(none)", "auth:", req.getHeader("authorization") ? "Bearer…" : "(none)"),
            );
            proxy.on("proxyRes", (res, req) =>
              console.log("[proxy:ai-agent] ←", res.statusCode, req.method, req.url),
            );
            proxy.on("error", (err, req) =>
              console.log("[proxy:ai-agent] ERR", req.method, req.url, err.message),
            );
          },
        },
        "/api": {
          target: nextApiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/appgateway": {
          target: appGatewayTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (urlPath) => urlPath.replace(/^\/appgateway/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (req, _r, _s) =>
              console.log("[proxy:appgateway] →", req.method, req.path, "x-org:", req.getHeader("x-organization-id") ?? "(none)", "auth:", req.getHeader("authorization") ? "Bearer…" : "(none)"),
            );
            proxy.on("proxyRes", (res, req) =>
              console.log("[proxy:appgateway] ←", res.statusCode, req.method, req.url),
            );
            proxy.on("error", (err, req) =>
              console.log("[proxy:appgateway] ERR", req.method, req.url, err.message),
            );
          },
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: mode === "development",
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            ui: ["lucide-react"],
          },
        },
      },
    },
    envPrefix: "VITE_",
    preview: {
      port: 6790,
      host: true,
    },
  };
});


