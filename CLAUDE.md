# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- template-only -->
## This folder is a template

It is the source new applications are created from, not an application: `node scripts/create-app.mjs <target> --db <mongo|postgres|mysql|mssql|sqlite>` copies it, keeps one database provider, renames it and writes its `.env` and `docker-compose.yml`.

- It carries **both** providers (`src/repositories/mongo`, `src/repositories/sql`) and picks one at run time from `DB_CLIENT`, so the same test suite can be run on each: `npm test` (SQLite), `TEST_DB_CLIENT=mongo npm test`, and `TEST_DB_CLIENT=pg|mysql|mssql TEST_DATABASE_URL=... npm test` against a server (`docker/compose.<db>.yml` starts one; the `mysql2` / `tedious` drivers are not template dependencies - install them without saving). A change to a repository, a migration or `tests/data.test.js` must pass on every provider.
- Verified so far by running the whole suite: SQLite, PostgreSQL 18, MongoDB 8 (and the companion React template's Playwright suite against the API on SQLite and MongoDB). **Not yet run:** SQL Server, MySQL, the Dockerfile, the Compose files, the S3 storage provider - Docker could not start on the machine at the time. Run them before relying on them, and update this line and the README's.
- `express-api-template` is the name token: `create-app` replaces it in every text file. Do not spell the project's name any other way.
- Sections between `template-only` HTML comments in `README.md` and here are cut from a created project.
- `docker/compose.<db>.yml` are written as they will sit at a project's root (`build: .`); from here run them with `docker compose -f docker/compose.postgres.yml --project-directory . up`.
- After changing `create-app.mjs` or `new-feature.mjs`, create a project into a scratch folder for each provider and run its `npm run lint` and `npm test`.
<!-- /template-only -->

## Commands

- `npm run dev` - the API on `http://localhost:5000`, restarting on change (`node --watch`). `npm start` runs it once.
- `npm test` - Vitest driving the real app in-process (supertest) against a real database that needs nothing installed: SQLite in memory for the SQL provider, `mongodb-memory-server` for MongoDB. `npx vitest run tests/items.test.js` runs one file. `TEST_DATABASE_URL` (database name must end in `_test`), with `TEST_DB_CLIENT`, points the suite at a real server instead.
- `npm run lint` - ESLint, flat config.
- `npm run new:feature -- <Name> [--plural <Names>]` - scaffolds a feature and registers it (see "Adding a feature").
- SQL provider only: `npm run migrate`, `npm run migrate:make -- <name>`, `npm run migrate:rollback` (knex CLI through `knexfile.js`; migrations live in `src/repositories/sql/migrations`, new ones start from `migration.stub.js`).
- `docker compose up -d db` - the development database; `docker compose up --build` - database plus the API on `5000`.

Configuration is read once, in `src/config/env.js`, from `.env` (gitignored; `.env.example` is the template) or the real environment, which wins. Nothing else touches `process.env`. `.env` is not read under test. There is no fallback for `JWT_SECRET`: the app refuses to start without it.

## Architecture

**Routes -> Controllers -> Services -> `unitOfWork`/repositories -> database**, in plain ESM JavaScript on Express 5 (a rejected async handler reaches the error handler by itself - no wrapper needed).

**The envelope.** Every service function returns `{ success, message, data, code, args }` built with `ok()` / `fail()` (`src/models/common/apiResponse.js`), and every controller action is one line: `respond(res, await service.x(...))`. Expected business failures return `fail(ErrorCodes.X, "English message")` - they never throw. `httpStatus(code)` in `errorCodes.js` is the only place a failure becomes a status code: anything ending in `.not_found` is 404, the listed codes are 401/403/..., everything else 400. Unhandled errors reach `middlewares/errorHandler.js` and become a 500 envelope that never carries the error's message (it has a correlation id; the message is in the log).

**`ErrorCodes` is the contract with the frontend**, which translates `errors:<code>` and interpolates `args`. Keep the strings stable; a new failure is a new constant plus two locale lines on the client.

**Validation** is zod schemas in `src/models/dtos/`, applied by `validate({ body, query })` in the route. Failures are the same envelope (`validation.fields`, names in `args.fields`). `req.body` is replaced by the parsed value - unknown keys are dropped, which is what stops mass assignment - and the parsed query is on `req.validatedQuery` (Express 5 makes `req.query` read-only).

**Authorization is two-level.** `authenticate` + `authorize(...roles)` in `src/routes/index.js` say who may call a route. Which *rows* a caller sees or changes is decided in the service from `(callerId, callerRole)` - see `itemService.visibleTo`. A user has exactly one role (`src/enums/index.js`). There is no self-registration: accounts are created only through the Admin-only `POST users`.

**Auth.** JWT (HS256) carrying the role and the account's `securityStamp`. `authenticate` re-reads the account on every request, so a suspended or deleted user, a changed role or a new password ends existing tokens immediately. Failed sign-ins are counted and lock the account (`env.lockout`). Passwords are hashed with Node's scrypt (`utils/password.js`; the parameters are stored in the hash). The anonymous password-reset endpoints answer identically whether or not the account exists, never return the token (only its SHA-256 is stored), and are rate-limited.

**The data layer.** Services import `unitOfWork` from `src/repositories/index.js` and never see the database library. `unitOfWork.repository("name")` returns a generic repository (`getById`, `find`, `firstOrDefault`, `count`, `page`, `add`, `update`, `remove`) for any entity registered in the provider's `entities.js`; `users` and `items` have repositories of their own because they need queries the generic one cannot express - add another only for that reason. `remove` is a soft delete and every read leaves deleted rows out. `unitOfWork.transaction(fn)` makes the repository calls inside it atomic; repositories join it by themselves through `AsyncLocalStorage`. Entities are plain objects with camelCase fields, a string UUID `id`, real `Date`s and booleans, identical on every database.

- SQL provider (knex; PostgreSQL, MySQL, SQL Server, SQLite from one code path): columns are snake_case in the database and camelCase in code - the mapping is two hooks in `sql/knex.js`, so migrations and queries write camelCase. Avoid `.returning()` and database-specific types; ids are 36-character strings on purpose. Dialect differences are confined to `buildKnexConfig`, `GenericRepository.toEntity` and `ensureDatabase`.
- MongoDB provider (mongoose): `_id` is the UUID string, exposed as `id`; schemas use `entitySchema()` from `models/base.js`. Transactions need a replica set - on a standalone server `transaction()` runs the function without one and warns once.

**Seed data** (`src/data/seeder.js`) is written through the repositories, with fixed ids, and only when the admin seed id has never existed. It runs in development; in production `server.js` instead runs `seedAccountGuard.js`, which closes any account still holding the seed password and requires `BOOTSTRAP_ADMIN_PASSWORD` when no active administrator exists (`KEEP_DEMO_LOGINS=true` opts a demo stack out).

**File storage** is provider-swappable: `storage` from `services/storage/index.js` is whichever `STORAGE_PROVIDER` selects (`local` under `uploads/`, served at `/uploads`; `s3` lazily imports `@aws-sdk/client-s3`, which is not a dependency). `localStorage` is used directly only for avatars. Uploads arrive in memory through multer and are identified by their bytes (`services/common/fileSniffer.js`), never by name or content type. Stored URLs of local files are root-relative.

**Items and Dashboard are the example slice** - the pattern to copy and then delete. The API contract mirrors the mock API of the companion React template (`auth/login-email`, `users/me`, `users`, `items`, `dashboard/summary`); route matching is case-insensitive, so the client's `Users/me` works.

## Adding a feature

`npm run new:feature -- Product` writes `models/dtos/products.dto.js`, `services/products/productService.js`, a controller, `routes/products.routes.js`, `tests/products.test.js` and the entity (a migration and/or a mongoose model), and inserts the router, the entity registration and the `product.not_found` code at the `[new-feature:...]` marker comments (`routes/index.js`, `errorCodes.js`, the provider's `entities.js`) - leave those markers in place. Done by hand, those are the same registrations a feature needs.

## Conventions

- Lists that can grow are paged: the filter schema spreads `paginationQuery` and the service calls `repository.page()`.
- Enum values travel and are stored as their names.
- A partial update treats absent, null and blank as "not sent" unless the service says the field can be cleared.
- Tests share one app and one database for the whole run (`vitest.config.js`: one worker, `isolate: false`); `tests/helpers/api.js` connects, migrates and seeds once. Assert with `shouldSucceed()` / `shouldFail(result, status, code)`. A test that suspends, locks, deletes or counts for an account creates its own with `createTestUser()` instead of touching a seeded one.
- Comments explain why a rule exists, not what the line does.
