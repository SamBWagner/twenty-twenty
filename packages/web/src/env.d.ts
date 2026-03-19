/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_WEB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type RequestAuthResult = import("./lib/auth").RequestAuthResult;

declare namespace App {
  interface Locals {
    auth: RequestAuthResult;
  }
}
