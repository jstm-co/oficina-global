// `react-dom` se usa solo para `createPortal` y `flushSync` (los provee el host;
// `flushSync` puede faltar si un host no lo trae) y para montar la página suelta
// del modo TV (`react-dom/client`, va en su bundle).
// Esta declaración evita sumar `@types/react-dom`.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
  export const flushSync: (<R>(fn: () => R) => R) | undefined;
}
declare module "react-dom/client" {
  import type { ReactNode } from "react";
  export function createRoot(container: Element | DocumentFragment): { render(children: ReactNode): void; unmount(): void };
}
