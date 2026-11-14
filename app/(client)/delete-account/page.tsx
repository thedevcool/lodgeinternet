"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { useCustomer } from "@/components/client/CustomerProvider";
import Button, { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { ListSkeleton } from "@/components/ui/States";

/**
 * /delete-account — delete a Lodge Internet account from the web.
 *
 * Public, because Google Play requires an app that creates accounts to give a
 * web address where a person can ask for their account to be deleted without
 * the app. Signed in, it opens the same "Delete my account" sheet as Settings
 * and the app (POST /api/account/delete); signed out, it asks them to sign in
 * first, since the request has to come from the account's owner.
 */
export default function DeleteAccountPage() {
  const { user, ready } = useCustomer();
  const [open, setOpen] = useState(false);

  return (
    <Container>
      <PageHeader title="Delete your account" />
      <div className="space-y-4 pb-10">
        <Card>
          <div className="space-y-3">
            <p className="ui-body text-ink">
              Deleting your Lodge Internet account closes it straight away, on the website, the app and the
              WhatsApp and Telegram bot.
            </p>
            <ul className="ui-subhead list-disc space-y-1.5 pl-5 text-ink-2">
              <li>Your name, email, phone number and hostel are erased within 30 days.</li>
              <li>If your wallet has money in it, our team refunds it to you before the account is erased.</li>
              <li>
                Records of past payments that the law requires us to keep are kept without your name. The{" "}
                <a className="font-semibold text-accent-ink" href="/legal/data-deletion">data deletion policy</a>{" "}
                explains what is kept and for how long.
              </li>
            </ul>
          </div>
        </Card>

        {!ready ? (
          <ListSkeleton rows={1} />
        ) : user ? (
          <Button variant="destructive" full onClick={() => setOpen(true)}>
            <Trash2 className="h-[18px] w-[18px]" /> Delete my account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="ui-subhead text-ink-2">
              Sign in to the account you want to delete. You&apos;ll confirm with your password.
            </p>
            <ButtonLink href="/login?redirect=/delete-account" full>
              Sign in to continue
            </ButtonLink>
            <p className="ui-footnote text-ink-3">
              Forgotten your password? <a className="font-semibold text-accent-ink" href="/forgot-password">Reset it</a>{" "}
              first, or contact <a className="font-semibold text-accent-ink" href="/support">Lodge support</a>.
            </p>
          </div>
        )}
      </div>
      <DeleteAccountSheet open={open} onClose={() => setOpen(false)} />
    </Container>
  );
}
