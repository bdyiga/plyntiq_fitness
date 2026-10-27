# ADR 0003: Password hashing and the Workers CPU budget

**Status:** accepted (2026-10-26). Revisit before the public beta.

## Context
Better Auth hashes passwords with scrypt (N=16384, r=16, p=1), implemented in pure JS (`@noble/hashes`). That costs tens to hundreds of milliseconds of CPU per sign-up or sign-in. The Workers Free plan allows 10 ms of CPU per request; the Paid plan allows 30 s by default.

## Options
1. Use the default hashing and deploy on Workers Paid (about $5/month).
2. Override `password.hash/verify` with `node:crypto` scrypt (a native implementation under `nodejs_compat`) using the same parameters and the same `salt:key` format.
3. Weaken the parameters. **Rejected.**

## Decision
Option 1 for now. It avoids custom crypto code, and the cost is small. Option 2 is a possible optimization **after** a benchmark in production-like conditions. It is not custom cryptography (same KDF, platform implementation), but it should be covered by compatibility tests before it ships.
