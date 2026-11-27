import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'UMU HR System';

function encodeBase32(buffer: Buffer): string {
  let value = 0n;
  let bits = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8n) | BigInt(byte);
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[Number((value >> BigInt(bits - 5)) & 31n)];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[Number((value << BigInt(5 - bits)) & 31n)];
  return output;
}

function decodeBase32(secret: string): Buffer | null {
  const clean = secret.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let value = 0n;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    value = (value << 5n) | BigInt(ALPHABET.indexOf(character));
    bits += 5;
    if (bits >= 8) {
      bytes.push(Number((value >> BigInt(bits - 8)) & 255n));
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function generateTotpCode(secret: string): string {
  const key = decodeBase32(secret);
  if (!key) throw new Error('Invalid TOTP secret');
  return totpCode(key, Math.floor(Date.now() / 30_000));
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = decodeBase32(secret);
  if (!key) return false;
  const counter = Math.floor(Date.now() / 30_000);
  const candidate = Buffer.from(code);
  for (let delta = -window; delta <= window; delta += 1) {
    if (timingSafeEqual(Buffer.from(totpCode(key, counter + delta)), candidate)) return true;
  }
  return false;
}

export function buildOtpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(9).toString('base64url').toUpperCase());
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`${code}:${config.JWT_SECRET}`).digest('hex');
}
