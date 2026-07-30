## 2024-05-30 - [Missing Rate Limit on Setup]
**Vulnerability:** The `/setup` endpoint in `backend/routers/auth.py`, used to create the first admin user, was publicly accessible without rate limiting.
**Learning:** Even one-time use initialization endpoints that check for existing setup completion (`if existing_user: raise HTTPException`) are vulnerable to brute-force or DoS attacks during the initial setup window if unconstrained.
**Prevention:** Ensure all public-facing endpoints, including initial setup routes, use `@limiter.limit` and explicitly require the `request: Request` parameter for slowapi to function.

## 2024-05-30 - [Weak PRNG for Identifiers]
**Vulnerability:** Weak PRNG (`Math.random()`) used for generating unique Toast IDs in the frontend.
**Learning:** Using `Math.random` combined with string truncation (`substr(2, 9)`) for ID generation is prone to collisions and is not cryptographically secure, even for UI components.
**Prevention:** Always use `crypto.randomUUID()` to guarantee uniqueness and strong entropy when generating client-side unique identifiers.
