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

// Normalize MAC address (remove colons, hyphens, convert to uppercase)
export const normalizeMacAddress = (mac: string): string => {
  return mac.replace(/[:-]/g, "").toUpperCase().trim();
};

// Hash MAC address for storage/comparison
export const hashMacAddress = (mac: string): string => {
  return crypto
    .createHash("sha256")
    .update(normalizeMacAddress(mac))
    .digest("hex");
};

// Encrypt MAC address for secure storage
export const encryptMacAddress = (mac: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizeMacAddress(mac), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
};

// Decrypt MAC address (admin only)
export const decryptMacAddress = (encryptedPayload: string): string => {
  const key = getEncryptionKey();
  const [ivB64, tagB64, dataB64] = encryptedPayload.split(".");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted MAC address payload");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return decrypted.toString("utf8");
};

// Format MAC address for display (XX:XX:XX:XX:XX:XX)
export const formatMacAddress = (mac: string): string => {
  const normalized = normalizeMacAddress(mac);
  return normalized.match(/.{1,2}/g)?.join(":") || normalized;
};
