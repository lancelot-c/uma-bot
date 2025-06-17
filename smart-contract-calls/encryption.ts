import crypto from "node:crypto"

const algorithm = "aes-256-cbc"
const secretKey = process.env.ENCRYPTION_KEY

if (!secretKey) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
}

const key = crypto
  .createHash("sha512")
  .update(secretKey)
  .digest("hex")
  .substring(0, 32)

const iv = crypto.randomBytes(16)

export function encrypt(data: string): string {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
  let encrypted = cipher.update(data, "utf-8", "hex")
  encrypted += cipher.final("hex")

  // Package the IV and encrypted data together so it can be stored in a single
  // column in the database.
  return iv.toString("hex") + encrypted
}

export function decrypt(data: string): string {
  // Unpackage the combined iv + encrypted message. Since we are using a fixed
  // size IV, we can hard code the slice length.
  const inputIV = data.slice(0, 32)
  const encrypted = data.slice(32)
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(key),
    Buffer.from(inputIV, "hex"),
  )

  let decrypted = decipher.update(encrypted, "hex", "utf-8")
  decrypted += decipher.final("utf-8")
  return decrypted
}