export type PreviewRuntimeConfig = {
  root?: string;
  entries: string[];
  setup?: string;
  aliases?: Record<string, string>;
  styles?: string[];
  publicDir?: string;
  devServer?: {
    host?: string;
    port?: number;
  };
  watch?: {
    usePolling?: boolean;
    interval?: number;
  };
};

export function definePreviewConfig(config: PreviewRuntimeConfig): PreviewRuntimeConfig {
  return config;
}
