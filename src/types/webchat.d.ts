export {};

declare global {
  type WebChatActivity = {
    from?: { role?: string };
    type?: string;
    [key: string]: unknown;
  };

  type WebChatAction = {
    type?: string;
    payload?: { activity?: WebChatActivity };
    meta?: { delayed?: boolean; injected?: boolean; [key: string]: unknown };
    [key: string]: unknown;
  };

  type WebChatDispatch = (action: WebChatAction) => unknown;

  type WebChatStoreMiddleware = (store: {
    dispatch: WebChatDispatch;
  }) => (next: WebChatDispatch) => (action: WebChatAction) => unknown;

  interface WebChatStyleSet {
    textContent?: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface Window {
    WebChat: {
      createDirectLine: (options: { token: string; domain?: string }) => unknown;
      createStyleSet: (options: Record<string, unknown>) => WebChatStyleSet;
      createStore: (
        initialState?: Record<string, unknown>,
        middleware?: WebChatStoreMiddleware
      ) => unknown;
      renderWebChat: (
        options: Record<string, unknown>,
        element: HTMLElement
      ) => void;
    };
  }
}
