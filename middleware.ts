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
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://js.paystack.co`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.lodgeinternet.com https://api.lodge-internet.com https://api.paystack.co`,
    `frame-src https://checkout.paystack.com https://*.paystack.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
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
