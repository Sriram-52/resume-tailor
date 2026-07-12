/// <reference types="vite/client" />

declare module '*?url' {
  const url: string
  export default url
}

declare module 'mammoth/mammoth.browser.js' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
}
