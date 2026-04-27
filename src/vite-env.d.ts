/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YF_PROXY_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
