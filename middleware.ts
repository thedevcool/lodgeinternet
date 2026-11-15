import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request Content-Security-Policy with a fresh nonce.
 *
 * Why here and not next.config.mjs: a CSP that actually stops injected scripts
 * needs a nonce that changes every request, and only middleware can mint one
 * per request. The static security headers (X-Frame-Options, nosniff, etc.)
 * stay in next.config.mjs.
 *
 * How the nonce reaches the scripts: we set the CSP on the *request* headers
 * too, which is the signal Next.js reads to stamp the same nonce onto the
 * framework/bootstrap <script> tags it emits. Our own inline script (the
 * theme-init in app/(client)/layout.tsx) reads the nonce from `x-nonce` via
 * next/headers and sets it itself. Everything else is 'self'.
 *
 * script-src has no 'unsafe-inline': an injected inline <script> or event
 * handler without this request's nonce will not execute — the point of the
 * policy. Paystack is allowed by host (js.paystack.co) because its tag is a
 * plain <script src> we don't control the render of. style-src keeps
 * 'unsafe-inline' deliberately: Next and next/font inject inline <style>, and
 * CSS injection can't run code, so the risk is not worth the breakage.
 *
 * Local development and the end-to-end tests point NEXT_PUBLIC_API_BASE_URL
 * at an API on this machine. Only then is that one origin added to
 * connect-src and img-src (blog covers are images served by the API), and
 * requests are not upgraded to https, which localhost doesn't serve. A production API address never matches LOCAL_API, so the
 * production policy is exactly the list below.
 */
const LOCAL_API = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
  ? (process.env.NEXT_PUBLIC_API_BASE_URL as string)
  : "";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://js.paystack.co`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:${LOCAL_API ? ` ${LOCAL_API}` : ""}`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.lodgeinternet.com https://api.lodge-internet.com https://api.paystack.co${LOCAL_API ? ` ${LOCAL_API}` : ""}`,
    `frame-src https://checkout.paystack.com https://*.paystack.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(LOCAL_API ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on pages, not on static assets or images (they need no CSP), and skip
  // prefetches so we don't mint a nonce for a request whose HTML is discarded.
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
