import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secretKey = new TextEncoder().encode(config.JWT_SECRET);
const ISSUER = 'umu-hr-api';
const AUDIENCE = 'umu-hr-web';

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL)
    .sign(secretKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export interface MfaChallenge {
  userId: string;
  loginMarker: string;
}

export async function signMfaChallengeToken(userId: string, loginMarker: string): Promise<string> {
  return new SignJWT({ purpose: 'mfa', loginMarker })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secretKey);
}

export async function verifyMfaChallengeToken(token: string): Promise<MfaChallenge | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || payload.purpose !== 'mfa' || typeof payload.loginMarker !== 'string') return null;
    return { userId: payload.sub, loginMarker: payload.loginMarker };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
