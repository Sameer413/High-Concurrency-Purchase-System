## Authentication & Token Flow

This document describes how authentication works in this project, including token flow, secret management, and cookies.

### Overview

- **Auth module**: The core logic is implemented in `AuthService` and exposed via `AuthController` (`/auth` routes).
- **Strategies & guards**: JWT strategies plus `JwtAuthGuard` protect non‑public routes.
- **Middleware**: `AuthInjectMiddleware` pre‑parses the access token and attaches the payload to `req.user`.
- **Config**: All secrets and expirations are read from the centralized `configuration` function, which maps environment variables.

### Request Flow

- **Registration**
  - **Endpoint**: `POST /auth/register`
  - **Body**: `RegisterDto` (email, firstName, lastName, password)
  - **Behavior**: Delegates to `UsersService.create`, which persists the user (password is hashed in the user layer).
  - **Auth**: Marked as `@Public()` – no authentication required.

- **Login**
  - **Endpoint**: `POST /auth/login`
  - **Body**: `LoginDto` (email, password)
  - **Steps**:
    1. `AuthService.validateCredentials` loads the user by email and compares the supplied password with the stored hash using `bcrypt.compare`.
    2. On success, `AuthService.login`:
       - Generates an **access token** and **refresh token** via `generateTokens`.
       - Persists the new refresh token with `UsersService.updateRefreshToken`.
       - Sets both tokens in **HTTP‑only cookies**.
    3. Returns a response body containing:
       - `accessToken`
       - `expiresIn` (seconds)
       - `tokenType: "Bearer"`.
  - **Auth**: `@Public()` – credentials are supplied in the request body.

- **Refresh**
  - **Endpoint**: `POST /auth/refresh`
  - **Guard**: `JwtRefreshAuthGuard` (reads and validates the refresh token).
  - **Behavior**:
    - Receives the currently authenticated `User` via `@CurrentUser`.
    - Calls `AuthService.refresh`, which:
      - Generates a new access/refresh token pair.
      - Rotates the stored refresh token in the database.
      - Updates the `access_token` and `refresh_token` cookies.
    - Returns a body similar to login (access token, expiresIn, tokenType).

- **Logout**
  - **Endpoint**: `POST /auth/logout`
  - **Auth**: Protected (requires a valid access token via `@CurrentUser`).
  - **Behavior**:
    - `AuthService.logout` clears the stored refresh token via `UsersService.updateRefreshToken(userId, null)`.
    - Clears both `access_token` and `refresh_token` cookies on the client.

- **Current user**
  - **Endpoint**: `GET /auth/me`
  - **Auth**: Protected by `JwtAuthGuard`.
  - **Behavior**: Returns the authenticated `User` injected by middleware/guard.

### Token Generation & Secrets

- **Token payload**
  - `AuthService.generateTokens` signs a common payload:
    - `sub`: user ID
    - `email`
    - `roles`

- **Access token**
  - Signed by `JwtService.signAsync` with:
    - **Secret**: `config.jwt.accessSecret`
    - **Expiration**: `config.jwt.accessExpiration` (default `'15m'`).

- **Refresh token**
  - Signed by `JwtService.signAsync` with:
    - **Secret**: `config.jwt.refreshSecret`
    - **Expiration**: `config.jwt.refreshExpiration` (default `'7d'`).

- **Secret configuration**
  - Defined in `configuration.ts`:
    - `jwt.accessSecret` ← `process.env.JWT_ACCESS_SECRET` (fallback: `'fallback-access-secret'`)
    - `jwt.accessExpiration` ← `process.env.JWT_ACCESS_EXPIRATION` (fallback: `'15m'`)
    - `jwt.refreshSecret` ← `process.env.JWT_REFRESH_SECRET` (fallback: `'fallback-refresh-secret'`)
    - `jwt.refreshExpiration` ← `process.env.JWT_REFRESH_EXPIRATION` (fallback: `'7d'`)

- **Important**
  - **Never** rely on fallback secrets in production. Always define strong, random values for:
    - `JWT_ACCESS_SECRET`
    - `JWT_REFRESH_SECRET`
  - Rotate secrets carefully; when rotating refresh secrets, plan for existing tokens to be invalidated or temporarily supported.

### Cookies & Session Behavior

- **Cookie names**
  - `access_token` – short‑lived JWT for standard authorization.
  - `refresh_token` – longer‑lived JWT used only to obtain new access tokens.

- **Base cookie options** (`COOKIE_OPTS_BASE`):
  - `httpOnly: true`
  - `path: '/'`

- **Dynamic cookie options**
  - `secure`:
    - Comes from `config.cookie.secure` ← `process.env.COOKIE_SECURE === "true"`.
    - Should be `true` in production behind HTTPS.
  - `sameSite`:
    - Comes from `config.cookie.sameSite` ← `process.env.COOKIE_SAME_SITE` (`'lax' | 'strict' | 'none'`, default `'lax'`).
  - `maxAge`:
    - `access_token`: derived from `jwt.accessExpiration`.
    - `refresh_token`: derived from `jwt.refreshExpiration`.
    - The `AuthService` converts strings like `'15m'`, `'7d'`, `'1h'` into milliseconds via `parseExpirationToMs`.

- **Clearing cookies**
  - `AuthService.clearCookies` calls:
    - `res.clearCookie('access_token', { path: '/' })`
    - `res.clearCookie('refresh_token', { path: '/' })`

### Middleware & Guards

- **AuthInjectMiddleware**
  - Runs for incoming requests and attempts to read the access token from:
    - `Authorization: Bearer <token>` header, or
    - `access_token` cookie.
  - If a token is present:
    - Verifies it using `jwt.accessSecret`.
    - On success, attaches the decoded payload to `req.user`.
  - On failure:
    - Silently ignores invalid tokens so that public routes still work.
    - Guards decide whether a request must be rejected.

- **JwtAuthGuard**
  - Extends `AuthGuard('jwt')`.
  - Respects the `@Public()` decorator:
    - If a route/class is marked `@Public()`, `canActivate` returns `true` immediately.
  - On protected routes:
    - Ensures a valid access token is present.
    - Throws `UnauthorizedException('Access token is invalid or expired')` if validation fails.

### Environment Variables Summary

- **App / environment**
  - `APP_PORT` – application port (default `3000`).
  - `NODE_ENV` – environment (`development`, `production`, etc.).

- **Database**
  - `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`.

- **JWT**
  - `JWT_ACCESS_SECRET` – secret key for access tokens (**required in production**).
  - `JWT_ACCESS_EXPIRATION` – access token TTL (e.g. `15m`, `1h`).
  - `JWT_REFRESH_SECRET` – secret key for refresh tokens (**required in production**).
  - `JWT_REFRESH_EXPIRATION` – refresh token TTL (e.g. `7d`).

- **Cookies**
  - `COOKIE_SECRET` – cookie signing/related secret (do not use the fallback in production).
  - `COOKIE_SECURE` – `"true"` to enable `secure` cookies.
  - `COOKIE_SAME_SITE` – `"lax" | "strict" | "none"`.

### Operational Notes

- In **development**, you can rely on the default/fallback values, but you should still prefer a local `.env` file with explicit secrets.
- In **production**, configure all JWT and cookie variables with strong, random values and enforce HTTPS (`COOKIE_SECURE=true`).
- When debugging auth issues, check:
  - Whether cookies are being set with the expected `secure`/`sameSite` flags.
  - The actual values of `JWT_ACCESS_EXPIRATION` and `JWT_REFRESH_EXPIRATION`.
  - That middleware is running and `req.user` is populated on protected routes.

