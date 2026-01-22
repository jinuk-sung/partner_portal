export {};

declare global {
  interface Window {
    WebChat: {
      createDirectLine: (options: { token: string; domain?: string }) => unknown;
      createStyleSet: (options: Record<string, unknown>) => Record<string, unknown>;
      renderWebChat: (
        options: Record<string, unknown>,
        element: HTMLElement
      ) => void;
    };
  }
}
