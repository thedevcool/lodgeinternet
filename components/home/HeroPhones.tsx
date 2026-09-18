import type { ReactNode } from "react";
import { Building2, Check, Search } from "lucide-react";
import { cx } from "@/components/ui/cx";

/**
 * The Figma hero's three phones — find your hostel → choose a plan → you're
 * connected — drawn in HTML/CSS so there are no images to ship and it stays
 * crisp in light and dark mode. Purely decorative.
 */
export default function HeroPhones({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "relative overflow-hidden rounded-[36px] bg-gradient-to-br from-accent/15 via-sky-400/10 to-indigo-400/20 px-6 py-10 ring-1 ring-hairline",
        className,
      )}
    >
      <div aria-hidden className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-white/40 blur-3xl" />
      <div className="relative flex items-end justify-center gap-4 lg:gap-6">
        <Phone className="translate-y-6">
          <p className="text-center text-[8px] font-semibold text-ink">Lodge Internet</p>
          <div className="mt-2 flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-[6.5px] text-ink-3">
            <Search className="h-2 w-2" /> Search your hostel…
          </div>
          {["Olanla Hostel", "Sam Hostel", "Star Lodge"].map((n, i) => (
            <div key={n} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-surface p-1.5 shadow-card">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 text-accent-ink">
                <Building2 className="h-2.5 w-2.5" />
              </span>
              <span className="flex-1 text-[7px] font-semibold text-ink">{n}</span>
              {i === 0 && <span className="rounded-full bg-accent px-1.5 py-[2px] text-[5.5px] font-semibold text-white">View</span>}
            </div>
          ))}
        </Phone>

        <Phone className="scale-110">
          <p className="text-center text-[8px] font-semibold text-ink">Choose Plan</p>
          <div className="mt-3 grid grid-cols-3 gap-1">
            <MiniPlan label="3 Devices" price="₦1,500" per="/day" />
            <MiniPlan label="5 Devices" price="₦2,500" per="/day" featured />
            <MiniPlan label="TV Unlimited" price="₦5,000" per="/week" />
          </div>
          <div className="mt-3 rounded-lg bg-surface p-1.5 shadow-card">
            <div className="flex justify-between text-[6px] text-ink-2">
              <span>Plan price</span>
              <span>₦2,500</span>
            </div>
            <div className="mt-1 flex justify-between text-[6.5px] font-semibold text-ink">
              <span>Total</span>
              <span>₦2,771</span>
            </div>
            <div className="mt-1.5 rounded-full bg-accent py-1 text-center text-[6.5px] font-semibold text-white">Pay ₦2,771</div>
          </div>
        </Phone>

        <Phone className="translate-y-6">
          <div className="mt-6 flex flex-col items-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <p className="mt-2 text-[9px] font-bold text-ink">You’re Connected!</p>
            <div className="mt-2 w-full rounded-lg bg-surface p-2 text-center shadow-card ring-1 ring-accent/30">
              <p className="text-[5.5px] font-semibold uppercase tracking-wider text-ink-3">Wi-Fi access code</p>
              <p className="mt-0.5 font-mono text-[11px] font-bold tracking-wider text-ink">LDG-8821</p>
            </div>
            <p className="mt-2 text-center text-[6px] leading-[9px] text-ink-2">Use this code to connect your devices.</p>
            <span className="mt-2 text-[6.5px] font-semibold text-accent-ink">Back to Home</span>
          </div>
        </Phone>
      </div>
    </div>
  );
}

function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("w-[132px] shrink-0 rounded-[26px] bg-[#0b0b0c] p-[5px] shadow-float lg:w-[150px]", className)}>
      <div className="relative h-[270px] overflow-hidden rounded-[21px] bg-canvas px-2 pt-6 lg:h-[300px]">
        {/* dynamic island */}
        <div className="absolute left-1/2 top-1.5 h-[9px] w-11 -translate-x-1/2 rounded-full bg-[#0b0b0c]" />
        {children}
      </div>
    </div>
  );
}

function MiniPlan({ label, price, per, featured }: { label: string; price: string; per: string; featured?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-md px-1 py-1.5 text-center",
        featured ? "bg-accent text-white shadow-float" : "bg-surface text-ink shadow-card",
      )}
    >
      {featured && <p className="mb-0.5 text-[4.5px] font-semibold uppercase opacity-80">Popular</p>}
      <p className={cx("text-[5.5px] font-semibold", featured ? "text-white/90" : "text-accent-ink")}>{label}</p>
      <p className="mt-0.5 text-[8px] font-bold">{price}</p>
      <p className={cx("text-[5px]", featured ? "text-white/80" : "text-ink-3")}>{per}</p>
    </div>
  );
}
