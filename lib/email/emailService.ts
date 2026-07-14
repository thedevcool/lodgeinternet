import nodemailer from "nodemailer";

// Create reusable transporter object using SMTP transport
let transporter: nodemailer.Transporter | null = null;

/**
 * Initialize the email transporter with Gmail SMTP.
 * Uses explicit SMTP settings (port 465 / SSL) for maximum reliability.
 * Requires EMAIL_FROM and EMAIL_APP_PASSWORD in your environment variables.
 *
 * Gmail setup:
 *  1. Enable 2-Step Verification on your Google account.
 *  2. Go to Google Account → Security → App passwords.
 *  3. Generate an App Password for "Mail" and paste it as EMAIL_APP_PASSWORD.
 */
export function initializeEmailTransporter() {
  if (!transporter) {
    const emailUser = process.env.EMAIL_FROM;
    const emailPassword = process.env.EMAIL_APP_PASSWORD;

    if (!emailUser || !emailPassword) {
      console.error(
        "[Email] Credentials missing. Set EMAIL_FROM and EMAIL_APP_PASSWORD in your environment variables.",
      );
      return null;
    }

    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // SSL
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
      pool: true, // Keep SMTP connections alive for bulk sending
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000, // 1 second between messages
      rateLimit: 5, // max 5 messages per rateDelta
    });

    console.log("[Email] Transporter initialized for", emailUser);
  }

  return transporter;
}

/**
 * Get (or lazily create) the email transporter instance.
 */
export function getEmailTransporter() {
  if (!transporter) {
    return initializeEmailTransporter();
  }
  return transporter;
}

/**
 * Verify SMTP connection. Call this on server start-up to catch
 * configuration errors early.
 */
export async function verifyEmailConnection() {
  const t = getEmailTransporter();
  if (!t) return false;

  try {
    await t.verify();
    console.log("[Email] SMTP server is ready to send messages");
    return true;
  } catch (error) {
    console.error("[Email] SMTP verification failed:", error);
    return false;
  }
}

/**
 * Send a single email.
 *
 * @param options.to        Recipient address or array of addresses
 * @param options.subject   Email subject line
 * @param options.html      HTML body
 * @param options.text      Optional plain-text fallback
 * @param options.senderName Display name shown in the From field (default: "Lodge Internet")
 * @param options.retries   Number of retry attempts on transient failure (default: 2)
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
  retries?: number;
}) {
  const t = getEmailTransporter();
  if (!t) {
    throw new Error(
      "[Email] Transporter not initialised. Check EMAIL_FROM and EMAIL_APP_PASSWORD.",
    );
  }

  const from = process.env.EMAIL_FROM;
  const senderName = options.senderName || "Lodge Internet";
  const maxRetries = options.retries ?? 2;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const info = await t.sendMail({
        from: `"${senderName}" <${from}>`,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      console.log(
        `[Email] Sent "${options.subject}" → ${options.to} (id: ${info.messageId})`,
      );
      return { success: true, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = (attempt + 1) * 1500;
        console.warn(
          `[Email] Attempt ${attempt + 1} failed, retrying in ${delay}ms…`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error("[Email] All send attempts failed:", lastError);
  throw lastError;
}

/**
 * Send the same email to many recipients with batching and rate limiting.
 * Processes `batchSize` recipients at a time with a `delayMs` pause between
 * batches to avoid Gmail's sending limits.
 *
 * @returns Object with counts of successes and failures.
 */
export async function sendBulkEmail(options: {
  recipients: Array<{ email: string; name?: string }>;
  subject: string;
  getHtml: (recipient: { email: string; name?: string }) => string;
  getText?: (recipient: { email: string; name?: string }) => string;
  senderName?: string;
  batchSize?: number;
  delayMs?: number;
}) {
  const {
    recipients,
    subject,
    getHtml,
    getText,
    senderName,
    batchSize = 10,
    delayMs = 1500,
  } = options;

  let successCount = 0;
  let failureCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((recipient) =>
        sendEmail({
          to: recipient.email,
          subject,
          html: getHtml(recipient),
          text: getText ? getText(recipient) : undefined,
          senderName,
        }),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        successCount++;
      } else {
        failureCount++;
        errors.push(
          `${batch[j].email}: ${(results[j] as PromiseRejectedResult).reason?.message ?? "Unknown error"}`,
        );
      }
    }

    if (i + batchSize < recipients.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(
    `[Email] Bulk send complete — ${successCount} sent, ${failureCount} failed`,
  );
  return { successCount, failureCount, errors };
}
