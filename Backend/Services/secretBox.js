const crypto = require("crypto");

// AES-256-GCM encryption for broker API credentials at rest.
// The key comes from BROKER_ENCRYPTION_KEY (any string; hashed to 32 bytes).
// There is deliberately no fallback key: without it, brokers stay disabled.

const isConfigured = () => Boolean(process.env.BROKER_ENCRYPTION_KEY);

const key = () => {
    if (!isConfigured()) throw new Error("BROKER_ENCRYPTION_KEY is not set");
    return crypto.createHash("sha256").update(process.env.BROKER_ENCRYPTION_KEY).digest();
};

function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(box) {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(box.iv, "base64"));
    decipher.setAuthTag(Buffer.from(box.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
}

// "abcd...wxyz" style hint so users can tell keys apart without exposing them.
const mask = (secret = "") => (secret.length <= 8 ? "••••" : `${secret.slice(0, 4)}…${secret.slice(-4)}`);

module.exports = { isConfigured, seal, open, mask };
