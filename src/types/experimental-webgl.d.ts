export {};

declare global {
  interface HTMLCanvasElement {
    getContext(
      contextId: "experimental-webgl",
      options?: WebGLContextAttributes,
    ): WebGLRenderingContext | null;
  }
}
