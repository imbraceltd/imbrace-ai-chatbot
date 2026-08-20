/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEXT_API_TARGET: string;
  readonly VITE_APPGATEWAY_TARGET: string;
  readonly VITE_APP_API_HOST: string;
  readonly VITE_IMBRACE_BASE_URL: string;
  readonly VITE_IMBRACE_APP_GATEWAY_URL: string;
  readonly VITE_IMBRACE_NEXT_BEST_ACTION_URL: string;
  readonly VITE_IMBRACE_WORKFLOW_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
