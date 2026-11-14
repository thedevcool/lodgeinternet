"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandGlyph } from "@/components/ui/BrandMark";
import { ButtonLink } from "@/components/ui/Button";

/**
 * /app-return — where Paystack sends a card payment started in the mobile app.
 *
 * Paystack only redirects to an https address, so the app's card checkout
 * (backend `POST /api/app/checkout/card`) points here, and this page hands
 * over to the app's own address (`lodgeinternet://pay/return`). Inside the
 * app's payment window that hand-over closes the window at once; the app then
 * asks the server whether the payment went through, so nothing here decides
 * anything about the payment itself.
 */
const APP_RETURN = "lodgeinternet://pay/return";

export default function AppReturnPage() {
  return (
    <Suspense fallback={null}>
      <HandOver />
    </Suspense>
  );
}

function HandOver() {
  const params = useSearchParams();
  const reference = params.get("reference") || params.get("trxref") || "";
  const target = reference ? `${APP_RETURN}?reference=${encodeURIComponent(reference)}` : APP_RETURN;
  const [tried, setTried] = useState(false);

  useEffect(() => {
    window.location.replace(target);
    // If the app didn't take over (opened on another device, say), show the button.
    const timer = window.setTimeout(() => setTried(true), 1200);
    return () => window.clearTimeout(timer);
  }, [target]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <BrandGlyph className="h-16 w-16" />
      <h1 className="ui-title-2 mt-6 text-ink">Back to the Lodge app</h1>
      <p className="ui-body mt-2 max-w-sm text-ink-2">
        Your code appears in the app as soon as the payment is confirmed. We&apos;ll also email it to you.
      </p>
      {tried && (
        <ButtonLink href={target} className="mt-8">
          Open the Lodge app
        </ButtonLink>
      )}
    </div>
  );
}
