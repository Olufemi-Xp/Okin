declare module "next" {
  export interface Metadata {
    title?: string | { default: string; template: string };
    description?: string;
    icons?: any;
    [key: string]: any;
  }
  export interface Viewport {
    width?: string;
    initialScale?: number;
    maximumScale?: number;
    themeColor?: string;
    [key: string]: any;
  }
}

declare module "next/navigation" {
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    back(): void;
    forward(): void;
    refresh(): void;
    prefetch(href: string): void;
  };
  export function useSearchParams(): URLSearchParams;
  export function usePathname(): string;
  export function useParams(): Record<string, string | string[]>;
}

declare module "next/types.js" {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
  const content: any;
  export default content;
}

declare module "next/types" {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
  const content: any;
  export default content;
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}

declare module "next/dist/*" {
  const content: any;
  export default content;
}
