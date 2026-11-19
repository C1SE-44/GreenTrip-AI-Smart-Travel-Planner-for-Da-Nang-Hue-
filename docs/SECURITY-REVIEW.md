# GreenTrip Sprint 1 Security Review

- **Review date:** 2026-10-14
- **Scope:** Read-only review of the repository state on `main` at `d562d54`. The deployed Vercel site was not actively tested.
- **Approach:** Static review of application code and tracked configuration. This is not a penetration test or a confirmation of Vercel, database, or other provider settings.

## Findings

| # | Severity | Location | Finding | Confidence |
|---|---|---|---|---:|
| 1 | MEDIUM | [`backend/app/main.py`](./backend/app/main.py), lines 24–30 | CORS allows every origin, method, and header while credentials are enabled. Restrict allowed origins to the production frontend and allow only required methods and headers. The reviewed frontend uses bearer tokens in browser storage; exploitability against authenticated data was not established in this static review. | 8/10 |
| 2 | MEDIUM | Authentication routes (reviewed application code) | No login rate limiting/throttling was found. Add limits at the application or trusted edge and alert on abnormal login activity. | 7/10 |

## Controls observed in code

- Passwords are hashed and verified using `pwdlib.PasswordHash.recommended()` in `backend/app/auth/password.py`.
- Reviewed authentication and POI SQL queries use parameters for values.
- Access tokens have a configurable expiry (30 minutes by default); OTP session tokens expire after 10 minutes. OTP verification limits attempts and resend requests have a cooldown.
- The reviewed API has no upload endpoints or admin-only routes.
- Authentication errors returned by the API are generally generic.
- No `.env` file is tracked in Git. `.env.example` contains placeholders, not runtime credentials.

## Not applicable or not verifiable from this repository

- **Cookies:** The current frontend stores bearer tokens in `localStorage`/`sessionStorage`, rather than authentication cookies. Cookie `HttpOnly`, `Secure`, and `SameSite` flags therefore do not protect this token flow. Review XSS defenses; if authentication moves to cookies, set those flags appropriately.
- **Authorization/IDOR:** No admin-only routes or obvious user-addressed resource endpoints were found in the reviewed backend. No live authorization/IDOR testing was performed.
- **HTTPS, security headers, database network exposure and least-privilege roles, backups, Cloudflare, and production monitoring:** These depend on deployment/provider configuration not present in the tracked repository. Verify them in the relevant provider dashboards and alerting systems.
- **Secrets and production errors:** Runtime secret values and deployed error responses were not tested. Keep privileged keys server-side, configure deployment secrets outside source control, and avoid exposing stack traces or sensitive diagnostics to clients.

## Recommended follow-up

1. Restrict CORS to the exact production frontend origin(s), required methods, and required headers.
2. Add login rate limiting and alerts for unusual login volume and repeated API failures.
3. Verify production HTTPS redirects, security headers, and secret configuration in hosting/provider dashboards.
4. Confirm database private networking and least-privilege credentials; establish tested backups and resource/error monitoring.
5. Re-run the review with authenticated test accounts before expanding the API, especially when user-owned resources, admin endpoints, or file uploads are added.
