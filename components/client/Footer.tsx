import Link from "next/link";
import { BrandGlyph } from "@/components/ui/BrandMark";
import { telegramBotUrl } from "@/lib/telegram";
import { whatsappBotUrl } from "@/lib/whatsapp";
import { LEGAL_LINKS } from "@/lib/legal";
import ThemeToggle from "./ThemeToggle";

/**
 * Figma footer columns — only links to pages that exist. The Legal column's
 * pages are served by the backend (backend/app/legal, /legal/<slug>).
 */
export default function Footer() {
  const wa = whatsappBotUrl("Hi Lodge Internet");
  const tg = telegramBotUrl("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-hairline">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-6 lg:px-8">
        {/* Two columns wide: the appearance toggle needs the room. */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <BrandGlyph className="h-7 w-7" />
            <span className="ui-headline text-ink">Lodge Internet</span>
          </div>
          <p className="ui-footnote mt-3 text-ink-2">
            © {year} Lodge Internet. All rights reserved.
            <br />A product of Davo-Nexus Limited.
          </p>
          <p className="ui-footnote mt-5 font-semibold text-ink">Appearance</p>
          <ThemeToggle withLabels className="mt-2 w-full max-w-[272px]" />
        </div>

        <FooterColumn title="Explore">
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/hostels">Hostels</FooterLink>
        </FooterColumn>

        <FooterColumn title="Support">
          <FooterLink href="/support">FAQ</FooterLink>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="ui-subhead text-ink-2 hover:text-ink">
              WhatsApp
            </a>
          )}
          {tg && (
            <a href={tg} target="_blank" rel="noopener noreferrer" className="ui-subhead text-ink-2 hover:text-ink">
              Telegram
            </a>
          )}
        </FooterColumn>

        <FooterColumn title="Account">
          <FooterLink href="/login">Sign in</FooterLink>
          <FooterLink href="/register">Create account</FooterLink>
        </FooterColumn>

        <FooterColumn title="Legal">
          {LEGAL_LINKS.map((link) => (
            <FooterLink key={link.slug} href={`/legal/${link.slug}`}>
              {link.title}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="ui-footnote font-semibold text-ink">{title}</p>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ui-subhead text-ink-2 hover:text-ink">
      {children}
    </Link>
  );
}
