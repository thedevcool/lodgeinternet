/**
 * Guards lib/localStorageCrypto.ts: the encryption that keeps a bought Wi-Fi
 * code unreadable in the browser's storage.
 *
 * A code is money: whoever reads it can use the plan. Codes are saved on the
 * buyer's device so the dashboard can show them again, and the key comes
 * from the buyer's user id, so a dump of the storage, or another account
 * signed in on the same browser, gets nothing.
 */
import { describe, expect, it } from "vitest";
import { decryptFromStorage, encryptForStorage } from "@/lib/localStorageCrypto";

const CODE = "LODGE-7H2K-99QX";
const BUYER = "user-chiamaka-01";
const SOMEONE_ELSE = "user-tunde-02";

describe("a code kept in the browser", () => {
  it("comes back unchanged for the customer who saved it", async () => {
    const stored = await encryptForStorage(CODE, BUYER);

    expect(await decryptFromStorage(stored, BUYER)).toBe(CODE);
  });

  it("is not readable in what gets stored", async () => {
    const stored = await encryptForStorage(CODE, BUYER);

    expect(stored).not.toContain(CODE);
    // Not merely base64 of the code either.
    expect(atob(stored)).not.toContain(CODE);
    expect(stored).not.toContain(BUYER);
  });

  it("cannot be read by another customer on the same browser", async () => {
    const stored = await encryptForStorage(CODE, BUYER);

    expect(await decryptFromStorage(stored, SOMEONE_ELSE)).toBeNull();
    expect(await decryptFromStorage(stored, "")).toBeNull();
  });

  it("is stored differently every time, so two saves of one code can't be matched", async () => {
    const first = await encryptForStorage(CODE, BUYER);
    const second = await encryptForStorage(CODE, BUYER);

    expect(first).not.toBe(second);
    expect(await decryptFromStorage(first, BUYER)).toBe(CODE);
    expect(await decryptFromStorage(second, BUYER)).toBe(CODE);
  });

  it("reads as nothing when the stored value was tampered with or is not ours", async () => {
    const stored = await encryptForStorage(CODE, BUYER);
    // Flip one character in the encrypted part (past the 12-byte IV).
    const at = stored.length - 6;
    const tampered = stored.slice(0, at) + (stored[at] === "A" ? "B" : "A") + stored.slice(at + 1);

    expect(await decryptFromStorage(tampered, BUYER)).toBeNull();
    expect(await decryptFromStorage("not base64 at all!", BUYER)).toBeNull();
    expect(await decryptFromStorage("", BUYER)).toBeNull();
    // A value saved before codes were encrypted: plain text is never trusted.
    expect(await decryptFromStorage(CODE, BUYER)).toBeNull();
  });

  it("keeps codes with characters outside plain English", async () => {
    const stored = await encryptForStorage("Ọlá-₦500-код", BUYER);

    expect(await decryptFromStorage(stored, BUYER)).toBe("Ọlá-₦500-код");
  });
});
