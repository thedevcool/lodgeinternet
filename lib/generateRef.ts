/**
 * Generates a payment reference in the format:
 * HOSTEL-PLANTYPE-YYYYMMDD-XXXXXX
 *
 * Examples:
 *   AYONI-DEVICE-20260309-K3M7PQ
 *   BLOCKC-TV-20260309-A1B2C3
 *   AYONI-DAILY-20260309-ZX99WR
 */
export function generatePaymentRef(
  hostel: string,
  planType: string,
  date?: Date,
): string {
  // Sanitise hostel: uppercase, spaces → hyphens, strip non-alphanumeric/hyphen
  const hostelPart = (hostel || "UNKNOWN")
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "");

  // Normalise plan type label
  const planLabel =
    planType === "unlimited"
      ? "UNLIM"
      : planType === "tv"
        ? "TV"
        : "DEVICE";

  // Date part: YYYYMMDD
  const d = date ?? new Date();
  const datePart =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");

  // 6-character uppercase alphanumeric random suffix
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let rand = "";
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${hostelPart}-${planLabel}-${datePart}-${rand}`;
}
