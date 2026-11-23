# Implementation Decisions

Date: 23 November 2026
Scope: Phase 1 implementation

## Architecture

- The application is a modular monolith: `packages/shared`, `apps/api`, and `apps/web` are npm workspaces.
- `packages/shared` owns enums, permissions, role definitions, Zod schemas, and DTO types so API and UI agree on contracts.
- The API uses Express 5, Prisma 6, MySQL 8.4, `jose` tokens, Zod validation, and central RBAC scope evaluation in `apps/api/src/access/policy.ts`.
- The web client uses React 19, React Router, TanStack Query, Tailwind 3, and webpack 5.

## Toolchain constraints

- Windows Application Control blocks `esbuild.exe` on the development machine, so Vite, tsx, Vitest, and esbuild were removed.
- API runtime and tests use Node 24 native TypeScript stripping. `apps/api/ts-loader.mjs` and `apps/api/ts-resolve.mjs` register a resolver for TypeScript files imported with relative `.js` specifiers.
- Unsupported TypeScript syntax is avoided in runtime code: no constructor parameter properties or namespaces in executed modules.
- Webpack uses pure JavaScript configuration (`webpack.config.mjs`) with `ts-loader`, Tailwind 3, PostCSS, and CSS Loader.
- API tests use `node:test` plus supertest. Test files import `test/setup.ts` first so `NODE_ENV=test` is set before configuration is loaded.
- `npm install --ignore-scripts` is used locally because install scripts can invoke blocked binaries. Prisma generation is run explicitly.

## Local infrastructure

- Docker Compose maps MySQL to host port `3307` because port `3306` was already used by another local project.
- The test database `hr_system_test` is created by `scripts/mysql-init/01-test-db.sql`.
- Prisma `migrate dev` requires shadow database creation rights; the local `hr_app` user was granted `CREATE` and `DROP` in the development container.
- `.env` and `.env.test` quote `DEMO_SEED_PASSWORD` because dotenv treats an unquoted `#` as the start of a comment.

## API corrections made during verification

- Route modules use paths relative to their mount points. Earlier duplicated prefixes made endpoints such as `/api/employees/employees` unreachable.
- `authenticate` is mounted globally under `/api`, except for `/auth/login`, `/auth/refresh`, `/auth/logout`, and the public `/api/health` route.
- Malformed JSON bodies return `400 VALIDATION_ERROR` instead of a generic `500`.
- `ApiError` uses explicitly assigned fields because Node's strip-only TypeScript mode does not support constructor parameter properties.
- Express module augmentation in `apps/api/src/auth/context.ts` is allowed by ESLint configuration; it is a type declaration only.

## Seed and test data

- `apps/api/prisma/seed.ts` is idempotent and creates permissions, roles, an org tree, positions, employees, effective assignments, users, and scoped role grants.
- Demo accounts use the synthetic password `Demo#Pass123`; they are for local demonstration only.
- The acceptance suite covers public health, unauthorized access, invalid and malformed login requests, audit events, role assignment and audit, HOD scope restriction, document upload/verification and magic-byte checks, duplicate staff numbers, effective-dated assignment history, and invalid status transitions.

## CI

- GitHub Actions uses Node 24, npm caching, MySQL 8.4, `npm ci --ignore-scripts`, explicit Prisma generation, and `migrate deploy` for both development and test databases.
- Lint, typecheck, build, and tests must pass before the workflow succeeds.
