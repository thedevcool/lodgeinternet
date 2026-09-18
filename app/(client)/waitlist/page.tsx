"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  ChevronLeft,
  GraduationCap,
  Home,
  Mail,
  Phone,
  Sparkles,
} from "lucide-react";
import { BrandGlyph } from "@/components/ui/BrandMark";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";
import { GroupedList, ListRow } from "@/components/ui/GroupedList";
import { cx } from "@/components/ui/cx";

type Step = "intro" | "email" | "audience" | "details" | "pricing" | "whatsapp" | "done";

type Audience = "student" | "resident";
type Affordability = "yes" | "manage";

interface PlanRow {
  label: string;
  price: string;
}

const PLAN_TABLE: PlanRow[] = [
  { label: "1 GB", price: "₦300" },
  { label: "20 GB", price: "₦3,000" },
  { label: "40 GB", price: "₦5,000" },
  { label: "90 GB", price: "₦10,000" },
  { label: "150 GB", price: "₦15,000" },
  { label: "250 GB", price: "₦20,000" },
  { label: "Unlimited (3 Devices)", price: "₦40,000" },
];

const STEP_ORDER: Step[] = ["email", "audience", "details", "pricing", "whatsapp"];

export default function WaitlistPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<Audience | "">("");
  const [schoolName, setSchoolName] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [hostelOccupants, setHostelOccupants] = useState("");
  const [address, setAddress] = useState("");
  const [estate, setEstate] = useState("");
  const [city, setCity] = useState("");
  const [affordability, setAffordability] = useState<Affordability | "">("");
  const [whatsapp, setWhatsapp] = useState("");

  const stepIndex = STEP_ORDER.indexOf(step as Step);
  const showProgress = stepIndex >= 0;

  const goNext = (next: Step) => {
    setError("");
    setStep(next);
  };

  const goBack = () => {
    setError("");
    if (step === "email") setStep("intro");
    else if (step === "audience") setStep("email");
    else if (step === "details") setStep("audience");
    else if (step === "pricing") setStep("details");
    else if (step === "whatsapp") setStep("pricing");
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setEmail(trimmed);
    goNext("audience");
  };

  const pickAudience = (a: Audience) => {
    setAudience(a);
    setError("");
    setStep("details");
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (audience === "student") {
      if (!schoolName.trim() || !hostelName.trim() || !schoolAddress.trim()) {
        setError("Please fill in your school name, hostel name, and school address");
        return;
      }
      const n = Math.floor(Number(hostelOccupants));
      if (!Number.isFinite(n) || n < 1 || n > 5000) {
        setError("Please give a rough number of people in your hostel (1–5000)");
        return;
      }
    } else {
      if (!address.trim() || !estate.trim() || !city.trim()) {
        setError("Please fill in your address, estate name, and city");
        return;
      }
    }
    goNext("pricing");
  };

  const pickAffordability = (a: Affordability) => {
    setAffordability(a);
    setError("");
    setStep("whatsapp");
  };

  const submitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!whatsapp.trim()) {
      setError("Please enter your WhatsApp number");
      return;
    }
    // Lightweight client-side check; server does the real normalization.
    const digits = whatsapp.replace(/\D/g, "");
    const looksValid =
      (digits.startsWith("234") && digits.length === 13) ||
      (digits.startsWith("0") && digits.length === 11) ||
      digits.length === 10;
    if (!looksValid) {
      setError("That doesn't look like a Nigerian WhatsApp number. Try 0801 234 5678.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, any> = {
        email,
        audienceType: audience,
        affordability,
        whatsappPhone: whatsapp,
      };
      if (audience === "student") {
        body.schoolName = schoolName.trim();
        body.hostelName = hostelName.trim();
        body.schoolAddress = schoolAddress.trim();
        body.hostelOccupants = Math.floor(Number(hostelOccupants));
      } else {
        body.address = address.trim();
        body.estate = estate.trim();
        body.city = city.trim();
      }

      const res = await apiFetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to submit. Please try again.");
        return;
      }

      setStep("done");
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Presentation (logic above unchanged) ─────────────────────────────────
  const stepIcon =
    step === "email" ? (
      <Mail className="h-7 w-7" />
    ) : step === "audience" ? (
      <Sparkles className="h-7 w-7" />
    ) : step === "details" ? (
      audience === "student" ? <GraduationCap className="h-7 w-7" /> : <Home className="h-7 w-7" />
    ) : step === "pricing" ? (
      <Building2 className="h-7 w-7" />
    ) : (
      <Phone className="h-7 w-7" />
    );

  const stepTitle =
    step === "email"
      ? "Your email"
      : step === "audience"
        ? "Where are you joining from?"
        : step === "details"
          ? audience === "student"
            ? "Your school details"
            : "Where you live"
          : step === "pricing"
            ? "Our pricing"
            : "WhatsApp number";

  const stepSubtitle =
    step === "email"
      ? "We'll use this to keep you posted."
      : step === "audience"
        ? "Pick the one that fits you best."
        : step === "details"
          ? "We use this to plan our rollout."
          : step === "pricing"
            ? "Take a look and tell us how it sits with you."
            : "Almost done — we'll WhatsApp you the moment we go live in your area.";

  if (step === "intro") return <IntroSection onStart={() => goNext("email")} />;

  return (
    <div className="mx-auto w-full max-w-[460px] px-4 pb-16 pt-6 sm:px-6 md:pt-12">
      {step !== "done" && (
        <button onClick={goBack} className="ui-subhead mb-5 inline-flex items-center gap-0.5 font-medium text-accent-ink">
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
      )}

      {/* Progress */}
      {showProgress && (
        <div className="mb-6 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}>
          {STEP_ORDER.map((s, i) => (
            <span key={s} className={cx("h-1 flex-1 rounded-full transition-colors duration-300", i <= stepIndex ? "bg-accent" : "bg-ink/10")} />
          ))}
        </div>
      )}

      <div className="md:rounded-sheet md:bg-surface md:p-8 md:shadow-card">
        {step !== "done" && (
          <div className="mb-7">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white">{stepIcon}</span>
            <h1 className="ui-large-title text-ink md:text-[30px] md:leading-9">{stepTitle}</h1>
            <p className="ui-callout mt-2 text-ink-2">{stepSubtitle}</p>
          </div>
        )}

        {error && step !== "done" && <InlineAlert className="mb-5">{error}</InlineAlert>}

        {step === "email" && (
          <form onSubmit={submitEmail} className="space-y-5">
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              placeholder="your.email@example.com"
            />
            <Button type="submit" full>
              Continue
            </Button>
          </form>
        )}

        {step === "audience" && (
          <GroupedList>
            <ListRow
              onClick={() => pickAudience("student")}
              leading={<IconTile><GraduationCap className="h-5 w-5" /></IconTile>}
              title="Student (Hostel)"
              subtitle="I live in school or a hostel."
            />
            <ListRow
              onClick={() => pickAudience("resident")}
              leading={<IconTile><Home className="h-5 w-5" /></IconTile>}
              title="Resident (Home)"
              subtitle="I live at home or an estate."
            />
          </GroupedList>
        )}

        {step === "details" && audience === "student" && (
          <form onSubmit={submitDetails} className="space-y-5">
            <TextField label="School name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required autoFocus placeholder="e.g. University of Ibadan" />
            <TextField label="Hostel name" value={hostelName} onChange={(e) => setHostelName(e.target.value)} required placeholder="e.g. Tedder Hall" />
            <TextField label="School address" value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} required placeholder="City / town the school is in" />
            <TextField
              label="How many people live in your hostel?"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={hostelOccupants}
              onChange={(e) => setHostelOccupants(e.target.value)}
              required
              placeholder="Approximately, e.g. 120"
              hint="A rough estimate is fine — this helps us plan the right setup for your hostel."
            />
            <Button type="submit" full>
              Continue
            </Button>
          </form>
        )}

        {step === "details" && audience === "resident" && (
          <form onSubmit={submitDetails} className="space-y-5">
            <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} required autoFocus placeholder="Street address" />
            <TextField label="Estate name" value={estate} onChange={(e) => setEstate(e.target.value)} required placeholder="e.g. Magodo Phase 2" />
            <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} required placeholder="e.g. Lagos" />
            <Button type="submit" full>
              Continue
            </Button>
          </form>
        )}

        {step === "pricing" && (
          <div className="space-y-6">
            <GroupedList
              header="Data plans (monthly)"
              footer="Unlimited subject to fair-usage & speed control. Pricing can vary slightly with your location and the number of users in your hostel."
            >
              {PLAN_TABLE.map((row) => (
                <div key={row.label} className="relative flex items-center justify-between px-4 py-3">
                  <span className="ui-callout text-ink">{row.label}</span>
                  <span className="ui-callout font-semibold tabular-nums text-ink">{row.price}</span>
                </div>
              ))}
            </GroupedList>

            <GroupedList header="How does this sit with you?">
              <ListRow
                onClick={() => pickAffordability("yes")}
                leading={<IconTile><CheckCircle className="h-5 w-5" /></IconTile>}
                title="Yes, I can afford it"
                subtitle="The pricing works for me as it is."
              />
              <ListRow
                onClick={() => pickAffordability("manage")}
                leading={<IconTile><Sparkles className="h-5 w-5" /></IconTile>}
                title="I can manage"
                subtitle="It's a stretch, but I'd still use it."
              />
            </GroupedList>
          </div>
        )}

        {step === "whatsapp" && (
          <form onSubmit={submitFinal} className="space-y-5">
            <TextField
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
              autoFocus
              autoComplete="tel"
              placeholder="0801 234 5678"
              hint="Nigerian numbers only — we'll WhatsApp you when we're ready."
            />
            <Button type="submit" full loading={loading}>
              {loading ? "Submitting…" : "Join the Waitlist"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="py-2 text-center">
            <span className="mx-auto flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-success text-white">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <h2 className="ui-title-1 mt-4 text-ink">You&apos;re on the list!</h2>
            <p className="ui-subhead mt-2 text-ink-2">
              Thanks for telling us where you are. We&apos;ll WhatsApp you the moment Lodge Internet goes live in your area.
            </p>

            {/* Referral nudge — audience-aware so it speaks the right language. */}
            <div className="mt-6 rounded-card bg-accent/10 p-5 text-left">
              <p className="ui-headline text-ink">Want us there faster?</p>
              {audience === "student" ? (
                <p className="ui-subhead mt-1.5 text-ink-2">
                  Tell your <strong className="text-ink">hostelmates</strong> and the hostels next to yours to join the
                  waitlist too. The more sign-ups we see from one location, the sooner we install there — so a packed
                  waitlist literally puts your hostel at the front of the queue.
                </p>
              ) : (
                <p className="ui-subhead mt-1.5 text-ink-2">
                  Tell your <strong className="text-ink">neighbours</strong> and friends in nearby estates to join the
                  waitlist too. The more sign-ups we see from one area, the sooner we install there — so the louder your
                  area is on the list, the faster we come.
                </p>
              )}
            </div>

            <Button variant="gray" className="mt-6" onClick={() => router.push("/")}>
              Back to home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function IntroSection({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 md:pt-24 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative mx-auto max-w-3xl text-center">
        <BrandGlyph className="mx-auto h-16 w-16" />
        <p className="ui-eyebrow mt-5 text-accent-ink">Lodge Internet</p>
        <h1 className="ui-display mt-4 text-ink">Do you want to enjoy fast internet like we feel like you should?</h1>
        <p className="ui-body mx-auto mt-6 max-w-2xl text-ink-2">
          We are thinking of bringing Starlink Internet, but we don&apos;t know if you need it in your area.
        </p>
        <Button className="mt-10" onClick={onStart}>
          Get on the Waitlist <ArrowRight className="h-5 w-5" />
        </Button>
        <p className="ui-footnote mt-6 text-ink-2">Powered by Starlink · Up to 50 Mbps · Currently in pilot</p>
      </div>
    </section>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-accent/10 text-accent-ink">{children}</span>
  );
}
