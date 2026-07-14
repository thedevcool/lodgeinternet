"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wifi,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  GraduationCap,
  Home,
  Building2,
  Mail,
  Phone,
  Sparkles,
} from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-apple-gray-100 to-white">
      {step === "intro" ? (
        <IntroSection onStart={() => goNext("email")} />
      ) : (
        <div className="px-4 sm:px-6 lg:px-8 py-10 flex items-start justify-center">
          <div className="w-full max-w-md">
            {/* Back link */}
            {step !== "done" && (
              <div className="mb-6">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 text-apple-gray-600 hover:text-apple-gray-900 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">Back</span>
                </button>
              </div>
            )}

            {/* Progress dots */}
            {showProgress && (
              <div className="flex items-center justify-center gap-2 mb-6">
                {STEP_ORDER.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-all ${
                      i < stepIndex
                        ? "w-6 bg-blue-500"
                        : i === stepIndex
                          ? "w-10 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400"
                          : "w-6 bg-apple-gray-200"
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-2xl p-8 border border-apple-gray-200">
              {/* Card header */}
              {step !== "done" && (
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-500 to-purple-400 rounded-2xl mb-4">
                    {step === "email" ? (
                      <Mail className="w-8 h-8 text-white" />
                    ) : step === "audience" ? (
                      <Sparkles className="w-8 h-8 text-white" />
                    ) : step === "details" ? (
                      audience === "student" ? (
                        <GraduationCap className="w-8 h-8 text-white" />
                      ) : (
                        <Home className="w-8 h-8 text-white" />
                      )
                    ) : step === "pricing" ? (
                      <Building2 className="w-8 h-8 text-white" />
                    ) : (
                      <Phone className="w-8 h-8 text-white" />
                    )}
                  </div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2">
                    {step === "email"
                      ? "Your email"
                      : step === "audience"
                        ? "Where are you joining from?"
                        : step === "details"
                          ? audience === "student"
                            ? "Your school details"
                            : "Where you live"
                          : step === "pricing"
                            ? "Our pricing"
                            : "WhatsApp number"}
                  </h1>
                  <p className="text-apple-gray-600">
                    {step === "email"
                      ? "We'll use this to keep you posted."
                      : step === "audience"
                        ? "Pick the one that fits you best."
                        : step === "details"
                          ? "We use this to plan our rollout."
                          : step === "pricing"
                            ? "Take a look and tell us how it sits with you."
                            : "Almost done — we'll WhatsApp you the moment we go live in your area."}
                  </p>
                </div>
              )}

              {/* Errors */}
              {error && step !== "done" && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Step content */}
              {step === "email" && (
                <form onSubmit={submitEmail} className="space-y-5">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-semibold text-apple-gray-900 mb-2"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="your.email@example.com"
                      className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <PrimaryButton label="Continue" />
                </form>
              )}

              {step === "audience" && (
                <div className="space-y-3">
                  <button
                    onClick={() => pickAudience("student")}
                    className="w-full flex items-center gap-4 p-4 bg-apple-gray-50 border border-apple-gray-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className="p-2.5 bg-apple-gray-100 group-hover:bg-blue-100 rounded-xl transition-colors">
                      <GraduationCap className="w-5 h-5 text-apple-gray-600 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-apple-gray-900">Student (Hostel)</p>
                      <p className="text-xs text-apple-gray-500">I live in school or a hostel.</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-apple-gray-400" />
                  </button>

                  <button
                    onClick={() => pickAudience("resident")}
                    className="w-full flex items-center gap-4 p-4 bg-apple-gray-50 border border-apple-gray-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className="p-2.5 bg-apple-gray-100 group-hover:bg-blue-100 rounded-xl transition-colors">
                      <Home className="w-5 h-5 text-apple-gray-600 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-apple-gray-900">Resident (Home)</p>
                      <p className="text-xs text-apple-gray-500">I live at home or an estate.</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-apple-gray-400" />
                  </button>
                </div>
              )}

              {step === "details" && audience === "student" && (
                <form onSubmit={submitDetails} className="space-y-5">
                  <LabeledInput
                    id="schoolName"
                    label="School name"
                    value={schoolName}
                    onChange={setSchoolName}
                    placeholder="e.g. University of Ibadan"
                    autoFocus
                  />
                  <LabeledInput
                    id="hostelName"
                    label="Hostel name"
                    value={hostelName}
                    onChange={setHostelName}
                    placeholder="e.g. Tedder Hall"
                  />
                  <LabeledInput
                    id="schoolAddress"
                    label="School address"
                    value={schoolAddress}
                    onChange={setSchoolAddress}
                    placeholder="City / town the school is in"
                  />
                  <div>
                    <label
                      htmlFor="hostelOccupants"
                      className="block text-sm font-semibold text-apple-gray-900 mb-2"
                    >
                      How many people live in your hostel?
                    </label>
                    <input
                      id="hostelOccupants"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={5000}
                      value={hostelOccupants}
                      onChange={(e) => setHostelOccupants(e.target.value)}
                      required
                      placeholder="Approximately, e.g. 120"
                      className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <p className="text-xs text-apple-gray-500 mt-2">
                      A rough estimate is fine — this helps us plan the right setup for your hostel.
                    </p>
                  </div>
                  <PrimaryButton label="Continue" />
                </form>
              )}

              {step === "details" && audience === "resident" && (
                <form onSubmit={submitDetails} className="space-y-5">
                  <LabeledInput
                    id="address"
                    label="Address"
                    value={address}
                    onChange={setAddress}
                    placeholder="Street address"
                    autoFocus
                  />
                  <LabeledInput
                    id="estate"
                    label="Estate name"
                    value={estate}
                    onChange={setEstate}
                    placeholder="e.g. Magodo Phase 2"
                  />
                  <LabeledInput
                    id="city"
                    label="City"
                    value={city}
                    onChange={setCity}
                    placeholder="e.g. Lagos"
                  />
                  <PrimaryButton label="Continue" />
                </form>
              )}

              {step === "pricing" && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-apple-gray-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-3 border-b border-apple-gray-200">
                      <p className="text-sm font-semibold text-apple-gray-900">
                        Data plans (monthly)
                      </p>
                    </div>
                    <div className="divide-y divide-apple-gray-100">
                      {PLAN_TABLE.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between px-4 py-2.5 text-sm"
                        >
                          <span className="text-apple-gray-700">{row.label}</span>
                          <span className="font-semibold text-apple-gray-900">{row.price}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 bg-apple-gray-50 text-xs text-apple-gray-500">
                      Unlimited subject to fair-usage &amp; speed control. Pricing can vary
                      slightly with your location and the number of users in your hostel.
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-apple-gray-900 text-center">
                    How does this sit with you?
                  </p>

                  <button
                    onClick={() => pickAffordability("yes")}
                    className="w-full flex items-center gap-4 p-4 bg-apple-gray-50 border border-apple-gray-200 rounded-2xl hover:border-green-300 hover:bg-green-50 transition-all text-left group"
                  >
                    <div className="p-2.5 bg-apple-gray-100 group-hover:bg-green-100 rounded-xl transition-colors">
                      <CheckCircle className="w-5 h-5 text-apple-gray-600 group-hover:text-green-600 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-apple-gray-900">
                        Yes, I can afford it
                      </p>
                      <p className="text-xs text-apple-gray-500">
                        The pricing works for me as it is.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => pickAffordability("manage")}
                    className="w-full flex items-center gap-4 p-4 bg-apple-gray-50 border border-apple-gray-200 rounded-2xl hover:border-amber-300 hover:bg-amber-50 transition-all text-left group"
                  >
                    <div className="p-2.5 bg-apple-gray-100 group-hover:bg-amber-100 rounded-xl transition-colors">
                      <Sparkles className="w-5 h-5 text-apple-gray-600 group-hover:text-amber-600 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-apple-gray-900">I can manage</p>
                      <p className="text-xs text-apple-gray-500">
                        It's a stretch, but I'd still use it.
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {step === "whatsapp" && (
                <form onSubmit={submitFinal} className="space-y-5">
                  <div>
                    <label
                      htmlFor="whatsapp"
                      className="block text-sm font-semibold text-apple-gray-900 mb-2"
                    >
                      WhatsApp number
                    </label>
                    <input
                      id="whatsapp"
                      type="tel"
                      inputMode="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      required
                      autoFocus
                      placeholder="0801 234 5678"
                      className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <p className="text-xs text-apple-gray-500 mt-2">
                      Nigerian numbers only — we'll WhatsApp you when we're ready.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Submitting…
                      </span>
                    ) : (
                      "Join the Waitlist"
                    )}
                  </button>
                </form>
              )}

              {step === "done" && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-apple-gray-900 mb-2">
                    You're on the list!
                  </h2>
                  <p className="text-apple-gray-600 text-sm mb-5 leading-relaxed">
                    Thanks for telling us where you are. We'll WhatsApp you the moment Lodge
                    Internet goes live in your area.
                  </p>

                  {/* Referral nudge — audience-aware so it speaks the right language. */}
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 text-left mb-6">
                    <p className="text-sm font-semibold text-apple-gray-900 mb-2">
                      Want us there faster?
                    </p>
                    {audience === "student" ? (
                      <p className="text-sm text-apple-gray-700 leading-relaxed">
                        Tell your <strong>hostelmates</strong> and the hostels next to yours to
                        join the waitlist too. The more sign-ups we see from one location, the
                        sooner we install there — so a packed waitlist literally puts your
                        hostel at the front of the queue.
                      </p>
                    ) : (
                      <p className="text-sm text-apple-gray-700 leading-relaxed">
                        Tell your <strong>neighbours</strong> and friends in nearby estates to
                        join the waitlist too. The more sign-ups we see from one area, the
                        sooner we install there — so the louder your area is on the list, the
                        faster we come.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => router.push("/")}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-apple-gray-300 text-apple-gray-700 font-semibold rounded-xl hover:bg-apple-gray-50 transition-colors text-sm"
                  >
                    Back to home
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function IntroSection({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-24 overflow-hidden">
      {/* Background flourishes — same vocabulary as the landing page */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-gradient-radial from-blue-100 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-radial from-purple-100 to-transparent rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center justify-center p-4 sm:p-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl sm:rounded-3xl shadow-2xl mb-3">
          <Wifi className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={2.5} />
        </div>

        <p className="text-lg sm:text-xl font-semibold tracking-wide mb-8 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
          Lodge Internet
        </p>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-semibold mb-6 leading-tight">
          <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
            Do you want to enjoy fast internet like we feel like you should?
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-apple-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          We are thinking of bringing Starlink Internet, but we don&apos;t know if you need it in
          your area.
        </p>

        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold px-8 py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 text-lg"
        >
          Get on the Waitlist
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-sm text-apple-gray-500 mt-6">
          Powered by Starlink · Up to 50 Mbps · Currently in pilot
        </p>
      </div>
    </section>
  );
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-apple-gray-900 mb-2"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

function PrimaryButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
    >
      {label}
    </button>
  );
}
