"use client";

import { ArrowUpRight } from "lucide-react";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Accordion from "@/components/ui/Accordion";
import WhatsAppCard from "@/components/ui/WhatsAppCard";
import WhatsAppIcon from "@/components/ui/WhatsAppIcon";
import { GroupedList } from "@/components/ui/GroupedList";
import { CORE_SUPPORT_AGENTS, whatsappChatLink } from "@/lib/supportContacts";

/** /support — Figma "Support Expanded": FAQ accordion + Quick Help. */
const FAQ = [
  {
    question: "How do I connect to the internet?",
    answer:
      "Select your property, choose your hostel and plan, then pay. Your access code appears on screen straight away, is emailed to you, and is saved in your account. Enter it on the hostel Wi-Fi login page to connect your device.",
  },
  {
    question: "How do I renew my plan?",
    answer:
      "Go to your hostel and select the plan you want to renew. Choose your preferred duration and complete the payment to continue your internet access.",
  },
  {
    question: "What if my access code doesn't work?",
    answer:
      "If your access code isn't working, please contact Lodge Internet support on WhatsApp. Our support team will help you resolve the issue.",
  },
  {
    question: "How do I change my plan?",
    answer:
      "You can select a different available plan when your current plan expires. If you need help changing your plan, contact Lodge Internet support on WhatsApp.",
  },
  {
    question: "Where can I find codes I bought earlier?",
    answer:
      "Sign in and open Account. Your recent codes and every purchase are listed there — you can show a code again or have it re-sent to your email.",
  },
  {
    question: "How does TV Unlimited work?",
    answer:
      "TV plans are linked to your TV's MAC address. The first time you buy, we ask for it; you can update it any time from Account. Your subscription runs for the plan's duration from activation.",
  },
];

export default function SupportPage() {
  return (
    <Container>
      <PageHeader title="Support" subtitle="Need help? Find an answer below or contact our support team." />

      <h2 className="ui-eyebrow mb-3 px-1 text-ink-2">Frequently asked questions</h2>
      <Accordion items={FAQ} />

      <div className="mt-10">
        <WhatsAppCard
          title="Quick Help"
          message="Still need help? Our support team is available on WhatsApp."
          prefill="Hi Lodge Internet, I need help"
        />
      </div>

      <GroupedList header="Talk to a person" className="mt-10">
        {CORE_SUPPORT_AGENTS.map((agent) => (
          <a
            key={agent.phone}
            href={whatsappChatLink(agent.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex min-h-[60px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-ink/[0.03]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wa/10 text-wa-ink">
              <WhatsAppIcon className="h-5 w-5" />
            </span>
            <span className="flex-1 text-[17px] font-medium text-ink">Chat with {agent.name}</span>
            <ArrowUpRight className="h-[18px] w-[18px] text-ink-3" />
          </a>
        ))}
      </GroupedList>
    </Container>
  );
}

