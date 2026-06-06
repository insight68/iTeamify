/// <reference types="vite/client" />

declare module "@fontsource-variable/*" {
  const _: void;
  export default _;
}

declare module "*.css" {
  const _: void;
  export default _;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
