"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "./WebChat.module.css";

const WEBCHAT_CDN =
  "https://cdn.botframework.com/botframework-webchat/latest/webchat.js";

// Direct Line 토큰 API 응답 형태
type DirectLineTokenResponse = {
  token: string;
  domain?: string;
  expires_in?: number;
};

export default function WebChat() {
  // WebChat 렌더링 대상 DOM 노드
  const hostRef = useRef<HTMLDivElement>(null);
  // 스크립트 로딩/초기화 중복 방지 플래그
  const initializedRef = useRef(false);
  // WebChat 스크립트 로딩 완료 여부
  const [scriptReady, setScriptReady] = useState(false);
  // UI 상태(오버레이 표시용)
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle"
  );
  // 에러 메시지 표시용 상태
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 로깅용 채팅 로그(리렌더가 필요 없으므로 ref로 보관)
  const chatLogRef = useRef<{ role: "user" | "bot"; text: string; rawText?: string; timestamp: string; parentTimestamp?: string; activityId?: string; conversationId?: string }[]>([]);
  // 마지막 사용자 발화(봇 응답과 매칭하기 위해 보관)
  const pendingUserRef = useRef<{ role: "user"; text: string; timestamp: string; activityId?: string; conversationId?: string } | null>(null);


  useEffect(() => {
    // 스크립트가 준비되지 않았거나 이미 초기화했거나 대상 DOM이 없으면 중단
    if (!scriptReady || initializedRef.current || !hostRef.current) {
      return;
    }

 
    // 렌더 대상 확보(초기화 도중 DOM이 사라질 수도 있어 방어)
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const init = async () => {
      try {
        // 토큰 발급 및 WebChat 준비 상태
        setStatus("connecting");
     
        // Direct Line 토큰 요청(서버에서 비밀키 보관)
        const response = await fetch("/api/directline/token", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Direct Line token request failed.");
        }

        // 토큰/도메인 파싱
        const { token, domain } =
          (await response.json()) as DirectLineTokenResponse;

        // 토큰 또는 WebChat 전역이 없으면 초기화 불가
        if (!token || !window.WebChat) {
          throw new Error("Web Chat script not available.");
        }

       
        // WebChat UI 테마/스타일 옵션
        const styleOptions = {
          accent: "#0A84FF",
          backgroundColor: "transparent",
          bubbleNubSize: 0,
          bubbleBackground: "#E5E5EA",
          // bubbleBorderColor: "rgba(60, 60, 67, 0.12)",
          bubbleBorderRadius: 18,
          bubbleTextColor: "#020201",
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

       
        // 스타일 세트를 생성하고 텍스트 폰트 기본값을 덮어쓰기
        const styleSet = window.WebChat.createStyleSet(styleOptions);
        styleSet.textContent = {
          fontFamily: "var(--font-space-grotesk), \"Segoe UI\", sans-serif",
          fontWeight: "500",
        };

       
        // Redux store 미들웨어 형태로 액션 가로채기(로그/텍스트 정규화용)
        const store = window.WebChat.createStore(
          {},
          () =>
            (next: (action: any) => any) =>
            (action: any) => {
              // 액션 페이로드는 WebChat 내부 구조에 의존
              const actionPayload = action?.payload as any;
     
              if (action?.type === "WEB_CHAT/SEND_MESSAGE") {
                // 사용자가 메시지를 전송할 때 로깅
                const text = actionPayload?.text;
                if (typeof text === "string") {
                  const activityId = actionPayload?.activity?.id ?? actionPayload?.activity?.clientActivityId;
                  const conversationId = actionPayload?.activity?.conversation?.id;
             
                  // 사용자 메시지 로그 엔트리 구성
                  const entry = {
                    role: "user" as const,
                    text,
                    timestamp: new Date().toISOString(),
                    activityId,
                    conversationId,
                  };
                  // 로컬 로그에 저장(렌더링에는 영향 없음)
                  chatLogRef.current.push(entry);
                  // 다음 봇 응답과 매칭하기 위해 보관
                  pendingUserRef.current = entry;
                  // 서버 로그 저장(비동기 fire-and-forget)
                  void fetch("/api/log", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ event: "user_message", entry }),
                  });
                }
              }

             
              if (action?.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
                // Direct Line에서 봇 응답이 들어올 때 텍스트 정리 + 로그
                const activity = actionPayload?.activity;
                const role = activity?.from?.role;
                if (activity && role !== "user" && activity?.type !== "typing") {
                  if (typeof activity.text === "string") {
                    const originalText = activity.text;
                    // 줄바꿈 형식을 유지(LF/CRLF)
                    const lineBreak = originalText.includes("\r\n") ? "\r\n" : "\n";
             
                    // 리스트 항목 들여쓰기 통일(가독성 개선)
                    const listNormalizedText = originalText.replace(/(\r?\n)[\t ]{2,}- /g, `${lineBreak}    - `);
                
                    // 문단 사이 줄바꿈을 마크다운에서 보기 좋게 정리
                    const normalizedText = listNormalizedText.replace(/(\r?\n)(?!\s*[-*]\s+|\s*$)/g, `  ${lineBreak}`);
                
                    // 불필요한 각주/FAQ 문구/중복 공백 제거
                    const cleanedText = normalizedText
                      .replace(/\[\d+\]/g, "")
                      .replace(/\(FAQ\s*占쏙옙占쏙옙\)/g, "")
                      .replace(/^\s*:?\s*cite:\d+.*$/gim, "")
                      .replace(/\n\s*\n/g, "\n")
                      .trimEnd();
                
                    // 봇 응답 로그 엔트리 구성
                    const botEntry = {
                      role: "bot" as const,
                      text: cleanedText,
                      rawText: originalText,
                      timestamp: new Date().toISOString(),
                      parentTimestamp: pendingUserRef.current?.timestamp,
                      activityId: activity?.id,
                      conversationId: activity?.conversation?.id,
                    };
                    // 로컬 로그에 저장
                    chatLogRef.current.push(botEntry);
                    // 대기중인 사용자 메시지 해제
                    pendingUserRef.current = null;
                    // 서버 로그 저장(비동기)
                    void fetch("/api/log", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ event: "bot_message", entry: botEntry }),
                    });
                    // 표시 텍스트가 바뀌었거나 포맷이 아닐 경우 WebChat 액션 수정
                    if (
                      cleanedText !== originalText ||
                      activity.textFormat !== "markdown"
                    ) {
                      action = {
                        ...action,
                        payload: {
                          ...action.payload,
                          activity: {
                            ...activity,
                 
                            // 정리된 텍스트를 마크다운으로 렌더하도록 설정
                            text: cleanedText,
                            textFormat: "markdown",
                          },
                        },
                      };
                    }

                    // 원문도 별도 로깅(디버깅/추적용)
                    void fetch("/api/log", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message: originalText }),
                    });
                  }
                }
              }
              // 다음 미들웨어/리듀서로 액션 전달
              return next(action);
            }
        );

    
        // Direct Line 클라이언트 생성
        const directLine = window.WebChat.createDirectLine({
          token,
          domain,
        });

    
        // WebChat UI 렌더링
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

        // 성공적으로 렌더링된 상태
        setStatus("ready");
      } catch (error) {
        // 오류 메시지 표시
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setErrorMessage(message);
        setStatus("error");
      }
    };

    // 이펙트 중복 초기화 방지
    initializedRef.current = true;
    // 비동기 초기화 실행(결과는 내부에서 처리)
    void init();
  }, [scriptReady]);

  return (
    <div className={styles.shell}>
 
      {/* 전역 스타일 오버라이드(WebChat 내부 클래스 대상으로 커스터마이징) */}
      <style jsx global>{`
       
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

      
        /* 마크다운 렌더링 텍스트는 여백을 넉넉하게 */
        .webchat__bubble__content:has(.webchat__text-content--is-markdown) {
          padding: 18px 32px;
        }

       
        /* 링크 정의(footnote) 영역 숨김 */
        .webchat__link-definitions,
        .webchat__link-definitions__list,
        .webchat__link-definitions__list-item {
          display: none !important;
        }

      
        /* 일반 텍스트 버블은 컴팩트하게 */
        .webchat__bubble__content:has(.webchat__text-content--is-plain) {
          padding: 12px 12px;
        }

       
        /* 버블 모서리 라운딩 통일 */
        .webchat__bubble .webchat__bubble__content {
          border-radius: 16px !important;
        }

      
        /* 입력창/전송 박스 스타일 정리 */
        .webchat__send-box-text-box {
          padding: 12px 14px;
          min-height: 30px;
          background: #ffffff;
        }

        .webchat__send-box {
          background: #ffffff;
          border: 1px solid rgba(17, 17, 17, 0.12);
          border-radius: 16px;
          padding: 6px 10px;
        }

        .webchat__send-box__main {
          background: #ffffff;
        }

        [class^="webchat--css-"] .webchat__send-box__main,
        [class*=" webchat--css-"] .webchat__send-box__main {
          border-top: none !important;
          background: #ffffff !important;
        }

        .webchat__send-box-text-box__input {
          background: #ffffff;
          border: none;
          box-shadow: none;
        }

        .webchat__send-box__button {
          border-radius: 12px;
          border: none;
          box-shadow: none;
        }

        .webchat__icon-button__shade {
          background: #ffffff;
          border: none;
          box-shadow: none;
        }

        .webchat__icon-button {
          border: none;
          box-shadow: none;
        }

        /* 텍스트 렌더링 기본 타이포그래피 */
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
      {/* WebChat 스크립트 로딩(클라이언트에서만) */}
      <Script
        src={WEBCHAT_CDN}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      {/* WebChat이 실제 렌더링될 컨테이너 */}
      <div className={styles.host} ref={hostRef} />
      {/* 연결/로딩 상태 오버레이 */}
      {status !== "ready" && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayCard}>
            <span className={styles.statusLabel}>
              {status === "connecting" && "챗봇 연결 중"}
              {status === "error" && "챗봇 연결에 실패하였습니다"}
              {status === "idle" && "챗봇 로딩 중"}                                                                                            
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

