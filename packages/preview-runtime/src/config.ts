export type PreviewRuntimeConfig = {
  entries: string[];
  devServer?: {
    host?: string;
    port?: number;
  };
};

export function definePreviewConfig(config: PreviewRuntimeConfig): PreviewRuntimeConfig {
  return config;
}
