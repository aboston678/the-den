/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

/** Build id for cache-busting public files (vite.config.ts, src/asset.ts). */
declare const __ASSET_VERSION__: string;
