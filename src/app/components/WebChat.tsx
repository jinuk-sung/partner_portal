"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "./WebChat.module.css";

const WEBCHAT_CDN =
  "https://cdn.botframework.com/botframework-webchat/latest/webchat.js";

const TYPING_DELAY_MS = 20000;
const TYPING_INTERVAL_MS = 4000;

type DirectLineTokenResponse = {
  token: string;
  domain?: string;
  expires_in?: number;
};

export default function WebChat() {
  const hostRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!scriptReady || initializedRef.current || !hostRef.current) {
      return;
    }

    // CDN 스크립트 로드 이후 한 번만 Web Chat을 초기화합니다.
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let typingIntervalId: number | null = null;

    const clearTypingInterval = () => {
      if (typingIntervalId !== null) {
        window.clearInterval(typingIntervalId);
        typingIntervalId = null;
      }
    };

    const typingActivity = () => ({
      type: "typing",
      from: { role: "bot" },
    });

    const init = async () => {
      try {
        setStatus("connecting");
        // 서버 라우트에서 Direct Line 토큰을 요청합니다.
        const response = await fetch("/api/directline/token", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Direct Line token request failed.");
        }

        const { token, domain } =
          (await response.json()) as DirectLineTokenResponse;

        if (!token || !window.WebChat) {
          throw new Error("Web Chat script not available.");
        }

        // Web Chat에서 지원하는 스타일 옵션입니다.
        const styleOptions = {
          accent: "#0A84FF",
          backgroundColor: "transparent",
          bubbleNubSize: 0,
          bubbleBackground: "#E5E5EA",
          bubbleBorderColor: "rgba(60, 60, 67, 0.12)",
          bubbleBorderRadius: 18,
          bubbleTextColor: "#020101",
          bubbleFromUserBackground: "#0A84FF",
          bubbleFromUserBorderColor: "rgba(10, 132, 255, 0.2)",
          bubbleFromUserBorderRadius: 18,
          bubbleFromUserTextColor: "#FFFFFF",
          botAvatarBackgroundColor: "#0b3d49",
          hideUploadButton: true,
          sendBoxBackground: "#F2F2F7",
          sendBoxBorderTop: "1px solid rgba(60, 60, 67, 0.12)",
          sendBoxPlaceholderColor: "#8E8E93",
          sendBoxTextColor: "#111111",
          suggestedActionBorderRadius: 999,
          suggestedActionBorderColor: "rgba(10, 132, 255, 0.4)",
          suggestedActionBackground: "#FFFFFF",
          suggestedActionTextColor: "#0A84FF",
          timestampColor: "#8E8E93",
          userAvatarBackgroundColor: "#c56b3a",
        };

        // StyleSet으로 내부 스타일 토큰을 세밀하게 조정합니다.
        const styleSet = window.WebChat.createStyleSet(styleOptions);
        styleSet.textContent = {
          fontFamily: "var(--font-space-grotesk), \"Segoe UI\", sans-serif",
          fontWeight: "500",
        };

        const store = window.WebChat.createStore(
          {},
          ({ dispatch }) =>
            (next) =>
            (action) => {
              if (action?.type === "WEB_CHAT/SEND_MESSAGE") {
                const startTime = Date.now();
                clearTypingInterval();
                dispatch({
                  type: "DIRECT_LINE/INCOMING_ACTIVITY",
                  payload: { activity: typingActivity() },
                  meta: { delayed: true, injected: true },
                });
                typingIntervalId = window.setInterval(() => {
                  if (Date.now() - startTime >= TYPING_DELAY_MS) {
                    clearTypingInterval();
                    return;
                  }
                  dispatch({
                    type: "DIRECT_LINE/INCOMING_ACTIVITY",
                    payload: { activity: typingActivity() },
                    meta: { delayed: true, injected: true },
                  });
                }, TYPING_INTERVAL_MS);
              }

              if (
                action?.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
                action?.payload?.activity?.from?.role === "bot" &&
                action?.payload?.activity?.type !== "typing" &&
                !action?.meta?.delayed
              ) {
                const delayedAction = {
                  ...action,
                  meta: { ...(action.meta ?? {}), delayed: true },
                };
                window.setTimeout(() => {
                  dispatch(delayedAction);
                }, TYPING_DELAY_MS);
                return;
              }

              if (
                action?.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
                action?.payload?.activity?.from?.role === "bot" &&
                action?.payload?.activity?.type !== "typing" &&
                action?.meta?.delayed
              ) {
                clearTypingInterval();
              }

              return next(action);
            }
        );

        // 발급된 단기 토큰으로 Direct Line에 연결합니다.
        const directLine = window.WebChat.createDirectLine({
          token,
          domain,
        });

        // 호스트 엘리먼트에 Web Chat을 렌더링합니다.
        window.WebChat.renderWebChat(
          {
            directLine,
            styleOptions,
            styleSet,
            store,
            locale: "ko-KR",
          },
          host
        );

        setStatus("ready");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setErrorMessage(message);
        setStatus("error");
      }
    };

    initializedRef.current = true;
    void init();
  }, [scriptReady]);

  return (
    <div className={styles.shell}>
 
      <style jsx global>{`
        /* 타이핑(로딩) 버블 */
        .webchat__typing-indicator {
          background: #E5E5EA;
          background-image: none !important;
          mask-image: none !important;
          -webkit-mask-image: none !important;
          border-radius: 18px;
          padding: 16px 12px;
          min-width: 128px;
          display: inline-flex;
          justify-content: center;
          align-items: center;
        }
        .webchat__typing-indicator > * {
          display: none;
        }
        .webchat__typing-indicator::after {
          content: none;
        }
        .webchat__typing-indicator::before {
          content: "";
          width: 46px;
          height: 16px;
          display: block;
          background:
            radial-gradient(circle, #8E8E93 70%, transparent 71%) 0px 50% / 8px 8px no-repeat,
            radial-gradient(circle, #8E8E93 70%, transparent 71%) 18px 50% / 8px 8px no-repeat,
            radial-gradient(circle, #8E8E93 70%, transparent 71%) 36px 50% / 8px 8px no-repeat;
          animation: typingDots 1.6s infinite cubic-bezier(0.45, 0, 0.55, 1) !important;
          opacity: 0.9;
          will-change: background-position, opacity;
        }

        @keyframes typingDots {
          0% {
            background-position: 0px calc(50% + 3px), 18px 50%, 36px calc(50% - 3px);
            opacity: 0.4;
          }
          25% {
            background-position: 0px calc(50% - 3px), 18px calc(50% + 3px), 36px 50%;
            opacity: 1;
          }
          50% {
            background-position: 0px 50%, 18px calc(50% - 3px), 36px calc(50% + 3px);
            opacity: 1;
          }
          75% {
            background-position: 0px calc(50% + 3px), 18px 50%, 36px calc(50% - 3px);
            opacity: 1;
          }
          80%,
          100% {
            background-position: 0px calc(50% + 3px), 18px 50%, 36px calc(50% - 3px);
            opacity: 0.4;
          }
        }

        /* 봇 말풍선 여백 */
        .webchat__bubble__content:has(.webchat__text-content--is-markdown) {
          padding: 28px 36px;
        }

        /* 사용자 말풍선 여백 */
        .webchat__bubble__content:has(.webchat__text-content--is-plain) {
          padding: 12px 12px;
        }

        /* 입력창 */
        .webchat__send-box-text-box {
          padding: 12px 14px;
          min-height: 30px;
        }

        /* 텍스트 가독성 */
        .webchat__text-content,
        .webchat__text-content p,
        .webchat__render-markdown {
          line-height: 1.7;
          font-size: 16px;
          white-space: normal;
          overflow-wrap: break-word;
          word-break: keep-all;
        }
      `}</style>
      <Script
        src={WEBCHAT_CDN}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div className={styles.host} ref={hostRef} />
      {status !== "ready" && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayCard}>
            <span className={styles.statusLabel}>
              {status === "connecting" && "챗봇 연결 중..."}
              {status === "error" && "연결할 수 없습니다."}
              {status === "idle" && "챗봇 로딩 중..."}
            </span>
            {errorMessage && (
              <span className={styles.statusHint}>{errorMessage}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
