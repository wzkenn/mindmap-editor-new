const DEPLOY_BASE = import.meta.env.BASE_URL

/**
 * Resolve bundled public assets against Vite's deployment base path.
 * Also upgrades the old `/assets/...` values stored in browser saves.
 */
export const assetUrl = (source: string) => {
  const assetMatch = source.match(/^\/?(?:mindmap-editor-new\/)?assets\/(.+)$/)
  return assetMatch ? `${DEPLOY_BASE}assets/${assetMatch[1]}` : source
}
