import crypto from "crypto";

const getEncryptionKey = () => {
  const secret = process.env.DATA_CODE_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Missing DATA_CODE_SECRET_KEY. Add a strong secret to your environment variables.",
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
};

export const normalizeCode = (code: string) => code.trim();

export const hashCode = (code: string) => {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
};

export const maskCode = (code: string) => {
  const normalized = normalizeCode(code);
  const last4 = normalized.slice(-4);
  return `****${last4}`;
};

export const encryptCode = (code: string) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizeCode(code), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString(
    "base64",
  )}`;
};

export const decryptCode = (encryptedPayload: string) => {
  const key = getEncryptionKey();
  const [ivB64, tagB64, dataB64] = encryptedPayload.split(".");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted code payload");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};
