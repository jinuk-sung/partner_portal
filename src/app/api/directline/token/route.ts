import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin: string) => {
  for (const allowed of ALLOWED_ORIGINS) {
    if (allowed === origin) {
      return true;
    }

    const schemeSplit = allowed.split("://");
    const hasScheme = schemeSplit.length === 2;
    const scheme = hasScheme ? schemeSplit[0] : "";
    const hostPattern = hasScheme ? schemeSplit[1] : allowed;

    if (!hostPattern.startsWith("*.") || (hasScheme && !origin.startsWith(`${scheme}://`))) {
      continue;
    }

    try {
      const { hostname } = new URL(origin);
      const suffix = hostPattern.slice(1);
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
};

// 요청 Origin/Referer가 허용 목록에 있는지 확인합니다.
const resolveAllowedOrigin = (origin: string | null, referer: string | null) => {
  if (ALLOWED_ORIGINS.length === 0) {
    return origin ?? "";
  }

  if (origin && isAllowedOrigin(origin)) {
    return origin;
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isAllowedOrigin(refererOrigin)) {
        return refererOrigin;
      }
    } catch {
      return "";
    }
  }

  return "";
};

// CORS 응답 헤더를 구성합니다.
const buildCorsHeaders = (origin: string) => {
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
};

// 프리플라이트 요청을 처리합니다.
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowedOrigin = resolveAllowedOrigin(origin, referer);

  if (!allowedOrigin && ALLOWED_ORIGINS.length > 0) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(allowedOrigin) });
}

// Direct Line 토큰을 발급합니다.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowedOrigin = resolveAllowedOrigin(origin, referer);
  const corsHeaders = buildCorsHeaders(allowedOrigin);

  // 허용되지 않은 Origin이면 차단합니다.
  if (!allowedOrigin && ALLOWED_ORIGINS.length > 0) {
    return NextResponse.json(
      { error: "Origin not allowed." },
      { status: 403, headers: corsHeaders }
    );
  }

  const secret = process.env.DIRECT_LINE_SECRET;
  const domain =
    process.env.DIRECT_LINE_DOMAIN ??
    "https://directline.botframework.com/v3/directline";

  // 필수 시크릿이 없으면 에러를 반환합니다.
  if (!secret) {
    return NextResponse.json(
      { error: "DIRECT_LINE_SECRET is missing." },
      { status: 500 }
    );
  }

  // Direct Line 토큰 발급 요청을 보냅니다.
  const response = await fetch(`${domain}/tokens/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
    cache: "no-store",
  });

  const datum = await response.json()

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to acquire Direct Line token." },
      { status: 502 }
    );
  }

  // 토큰 응답을 파싱합니다.
  const data = (datum) as {
    token?: string;
    expires_in?: number;
    conversationId?: string;
  };

  // 캐시 방지 헤더를 추가합니다.
  corsHeaders.set("Cache-Control", "no-store");

  return NextResponse.json(
    {
      token: data.token,
      expires_in: data.expires_in,
      domain,
    },
    { headers: corsHeaders }
  );
}
