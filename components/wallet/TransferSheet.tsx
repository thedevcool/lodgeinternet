"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { AccountDetails } from "./AccountDetails";
import { naira, postJson, type ReadyOrder, type WaitingOrder } from "./walletApi";

// Poll every 5s while the customer is likely mid-transfer; after 10 minutes
// slow to every 20s (transfers can take a while, but no need to hammer).
const FAST_MS = 5_000;
const SLOW_MS = 20_000;
const SLOW_AFTER_MS = 10 * 60 * 1000;

/**
 * "Transfer ₦X to your account" — shown while a bank-transfer order waits.
 *
 * Polls POST /api/checkout/dva/status until the order is paid (→ onReady) or
 * fails (message shown here; the money stays in the wallet). Polling stops
 * when the sheet closes or unmounts. Closing does NOT cancel anything: the
 * code is still reserved and is issued + emailed when the transfer lands.
 */
export default function TransferSheet({
  order,
  onReady,
  onClose,
}: {
  order: WaitingOrder | null;
  onReady: (ready: ReadyOrder) => void;
  /** `stillWaiting` is false once the order has failed. */
  onClose: (stillWaiting: boolean) => void;
}) {
  // From the order straight away (not only in the effect), so the first
  // paint never says "Transfer ₦0".
  const [toTransferKobo, setToTransferKobo] = useState(order?.toTransferKobo ?? 0);
  const [failure, setFailure] = useState("");
  // Paid from the wallet; the code is still being issued.
  const [paid, setPaid] = useState(false);

  // Latest onReady without restarting the poll each render.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const pendingId = order?.pendingId;
  useEffect(() => {
    if (!order) return;
    setToTransferKobo(order.toTransferKobo);
    setFailure("");
    setPaid(false);

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const { ok, data } = await postJson("/api/checkout/dva/status", { pendingId: order.pendingId });
        if (stopped) return;
        if (ok && data.status === "ready") {
          stopped = true;
          onReadyRef.current(data as ReadyOrder);
          return;
        }
        if (ok && data.status === "failed") {
          stopped = true;
          setFailure(data.message || "This order couldn't be completed. Your money is safe in your wallet.");
          return;
        }
        if (ok && typeof data.toTransferKobo === "number") setToTransferKobo(data.toTransferKobo);
        if (ok && data.paidFromWallet) setPaid(true);
      } catch {
        // Network blip — try again next tick.
      }
      if (stopped) return;
      timer = setTimeout(poll, Date.now() - startedAt > SLOW_AFTER_MS ? SLOW_MS : FAST_MS);
    };
    timer = setTimeout(poll, FAST_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Restart only for a different order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  // Part of the price is already in the wallet: say so, so the smaller
  // figure doesn't look like a mistake.
  const coveredKobo = order ? order.amountKobo - toTransferKobo : 0;

  return (
    <Sheet
      open={Boolean(order)}
      onClose={() => onClose(!failure)}
      layer="sheet-over"
      ariaLabel="Pay by bank transfer"
    >
      {order && (
        <div className="pt-1">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white">
              <Landmark className="h-7 w-7" />
            </span>
            <h2 className="ui-title-2 mt-4 text-ink">
              {paid ? "Paid — your code is on its way" : <>Transfer {naira(toTransferKobo)} to your account</>}
            </h2>
            <p className="ui-subhead mx-auto mt-1.5 max-w-xs text-ink-2">
              Send it from any bank app. This account number is yours — it never changes.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <AccountDetails dva={order.dva} />

            <div className="rounded-2xl bg-surface px-4 py-3.5 shadow-card">
              <dl className="flex items-baseline justify-between gap-3">
                <dt className="ui-subhead text-ink-2">Amount to send</dt>
                <dd className="text-[20px] font-semibold tabular-nums text-ink">{naira(toTransferKobo)}</dd>
              </dl>
              {coveredKobo > 0 && (
                <p className="ui-footnote mt-1 text-ink-2">
                  {naira(coveredKobo)} already in your wallet counts towards the {naira(order.amountKobo)} total.
                </p>
              )}
            </div>

            {failure ? (
              <InlineAlert title="Order not completed">{failure}</InlineAlert>
            ) : (
              <div role="status" className="flex items-center gap-3 rounded-2xl bg-accent/10 px-4 py-3 text-accent-ink">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="ui-subhead font-medium">Waiting for your transfer…</span>
              </div>
            )}

            <p className="ui-footnote text-center text-ink-2">
              {failure
                ? "You can use your wallet balance for your next plan."
                : "Keep this open and your plan appears the moment the money arrives. If you close it, we’ll still finish your order when it does."}
            </p>

            <Button variant="gray" full onClick={() => onClose(!failure)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
