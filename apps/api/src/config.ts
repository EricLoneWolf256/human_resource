import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const corsOriginSchema = z.string().min(1).superRefine((value, ctx) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'CORS_ORIGIN must contain at least one origin' });
    return;
  }
  if (origins.some((origin) => origin === '*')) {
    ctx.addIssue({ code: 'custom', message: 'CORS_ORIGIN cannot be a wildcard' });
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        ctx.addIssue({ code: 'custom', message: `CORS_ORIGIN entry must be an origin only: ${origin}` });
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: `CORS_ORIGIN entry is not a valid URL: ${origin}` });
    }
  }
});

const schema = z
  .object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: corsOriginSchema.default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),
    STORAGE_DIR: z.string().min(1).default('./storage/private'),
    DEMO_SEED_PASSWORD: z.string().min(1).default('Demo#Pass123'),
    ALLOW_DEMO_SEED: z
      .enum(['true', 'false'])
      .default(process.env.NODE_ENV === 'production' ? 'false' : 'true'),
    REQUIRE_MFA_FOR_PRIVILEGED: z
      .enum(['true', 'false'])
      .default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
    TRUST_PROXY: z.enum(['false', 'true', 'loopback']).default('false'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;

    if (!process.env.CORS_ORIGIN) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'CORS_ORIGIN must be explicitly set in production' });
    }
    const insecureOrigins = data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => {
        try {
          const parsed = new URL(origin);
          return parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
        } catch {
          return true;
        }
      });
    if (insecureOrigins.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'Production CORS origins must use HTTPS' });
    }
    if (
      data.JWT_SECRET.startsWith('replace-') ||
      data.JWT_SECRET === 'test-only-secret-with-at-least-32-characters'
    ) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET must be replaced before production use' });
    }
    if (data.ALLOW_DEMO_SEED === 'true') {
      ctx.addIssue({ code: 'custom', path: ['ALLOW_DEMO_SEED'], message: 'Demo seeding must be disabled in production' });
    }
    if (data.REQUIRE_MFA_FOR_PRIVILEGED !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['REQUIRE_MFA_FOR_PRIVILEGED'],
        message: 'MFA must be enforced for privileged accounts in production',
      });
    }
    if (data.DEMO_SEED_PASSWORD === 'Demo' || data.DEMO_SEED_PASSWORD === 'Demo#Pass123') {
      ctx.addIssue({
        code: 'custom',
        path: ['DEMO_SEED_PASSWORD'],
        message: 'DEMO_SEED_PASSWORD must be replaced before production use',
      });
    }
    if (!process.env.TRUST_PROXY) {
      ctx.addIssue({ code: 'custom', path: ['TRUST_PROXY'], message: 'TRUST_PROXY must be explicitly set in production' });
    }
    if (data.TRUST_PROXY !== 'loopback') {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'TRUST_PROXY must be loopback in production behind a trusted reverse proxy',
      });
    }
  });

export const config = schema.parse(process.env);
