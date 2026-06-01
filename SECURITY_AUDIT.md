# Treasure Chess — Security Audit Report

**Date:** 2026-05-29  
**Scope:** Full codebase — React Native/Expo frontend, Supabase Edge Functions (Deno), PostgreSQL migrations (RLS, stored procedures), blockchain integration (Base L2 / ethers.js v6)  
**Context:** The previous developer is considered untrustworthy. Code was already discovered in `utils/walletConnect.ts` that routed user USDC payments to an unauthorized wallet address `0xDE50B9A124269a06542bBc4e08De71a5e6cFa438`. That file has been deleted. This audit searches for any additional planted vulnerabilities.

---

## Summary Table

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 5 | Immediate exploitation risk; funds or keys at risk |
| HIGH | 6 | Serious security gaps; require prompt remediation |
| MEDIUM | 5 | Meaningful risk under certain conditions |
| LOW | 4 | Defense-in-depth improvements |
| INFORMATIONAL | 4 | Code quality / hardening notes |

---

## CRITICAL Findings

---

### CRIT-01: Planted Unauthorized Vault Address in `relay-transaction`

**File:** `supabase/functions/relay-transaction/index.ts`, line 274  
**Category:** Unauthorized Payment Routing (same pattern as the deleted `walletConnect.ts`)

**Description:**  
When the `payEntryFee` operation is performed (user pays entry fee to a house challenge), the function reads the vault address from an environment variable with a hardcoded fallback:

```typescript
const VAULT_ADDRESS = Deno.env.get("PLATFORM_VAULT_ADDRESS") || "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";
```

If the `PLATFORM_VAULT_ADDRESS` Supabase secret is not set, **all house challenge entry fee USDC transfers are routed to `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b`** — an address not belonging to the platform. This is structurally identical to the previously discovered `walletConnect.ts` attack: a plausible-looking fallback that silently drains funds if the legitimate env var is missing or unset.

**Impact:** Every house challenge entry fee (paid via the platform's gasless relay) goes to the attacker's wallet whenever `PLATFORM_VAULT_ADDRESS` is not configured in Supabase secrets. This could have been active for weeks or months of alpha testing.

**Remediation:**
1. Immediately verify whether `PLATFORM_VAULT_ADDRESS` is set in Supabase project secrets.
2. Replace the fallback with an explicit failure:
   ```typescript
   const VAULT_ADDRESS = Deno.env.get("PLATFORM_VAULT_ADDRESS");
   if (!VAULT_ADDRESS) throw new Error("PLATFORM_VAULT_ADDRESS not configured");
   ```
3. Investigate transaction history of `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b` on Base mainnet to determine if any funds were diverted.
4. Treat this address as belonging to the rogue developer and report accordingly.

---

### CRIT-02: JWT Forgery — `submit-game-result` Does Not Verify JWT Signature

**File:** `supabase/functions/submit-game-result/index.ts`, lines 97–112  
**Category:** Authentication Bypass / JWT Forgery

**Description:**  
The function grants `service_role` access to callers who present a JWT with `"role": "service_role"` in the payload. However, the JWT signature is **never verified** — the check is a raw base64 decode:

```typescript
const parts = token.split('.');
if (parts.length === 3) {
  const payload = JSON.parse(atob(parts[1]));
  if (payload.role === 'service_role') {
    isServiceRole = true;
  }
}
```

Any attacker can craft a JWT with an arbitrary payload (e.g., `{"role":"service_role"}`) — no valid signing key is required. Base64-encoding the forged payload and constructing a three-part token string is trivial.

**Impact:** An unauthenticated attacker can:
1. Call `submit-game-result` directly.
2. Supply any `gameId` pointing to a real game in the database.
3. Receive a valid backend-signed transaction submitted to the smart contract declaring any result they choose.
4. This releases escrow funds from the smart contract to the attacker's address.

The backend signer private key (`BACKEND_SIGNER_PRIVATE_KEY`) is the root of trust for escrow settlements. This vulnerability effectively nullifies it.

**Remediation:**  
Replace the manual JWT decode with a cryptographically verified call using Supabase's built-in auth:
```typescript
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// For service-role verification, compare the raw token to the service key, OR
// use a separate SETTLEMENT_API_KEY checked via header — do NOT trust unverified JWT payloads.
```
Remove the `atob(parts[1])` JWT decode path entirely. The direct token-equals-service-key check (`token === SUPABASE_SERVICE_KEY`) is the only safe path in the current code; keep that and remove the forged-JWT path.

---

### CRIT-03: Unauthenticated `deposit-monitor` Endpoint — Fake Deposits

**File:** `supabase/functions/deposit-monitor/index.ts`  
**Category:** Unauthenticated Critical Endpoint

**Description:**  
The `deposit-monitor` function has **no authentication whatsoever**. Any caller on the internet can POST a crafted deposit notification:

```json
{
  "txHash": "0xfakedeadbeef...",
  "fromAddress": "0xanyone",
  "toAddress": "0xvictim_wallet_in_db",
  "amount": "1000000000",
  "blockNumber": 1,
  "confirmations": 12
}
```

The function will:
1. Check that `toAddress` matches a profile's `embedded_wallet_address` in the database — this is only a lookup, not a security check.
2. Credit the profile's TCT balance via `record_vault_deposit()`.
3. The only replay protection is a uniqueness check on `tx_hash`, which an attacker controls.

**Impact:** An attacker can credit unlimited TCT to any account, enabling them to join wager games and withdraw funds (if withdrawal flows are also compromised). Combined with CRIT-02, an attacker can deposit fake funds, play against a colluding account, submit the result via the forged JWT, and cash out real USDC from escrow.

**Remediation:**  
1. Add authentication — the endpoint should only accept calls from:
   - Supabase's internal cron scheduler (verify via `CRON_SECRET` header), or
   - Service-role authenticated callers.
2. Verify the transaction on-chain before crediting: check that `tx_hash` exists on Base mainnet, that `toAddress` matches the platform vault, and that confirmations are at least 6.
3. Consider removing the manual-notification path entirely and relying solely on on-chain polling.

---

### CRIT-04: Unauthenticated `process-withdrawals` Endpoint

**File:** `supabase/functions/process-withdrawals/index.ts`  
**Category:** Unauthenticated Critical Endpoint

**Description:**  
The withdrawal processor has no authentication check. Any caller can trigger it. While it only processes records already in the `withdrawal_requests` table (providing some protection), the endpoint also accepts a `{mode: "retry"}` body parameter that can reset a `failed` withdrawal back to `pending` status and re-process it.

**Impact:**
- Any attacker can spam the endpoint to trigger excessive on-chain transactions, draining gas from the vault wallet.
- An attacker who has inserted a fraudulent withdrawal request (potentially via fake deposit → withdrawal flow) can force-retry it.
- The `retry` mode could be used to double-process a withdrawal if there is a race condition between status updates.

**Remediation:**  
Add a `CRON_SECRET` or `SETTLEMENT_API_KEY` header check identical to what `submit-game-result` uses for its `hasValidApiKey` path. Reject all unauthenticated calls.

---

### CRIT-05: JWT Forgery in `relay-transaction` and `game-complete` — Attacker Can Impersonate Any User

**Files:**  
- `supabase/functions/relay-transaction/index.ts` (user identity extraction)  
- `supabase/functions/game-complete/index.ts`, line 321  
- `supabase/functions/house-entry-fee/index.ts`, line 46  
- `supabase/functions/tournament-collect-entry/index.ts`, line 88  
- `supabase/functions/tournament-refund-entry/index.ts`, line 77  
**Category:** JWT Forgery / Privilege Escalation

**Description:**  
Multiple edge functions extract the caller's user ID from a JWT without verifying its signature:

```typescript
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
userId = payload.sub;
```

An attacker can forge a token with `{"sub": "<victim_user_id>"}` and impersonate any user. Functions that use this pattern for authorization decisions include:
- `relay-transaction`: determines which user's gasless relay quota applies and which user ID is associated with the on-chain transaction.
- `game-complete`: determines which player is submitting the game result.
- `house-entry-fee`: determines the caller's user ID before executing a USDC permit transfer.
- `tournament-collect-entry`: determines the entrant's user ID before locking entry fees.

**Impact:** An attacker can:
- Impersonate any user in house challenge and tournament entry flows.
- Submit game completions on behalf of other players.
- Bypass per-user rate limits in the relay function.

**Remediation:**  
Replace all `atob(parts[1])` patterns with a verified Supabase auth call:
```typescript
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
if (error || !user) return unauthorizedResponse();
const userId = user.id;
```
This is already correctly done in `emergency-refund`, `get-stream-key`, `encrypt-stream-key`, `tiktok-api`, `twitch-api`, and `stream-relay` — apply the same pattern universally.

---

## HIGH Findings

---

### HIGH-01: `game-session` Trusts Request Body for Player Identity

**File:** `supabase/functions/game-session/index.ts`  
**Category:** Missing Authentication

**Description:**  
The `validate-move`, `sync-time`, and `end-game` endpoints accept a `playerId` field from the POST body and use it directly to determine game state. No JWT is verified. An attacker who knows a `gameId` and either player's UUID can:
- Submit arbitrary moves for the opponent.
- Declare the game ended with any result.
- Desync timers.

The function uses a **service-role Supabase client** — so any state it writes bypasses RLS.

**Impact:** Any active wager game can be manipulated by a third party who knows the game ID (which may be observable from the database or app traffic).

**Remediation:**  
Add JWT verification (using `supabase.auth.getUser(token)`) at the start of each endpoint handler, and verify that the authenticated user's ID matches the `playerId` from the request body and is a participant in the specified game.

---

### HIGH-02: `complete_house_challenge` Has No Caller Authorization Check

**File:** `supabase/migrations/106_house_challenges.sql`, lines 246–341  
**Category:** Missing Authorization

**Description:**  
The `complete_house_challenge` PostgreSQL function is callable by any authenticated user (`GRANT EXECUTE ... TO authenticated`). It accepts an `attempt_id` UUID and a boolean `p_objective_met`. It does **not verify that the caller is the owner of the attempt**:

```sql
SELECT * INTO v_attempt FROM house_challenge_attempts WHERE id = p_attempt_id FOR UPDATE;
-- No check: auth.uid() = v_attempt.user_id
```

An authenticated attacker can call `complete_house_challenge(any_attempt_id, true, ...)` to declare any other user's in-progress attempt as won and trigger a `payout_status = 'pending'` record — initiating a real USDC payout to the attempt owner's wallet.

**Impact:** An attacker can trigger payouts for any in-progress house challenge attempt, draining the platform vault. If the attacker creates attempts under their own account and also calls `complete_house_challenge` on their own attempts, they can claim unlimited wins.

**Remediation:**  
Add a caller check at the start of the function:
```sql
IF v_attempt.user_id != auth.uid() THEN
  RETURN QUERY SELECT FALSE, FALSE, NULL::NUMERIC, 'Unauthorized';
  RETURN;
END IF;
```

---

### HIGH-03: Broad `GRANT ALL ON ALL TABLES` to `anon` and `authenticated`

**File:** `supabase/migrations/001_initial_schema.sql`, lines 344–345  
**Category:** Overly Permissive Database Access

**Description:**  
The initial migration contains:
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

This grants `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on every table (including any created after this migration) to both unauthenticated (`anon`) and authenticated users. Supabase's RLS policies are the only defense layer. If any table lacks a restrictive RLS policy, it is fully exposed.

**Impact:** Tables created without explicit RLS policies (including future tables) are world-readable and world-writable by any anonymous user. Tables with incomplete RLS policies may have unexpected write access.

**Remediation:**  
Replace the blanket grant with explicit per-table grants as tables are created. Also run `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` and verify RLS is enabled with `FORCE ROW LEVEL SECURITY` on all financial tables.

---

### HIGH-04: Admin Functions Callable by All Authenticated Users

**File:** `supabase/migrations/053_fix_admin_permissions_and_queries.sql`  
**Category:** Excessive Privilege Exposure

**Description:**  
Migration 053 grants all admin functions to the `authenticated` role:
```sql
GRANT EXECUTE ON FUNCTION admin_ban_user(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_grant_admin(UUID, UUID) TO authenticated;
-- ... and 10 more admin functions
```

While the functions do check `is_user_admin(p_admin_id)` internally, any authenticated user can repeatedly call these functions with arbitrary UUIDs as the `p_admin_id` parameter. The internal check only fails gracefully — it does not raise an error that would be logged as an intrusion attempt in a way that is directly surfaced to security monitoring.

**Impact:**
- Attack surface is unnecessarily large. A bug in `is_user_admin()` would immediately give every user admin access.
- Brute-force enumeration of admin UUIDs is possible via timing differences.
- The `admin_adjust_balance` function exposed to all users is particularly sensitive.

**Remediation:**  
Grant admin functions only to `service_role`. Admin actions should be proxied through edge functions that verify admin status before calling the RPC, rather than exposing the RPCs directly to client-facing roles.

---

### HIGH-05: `payment_orders` Table Writable by All Authenticated Users

**File:** `supabase/migrations/008_payment_orders.sql`, line 445  
**Category:** Data Integrity

**Description:**  
```sql
GRANT ALL ON payment_orders TO authenticated;
```

Any authenticated user can `INSERT` rows into `payment_orders` with fabricated provider data. While `process_payment_order_completion` must be called to actually credit a balance (and that function is `SECURITY DEFINER`), a user who inserts a fake `payment_order` with `status = 'completed'` could potentially trigger auto-processing if any background job or trigger calls `process_payment_order_completion` based on table state.

RLS policies on `payment_orders` use the old `privy_user_id` pattern (lines 426, 432, 438) which may not correctly filter by the current `auth.uid()`, further weakening this protection.

**Impact:** Possible injection of fake payment records; potential for fraudulent balance crediting if any auto-processing path exists.

**Remediation:**  
Change to `GRANT SELECT, INSERT ON payment_orders TO authenticated` (remove UPDATE, DELETE for user-facing role). Fix RLS policies to use `auth.uid()` instead of `privy_user_id`. Users should only be able to INSERT orders, not update them.

---

### HIGH-06: Stale RLS Policies Using Deprecated `privy_user_id` Auth Pattern

**Files:**  
- `supabase/migrations/008_payment_orders.sql`, lines 426, 432, 438  
- `supabase/migrations/011_admin_system.sql`, lines 1233, 1243  
- `supabase/migrations/013_rewards_achievements_system.sql`, line 433  
- `supabase/migrations/014_magic_auth_migration.sql`, lines 61, 74, 89, 102, 118, 123  
**Category:** Broken Access Control

**Description:**  
These RLS policies authorize access using:
```sql
WHERE profiles.privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
```

Migration 115 renamed `privy_user_id` to `auth_user_id` and dropped the column. If this migration ran successfully, these RLS policies reference a non-existent column and will either error or silently return no rows, potentially making all affected tables inaccessible or unprotected.

**Impact:** RLS policies that are broken effectively deny all access (safe failure for some tables) or, if they fail open, grant unrestricted access. The `payment_orders` and `admin_audit_log` tables are directly affected.

**Remediation:**  
Audit all active RLS policies against `pg_policies` to confirm they reference `auth.uid()` and not `privy_user_id`. Re-create any broken policies using the correct `auth.uid()` pattern.

---

## MEDIUM Findings

---

### MED-01: Webhook Authentication Bypass When Secret Is Empty

**Files:**  
- `supabase/functions/moonpay-webhook/index.ts`, line 308  
- `supabase/functions/transak-webhook/index.ts`, line 350  
**Category:** Authentication Logic Error

**Description:**  
Both webhook handlers have the same logic flaw:
```typescript
if (!isValid && MOONPAY_WEBHOOK_SECRET) {
  return unauthorized();
}
```

When `MOONPAY_WEBHOOK_SECRET` (or `TRANSAK_WEBHOOK_SECRET`) is an empty string or not set in Supabase secrets, the condition `&& MOONPAY_WEBHOOK_SECRET` evaluates to `false`, and the unauthorized response is **never returned** — any caller can trigger arbitrary payment order processing.

**Impact:** If the webhook secrets are not configured, fake payment completion webhooks can be sent to credit arbitrary TCT balances to any account. This is a misconfiguration risk but also a latent planted vulnerability — a developer who removes the secrets can silently enable the bypass.

**Remediation:**  
Change the guard to fail closed when the secret is not configured:
```typescript
if (!MOONPAY_WEBHOOK_SECRET) {
  return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 503 });
}
if (!isValid) {
  return unauthorized();
}
```

---

### MED-02: `process-house-payout` and `process-reward-payout` Have No Authentication

**Files:**  
- `supabase/functions/process-house-payout/index.ts`  
- `supabase/functions/process-reward-payout/index.ts`  
**Category:** Unauthenticated Payout Triggering

**Description:**  
These functions are documented as cron-invoked but have no authentication checks. Any caller can POST to trigger payout processing for all pending records. While the payout destinations come from the database (and only legitimate pending records are processed), unauthenticated access enables:
- DoS via spam-triggering the vault wallet to send many transactions simultaneously (nonce conflicts, gas exhaustion).
- If an attacker has planted fraudulent pending payout records (via CRIT-03 or HIGH-02), they can force-process them immediately.

**Remediation:**  
Add a `CRON_SECRET` header verification identical to the pattern recommended for CRIT-04.

---

### MED-03: In-Memory Rate Limiting in `relay-transaction` Resets on Cold Start

**File:** `supabase/functions/relay-transaction/index.ts`  
**Category:** Rate Limiting Bypass

**Description:**  
The relay function implements per-address rate limiting using an in-memory `Map`. Supabase Edge Functions are stateless and can be cold-started by load or after inactivity. Each cold start resets the rate limit counters to zero, allowing an attacker to trigger bursts of gasless transactions by forcing function restarts.

**Impact:** An attacker can bypass rate limits to spam the forwarder contract with transactions, draining the relay wallet's gas balance.

**Remediation:**  
Move rate limit tracking to the Supabase database (e.g., a `relay_rate_limits` table with `last_reset_at` and `request_count` columns). Alternatively, use a Redis store if available.

---

### MED-04: Admin Can Set TCT Buy Rate to 10,000 (400x Normal Value)

**File:** `supabase/migrations/117_tct_rates_in_platform_config.sql`  
**Category:** Admin Abuse / Business Logic

**Description:**  
The `admin_update_tct_rates` function accepts a `p_tct_buy_rate` up to `10000` (the `CHECK` constraint maximum). The normal rate is `25 TCT per USDC`. A compromised or rogue admin can set the rate to `10000`, giving users 400x more TCT credit per USDC deposited, then immediately set it back. This inflated TCT could be used to join large wager games and extract real USDC from escrow.

**Remediation:**  
Reduce the maximum allowed buy rate to a reasonable operational ceiling (e.g., `50` — 2x the normal rate). Add a cooldown period between rate changes. Log all rate changes to an immutable audit table with `SECURITY DEFINER` enforcement.

---

### MED-05: `complete_house_challenge` Accepts Client-Supplied `p_objective_met`

**File:** `supabase/migrations/106_house_challenges.sql`, line 248  
**Category:** Business Logic — Client Determines Win/Loss

**Description:**  
The win/loss determination for house challenges is passed in by the caller:
```sql
p_objective_met BOOLEAN
```

The chess engine logic that determines whether the objective was met runs in the React Native client (or the `game-session` edge function). A modified client can always pass `p_objective_met = true`. Even if `game-session` is the only intended caller, nothing in the database function enforces this.

This compounds HIGH-02: not only can any user call the function, but they can also always claim they won.

**Remediation:**  
Move the win/loss determination entirely server-side. The `game-session` or `house-entry-fee` edge functions should compute objective completion from the FEN/PGN and store the result directly — never accepting it as a client-provided boolean.

---

## LOW Findings

---

### LOW-01: `forgeit_house_challenge` Has No Caller Authorization

**File:** `supabase/migrations/106_house_challenges.sql`, lines 344–380  
**Category:** Missing Ownership Check

**Description:**  
`forfeit_house_challenge(p_attempt_id)` is callable by any authenticated user and does not verify `auth.uid() = v_attempt.user_id`. Any user can forfeit another user's active house challenge attempt.

**Impact:** Denial of service — an attacker can forfeit a victim's in-progress house challenge, costing the victim their entry fee.

**Remediation:**  
Add `IF v_attempt.user_id != auth.uid() THEN RETURN QUERY SELECT FALSE, 'Unauthorized'; RETURN; END IF;`

---

### LOW-02: No Self-Play Prevention at Database Level

**File:** Various game creation migrations  
**Category:** Business Logic

**Description:**  
No `CHECK` constraint or trigger prevents a user from creating a game where `white_player_id = black_player_id`. Self-play could be used to farm ELO points or manipulate game statistics. Migration 020 adds triggers to protect game result fields but does not block creation.

**Remediation:**  
Add a `CHECK (white_player_id != black_player_id)` constraint on the `games` table and similar constraints on challenge tables.

---

### LOW-03: Ethereum Address Validation Does Not Enforce EIP-55 Checksum

**File:** `lib/security/validation.ts`  
**Category:** Input Validation

**Description:**  
The `ethereumAddressSchema` validates the format of wallet addresses using a regex but does not verify the EIP-55 mixed-case checksum. Addresses with incorrect checksums are accepted. While this does not directly enable fund theft, it could allow fat-finger or spoofed addresses to be stored in the database.

**Remediation:**  
Use `ethers.getAddress(address)` (which throws on invalid checksum) inside the Zod refine callback.

---

### LOW-04: Supabase Client Falls Back to Placeholder Credentials

**File:** `lib/supabase.ts`  
**Category:** Configuration Safety

**Description:**  
If the `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` environment variables are not set, the Supabase client is initialized with empty string placeholders. This means the app silently operates in a non-functional state without crashing, which could mask misconfiguration in production builds.

**Remediation:**  
Add a startup assertion:
```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase credentials not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
}
```

---

## INFORMATIONAL Findings

---

### INFO-01: `OLD_ESCROW_ADDRESS` Hardcoded in `relay-transaction`

**File:** `supabase/functions/relay-transaction/index.ts`, line 375  
**Category:** Dead Code / Audit Trail

**Description:**  
`const OLD_ESCROW_ADDRESS = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";` is hardcoded with a comment indicating it is a deprecated V1 escrow. The same address appears in `scripts/rescueAllStuckFunds.js` and `scripts/directRecovery.js`. This appears to be a legitimate historical contract address from a migration, not a planted address. However, it should be removed from production code once all funds have been migrated from that contract.

**Action:** Verify `0x6e24927EFa2B4DB5654331Fb20312C9f59712501` is indeed the team's old escrow and that no user funds remain in it. Remove the reference from production code.

---

### INFO-02: `process-house-payout` and `process-reward-payout` Use Raw RPC Calls Instead of ethers.js

**Files:** `supabase/functions/process-house-payout/index.ts`, `supabase/functions/process-reward-payout/index.ts`  
**Category:** Code Quality / Security

**Description:**  
These functions manually construct ERC-20 transfer calldata and sign raw transactions using low-level `fetch` RPC calls instead of using ethers.js (which is used elsewhere). Manual ABI encoding is error-prone and harder to audit.

**Action:** Refactor to use ethers.js `Contract` for consistency and reduced encoding error risk.

---

### INFO-03: `settlement_logs` Granted `GRANT ALL` to Authenticated Users

**File:** `supabase/migrations/019_on_chain_escrow.sql`, line 169  
**Category:** Data Integrity

**Description:**  
`GRANT ALL ON settlement_logs TO authenticated` allows any authenticated user to `DELETE` or `UPDATE` settlement log records — potentially erasing the audit trail of on-chain settlements. Migration 020 creates a `security_audit_log` accessible only by service_role, but `settlement_logs` itself is not similarly protected.

**Action:** Reduce to `GRANT SELECT ON settlement_logs TO authenticated` or enforce an INSERT-only policy via RLS.

---

### INFO-04: CORS Set to `Access-Control-Allow-Origin: *` on All Edge Functions

**Category:** Defense in Depth

**Description:**  
All edge functions return `"Access-Control-Allow-Origin": "*"`. For endpoints that process financial operations, this means any web page can make cross-origin requests to these endpoints. While CORS does not protect against server-to-server calls (which are the primary attack vector for most issues in this audit), it is a defense-in-depth concern for browser-based sessions.

**Action:** Consider restricting CORS to the production app domain for financial endpoints. This is low priority given the mobile-first nature of the app.

---

## Appendix: Verified Safe Items

The following were reviewed and found to be correctly implemented:

- **`emergency-refund`**: Uses `supabase.auth.getUser(token)` — cryptographic JWT verification. Also verifies the caller is an on-chain game participant. Correctly implemented.
- **USDC contract address**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` appears consistently across all functions. This is the correct USDC address on Base mainnet.
- **`get_vault_address()` RPC**: Vault address is stored in the database and fetched server-side — correctly NOT hardcoded in client code (except for CRIT-01 in the relay function).
- **`record_vault_deposit()` replay protection**: Correctly checks `tx_hash` uniqueness before crediting balances.
- **`submit-game-result` on-chain game ID verification**: Correctly verifies that `game.on_chain_game_id` matches the request parameter to prevent escrow substitution attacks.
- **`submit-game-result` winner determination**: Correctly maps winner by wallet address comparison against on-chain `player1`/`player2`, not by color — preventing color-swap exploits.
- **`relay-transaction` ERC-2771 signature verification**: Uses `forwarder.verify()` on-chain — legitimate cryptographic verification of gasless relay requests.
- **MoonPay webhook idempotency**: Uses `.neq("status", "completed")` atomic update to prevent double-crediting on webhook retries.
- **Admin functions internal authorization**: All `admin_*` functions check `is_user_admin(p_admin_id)` before executing — correct server-side enforcement.
- **Migration 020 game result protection triggers**: Correctly prevent modification of `on_chain_game_id`, `wager_tct`, and game results by non-service-role callers.

---

## Prioritized Remediation Order

1. **CRIT-01** — Immediately verify `PLATFORM_VAULT_ADDRESS` is set in Supabase secrets; investigate `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b` transaction history.
2. **CRIT-02** — Remove the unverified JWT path from `submit-game-result`.
3. **CRIT-05** — Replace all `atob(parts[1])` JWT decode patterns with `supabase.auth.getUser(token)` calls across all affected edge functions.
4. **CRIT-03** — Add authentication to `deposit-monitor`; add on-chain transaction verification.
5. **CRIT-04** — Add authentication to `process-withdrawals`.
6. **HIGH-01** — Add JWT verification to `game-session`.
7. **HIGH-02 + MED-05** — Add `auth.uid()` check to `complete_house_challenge` and move win determination server-side.
8. **HIGH-06** — Audit and fix all stale `privy_user_id` RLS policies.
9. **HIGH-03** — Revoke blanket `GRANT ALL ON ALL TABLES` from `anon` and `authenticated`.
10. **HIGH-04** — Restrict admin function grants to `service_role` only.
11. **HIGH-05** — Fix `payment_orders` grants and RLS.
12. **MED-01** — Fix webhook authentication bypass for MoonPay and Transak.

---

## Correctness Audit

**Date:** 2026-06-01
**Scope:** Migration chain correctness (001–125), edge function ↔ database API consistency, client ↔ edge function API consistency.
**Methodology:** Direct file reads of every relevant migration, edge function, and client library. All cross-references were verified manually.

---

### Migration Chain

#### Enum/Type Forward References
All enums consumed by migrations 106–125 (`challenge_objective_type`, `game_status`, `end_reason`, `queue_status`, `house_challenge_status`, etc.) are defined in earlier migrations (001, 009) before they are first referenced. No forward-reference violations found in the full chain.

#### Table Forward References
Migration 106 (`house_challenges.sql`) references `vault_statistics` inside PL/pgSQL function bodies (`complete_house_challenge`, `forfeit_house_challenge`). The `vault_statistics` table is not created until **migration 109**. Because the references are inside function bodies (resolved at call time, not at function-creation time), the functions create successfully on a fresh database. However, calling either function between migrations 106 and 109 would raise a runtime error. On a clean sequential deploy this window does not exist in practice. Additionally, migrations 110 and 118 re-create both functions and remove the `vault_statistics` writes entirely (on-chain payment model), so the gap is resolved by the time the final function version is in place.

#### Constraint Conflicts
- Migration 124 uses `EXCEPTION WHEN duplicate_table THEN NULL` to guard `ADD CONSTRAINT uq_game_moves_game_move_number`. The correct PostgreSQL exception code for a duplicate constraint name is `duplicate_object` (SQLSTATE 42710), not `duplicate_table` (SQLSTATE 42P07). **If the constraint already exists (e.g., due to a partial prior apply), the exception will not be caught and migration 124 will fail.** On a fresh database this does not trigger. See ISSUE-C01.
- No other duplicate index/trigger/constraint conflicts found between migrations 118–125.

#### New Migrations Specific Checks (118–125)

**Migration 121 — `complete_house_challenge` REVOKE signature**

Migration 121 revokes `complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN)`. The function is last defined in migration 118 with exactly this parameter signature. **VERIFIED CLEAN.**

**Migration 122 — admin function REVOKE/GRANT signatures**

All 12 standard admin function REVOKE/GRANT pairs match their definitions in migration 011 exactly. One mismatch found for `admin_update_tct_rates` — see ISSUE-C02.

**Migration 122 — REVOKE `INSERT, UPDATE, DELETE ON house_challenge_attempts` breaking `start_house_challenge`**

`start_house_challenge` is declared `SECURITY DEFINER` (confirmed in migration 112, the latest version). SECURITY DEFINER functions execute with the privileges of the function owner, not the calling user. Revoking from `authenticated` does not affect them. **VERIFIED CLEAN.**

**Migration 124 — fresh database data safety**

No migration inserts seed data into `game_moves`. The UNIQUE constraint `(game_id, move_number)` will be added without violations. The idempotency guard uses the wrong exception code (see ISSUE-C01) but this only matters on re-runs, not fresh deploys.

**Migration 125 — index on `games(status, last_move_at)`**

`status` is type `game_status` (enum, indexable). `last_move_at` is type `TIMESTAMPTZ` (indexable). Partial filter `WHERE status = 'active'` is a valid enum literal. `IF NOT EXISTS` guards against duplicate creation. **VERIFIED CLEAN.**

---

### API Consistency

#### `complete-house-challenge` edge function ↔ DB RPC

The edge function calls `complete_house_challenge` with named parameters `p_attempt_id, p_objective_met, p_moves_made, p_final_fen, p_pgn, p_checkmating_piece, p_queen_sacrificed`. The DB function (final version in migration 118) accepts exactly these 7 parameters in the same types and order. **VERIFIED CLEAN.**

#### `game-timeout-cron` edge function ↔ `games` table columns

Queries `id, white_player_id, black_player_id, current_turn, wager_tct, created_at, last_move_at, status`. All 8 columns confirmed in `games` table (migration 001). **VERIFIED CLEAN.**

#### `game-timeout-cron` → `game-complete` with `endReason: "timeout"`

`game-timeout-cron` calls `game-complete` with `body: { gameId, result, endReason: "timeout" }`. `game-complete` passes this to `finish_game` which casts it to the `end_reason` enum. `"timeout"` is a valid enum value (migration 001). **The timeout-specific flow is CLEAN.**

**However:** If `endReason` is absent or any other invalid value, `game-complete` falls back to `|| "unknown"` which is not a valid enum value and will cause a PostgreSQL cast error, leaving funds locked. See ISSUE-C03.

#### `matchmaking/index.ts` edge function ↔ `matchmaking_queue` columns

All queried columns (`id, user_id, wager_tct, time_control_seconds, increment_seconds, elo_range_min, elo_range_max, user_elo, status, created_at, expires_at`) exist in `matchmaking_queue` (migration 007). **VERIFIED CLEAN.**

#### `vault-reconciliation` RPC calls

`get_vault_address()` (migration 005) and `get_tct_rates()` (migration 117) both exist. The function reads `tctRates?.tct_sell_rate` which matches the JSONB key. **VERIFIED CLEAN.**

#### `tournament-distribute-prizes` ↔ `get_tct_rates()`

Calls `supabase.rpc("get_tct_rates")` and reads `tctRates?.tct_sell_rate`. Matches the JSONB shape from migration 117. **VERIFIED CLEAN.**

---

### Issues Found

#### ISSUE-C01: Wrong exception code in migration 124 idempotency guard (MEDIUM) — ✅ Fixed

**File:** `supabase/migrations/124_game_moves_unique.sql`, line 6
**Severity:** Medium — no impact on a fresh deploy; migration fails silently on re-run instead of being idempotent.
**Fix applied:** Changed `WHEN duplicate_table` to `WHEN duplicate_object` in the DO block exception handler.

```sql
-- Current (wrong):
EXCEPTION WHEN duplicate_table THEN NULL;

-- Fix:
EXCEPTION WHEN duplicate_object THEN NULL;
```

The correct SQLSTATE for "constraint already exists" is 42710 (`duplicate_object`), not 42P07 (`duplicate_table`). If this migration is re-run (e.g., after a partial apply), PostgreSQL will raise the constraint-already-exists error, the DO block will not catch it, and the migration will fail rather than silently proceeding.

#### ISSUE-C02: `admin_update_tct_rates` 3-parameter version has no grant — ungrantable for edge functions (HIGH) — ✅ Fixed

**Files:** `supabase/migrations/118_security_fixes.sql` (line 251), `supabase/migrations/122_revoke_blanket_grants.sql` (lines 52, 67)
**Severity:** High — the secure version of this function is never callable; the admin rate-update path silently falls through to an older, less-audited overload.

Migration 117 creates `admin_update_tct_rates(NUMERIC, NUMERIC)` and grants it to `authenticated` and `service_role`.

Migration 118 creates `admin_update_tct_rates(UUID, NUMERIC, NUMERIC)` (adds `p_admin_id` for audit trail) but issues **no GRANT** for this new signature.

Migration 122 revokes/re-grants only the old `(NUMERIC, NUMERIC)` overload, leaving the 3-param version ungrantable.

Result: Any edge function calling `admin_update_tct_rates` with 3 arguments will get `permission denied`. The old 2-param overload (which lacks the admin-ID audit trail) remains callable.

**Fix applied:** Created `supabase/migrations/127_fix_tct_rates_overload.sql` — drops the unaudited 2-param overload, grants `service_role` on the 3-param version, and revokes `authenticated`/`anon` access.

**Fix (add to a new migration):**
```sql
-- Revoke the now-stale 2-param overload:
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) FROM service_role;
DROP FUNCTION IF EXISTS admin_update_tct_rates(NUMERIC, NUMERIC);
-- Grant the correct 3-param version:
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(UUID, NUMERIC, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_update_tct_rates(UUID, NUMERIC, NUMERIC) TO service_role;
```

#### ISSUE-C03: `"unknown"` fallback in `game-complete` is not a valid `end_reason` enum value (MEDIUM, pre-existing) — ✅ Fixed

**File:** `supabase/functions/game-complete/index.ts`, line 388
**Severity:** Medium — crashes game completion when `endReason` is missing or invalid; funds remain locked in escrow.

```typescript
p_end_reason: endReason || "unknown",  // "unknown" is not in end_reason enum
```

The `end_reason` enum (migration 001) contains: `checkmate, timeout, resign, abandon, draw_agreement, stalemate, insufficient_material, threefold_repetition, fifty_moves`. `"unknown"` is not present.

This is a pre-existing bug, but it is directly in the money path. If a client calls `game-complete` without an `endReason` field, PostgreSQL will raise `invalid input value for enum end_reason: "unknown"` and the game will remain stuck with funds locked.

**Fix applied:** Replaced both `|| "unknown"` fallbacks (lines 388 and 535) with `|| "abandon"` — a valid enum value that correctly represents a disconnected/unresolved game.

**Fix:**
```typescript
p_end_reason: endReason || "abandon",  // or validate and reject instead
```

---

### Items Verified Clean

1. **Migration 121:** `REVOKE complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN)` exactly matches the function's current signature (migration 118). All 7 parameter types and order are identical.

2. **Migration 122 — all 12 standard admin function signatures:** `admin_ban_user(UUID, UUID, TEXT, INTEGER, TEXT)`, `admin_unban_user(UUID, UUID, TEXT)`, `admin_suspend_user(UUID, UUID, TEXT, INTEGER, TEXT)`, `admin_unsuspend_user(UUID, UUID, TEXT)`, `admin_adjust_balance(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT)`, `admin_grant_admin(UUID, UUID, TEXT)`, `admin_revoke_admin(UUID, UUID, TEXT)`, `admin_get_dashboard_stats()`, `admin_search_users(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER)`, `admin_get_user_details(UUID)`, `log_admin_action(UUID, admin_action_type, admin_action_severity, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, INET, TEXT, JSONB, BOOLEAN)`, `check_expired_suspensions()` — all REVOKE/GRANT pairs match their definitions in migration 011.

3. **Migration 122 REVOKE on `house_challenge_attempts` does not break `start_house_challenge`:** Function is SECURITY DEFINER — INSERT proceeds with owner privileges regardless of caller grants.

4. **Migration 124 data safety on fresh DB:** No seed data in `game_moves`; UNIQUE constraint adds cleanly.

5. **Migration 125 index validity:** Column types confirmed valid for partial index creation.

6. **`complete-house-challenge` edge function ↔ DB RPC:** All 7 named parameters match exactly.

7. **`game-timeout-cron` column references:** All 8 selected columns exist in the `games` table.

8. **`game-timeout-cron` → `game-complete` timeout path:** `"timeout"` is a valid `end_reason` enum value; the cron-specific flow works correctly.

9. **`lib/houseChallenges.ts` → `complete-house-challenge` edge function:** Client sends `{ attempt_id, final_fen, pgn, moves_made, checkmating_piece, queen_sacrificed }`. Edge function destructures exactly these field names. Clean match.

10. **`stores/onlineGameStore.ts` `_persistMove` upsert `onConflict` format:** `"game_id, move_number"` is the correct Supabase JS client format and matches the UNIQUE constraint added in migration 124.

11. **`app/challenge-board.tsx` `params.openFriendSearch`:** `app/index.tsx` passes this param via `router.push({ pathname: "/challenge-board", params: { openFriendSearch: "true" } })` at line 1032. `challenge-board.tsx` reads it with `useLocalSearchParams()`. Route param passes correctly.

12. **`lib/matchmakingEnhanced.ts` RPC calls:** `create_matched_game(p_my_queue_id, p_opponent_queue_id, p_my_user_id)`, `confirm_game_ready(p_game_id)`, `cancel_pending_game(p_game_id)` — all three functions exist in migration 119 with matching parameter names and types.

13. **`vault-reconciliation` and `tournament-distribute-prizes` RPC calls:** `get_vault_address()` (migration 005) and `get_tct_rates()` (migration 117) both exist and return the expected shapes.

14. **`challenge_objective_type` enum forward-reference in migration 106:** Defined in migration 009, used in migration 106. Correct ordering confirmed.

15. **`game_status` enum values `ready_white`, `ready_black` used in migration 119:** Added by migration 119 itself in guarded DO blocks before use. No forward-reference.

---

## Client-Side Security Audit

**Date:** 2026-06-01  
**Scope:** `app/`, `lib/`, `stores/`, `components/`, `hooks/`  
**Method:** Static analysis — grep patterns, full file reads of critical paths

---

### Hardcoded Values

**Finding CS-HV-01 (CLEAR — No Rogue Addresses Found)**

The two known rogue developer addresses (`0xDE50B9A124269a06542bBc4e08De71a5e6cFa438` and `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b`) do **not** appear anywhere in the client-side code (`app/`, `lib/`, `stores/`, `components/`, `hooks/`). The only Ethereum addresses present are:

- `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — Official USDC on Base mainnet. Appears correctly in `lib/vault.ts`, `lib/chains.ts`, `stores/walletStore.ts`, `hooks/useWallet.ts`, `hooks/useHomeStats.ts`, `app/deposit.tsx`, `app/wallet.tsx`, `lib/admin.ts`. All instances use this as a fallback to `process.env.EXPO_PUBLIC_USDC_CONTRACT` — acceptable since the address is public and correct.
- USDC addresses for other chains in `lib/chains.ts` (Polygon, Ethereum mainnet, Arbitrum, Optimism, Avalanche, BSC) — all are official Circle USDC addresses. Verified against known correct values.
- `0x0000000000000000000000000000000000000001` — Placeholder test wallet in `lib/fiat-ramp/transak.ts:239`. Benign (labeled `TEST_WALLET`, never used in production paths).

**Finding CS-HV-02 ✅ Fixed — MEDIUM — MoonPay/Transak Secret Keys Loaded Client-Side)**

File: `lib/fiat-ramp/moonpay.ts` lines 23–35, `lib/fiat-ramp/transak.ts` lines 21–33

```
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || "";
const TRANSAK_SECRET_KEY = process.env.TRANSAK_SECRET_KEY || "";
```

These are loaded in client-side React Native code via `process.env`. In Expo, **any** `process.env.*` variable that is not prefixed `EXPO_PUBLIC_` is stripped at build time and resolves to `""` — so the keys will never actually be populated in a production bundle. However, the code structure is architecturally dangerous: if a developer or CI pipeline accidentally uses `EXPO_PUBLIC_MOONPAY_SECRET_KEY`, the secret would be embedded in the app binary. The variable names (without `EXPO_PUBLIC_`) make this safe by accident, not by design. Additionally, `signWidgetUrl()` in `moonpay.ts` is a stub — it generates a fake signature (`moonpay_sig_${Date.now()}`) with a comment acknowledging this: _"signing should be done server-side."_ This is not a vulnerability in the current state but the dead code creates confusion.

**Recommendation:** Move all URL-signing calls server-side (edge function). Remove the `secretKey` field from the client-side `FiatRampConfig` type and all client-side config objects.

**Fix applied:** Renamed `secretKey` → `serverOnlySecretKey` in `FiatRampConfig` (`lib/fiat-ramp/types.ts`) and in both `moonpayConfig` (`lib/fiat-ramp/moonpay.ts`) and `transakConfig` (`lib/fiat-ramp/transak.ts`). Added inline JSDoc comment on the field and in the variable declarations explaining this is always `""` in the client bundle and is server-only. Server-side URL signing is a remaining TODO.

**Finding CS-HV-03 (LOW — Placeholder Staging Key in Transak)**

File: `lib/fiat-ramp/transak.ts` line 238

```
STAGING_API_KEY: "your-staging-api-key",
```

This is a placeholder string in a constant object, not a real key. It does not ship as a functional credential. Low risk but should be cleaned up to avoid confusion.

**Finding CS-HV-04 (CLEAR — No Private Keys, Mnemonics, or Real API Keys Hardcoded)**

No private keys, seed phrases, mnemonics, or real API key values were found hardcoded anywhere in client code. All sensitive configuration references use `process.env.*`.

---

### Auth Flow Issues

**Finding CS-AF-01 ✅ Fixed — HIGH — `credit_user_balance` RPC Called Directly from Client)**

File: `lib/wallet.ts` lines 621–625

```typescript
const { data, error } = await (supabase.rpc as any)("credit_user_balance", {
  p_user_id: userId,
  p_amount: amountTct,
  p_description: description,
});
```

The `creditBalance()` function in `lib/wallet.ts` calls `credit_user_balance` as a direct Supabase RPC from the client. Any authenticated user can invoke this RPC directly (e.g. via the Supabase JS SDK in a browser console) and credit their own balance if the database function does not have sufficient server-side authorization checks. The `(supabase.rpc as any)` cast suppresses TypeScript type checking, indicating the developer was aware this was unusual. The only apparent caller path is the deposit flow after on-chain verification — but the function is exported and callable from anywhere.

**Impact:** If `credit_user_balance` does not enforce `auth.uid() = p_user_id` AND require a valid on-chain deposit transaction, an attacker could self-credit arbitrary balances. The server-side audit (migration 121/122) should be reviewed to confirm this function is properly restricted. The client should **not** be calling balance-crediting RPCs directly.

**Recommendation:** Remove `creditBalance()` from the client and route all deposit crediting through an authenticated edge function (`process-deposits`). The edge function should be the only caller of `credit_user_balance`.

**Fix applied (migration 126):** `credit_user_balance` had no DB definition. Migration 126 creates a hard-failing stub that raises an exception, and revokes EXECUTE from `authenticated`, `anon`, and `public`. The client call in `lib/wallet.ts` was already dead code (the `as any` cast exposed this), but now any invocation fails explicitly rather than with a generic "function not found" error.

**Finding CS-AF-02 ✅ Fixed — MEDIUM — `update_ledger_balance` Called Directly from Client)**

File: `lib/security/ledger.ts` lines 403–407

```typescript
const { error } = await supabase.rpc("update_ledger_balance", {
  p_account_type: entry.accountType,
  p_account_id: entry.accountId,
  p_amount: balanceChange,
  p_currency: entry.currency,
});
```

The client-side ledger module directly manipulates the double-entry bookkeeping ledger. This should be a server-only operation. If the DB function does not enforce service-role-only access, any authenticated user could insert arbitrary ledger entries.

**Fix applied (migration 126):** `REVOKE EXECUTE ON FUNCTION update_ledger_balance(TEXT, TEXT, NUMERIC, TEXT) FROM authenticated, anon`. The function remains callable by `service_role` only. The client call in `lib/security/ledger.ts` will now receive an "insufficient privilege" error at runtime rather than silently manipulating ledger balances.

**Finding CS-AF-03 (MEDIUM — `lock_balance_for_game`, `lock_balance_for_challenge`, `lock_balance`, `unlock_balance_for_challenge` Called Directly from Client)**

Files: `lib/challenges.ts` lines 503, 1540, 1552; `lib/escrow.ts` lines 225, 264; `lib/matchmaking.ts` line 578; `stores/playNowStore.ts` line 707

Multiple balance-locking and unlocking RPCs are invoked directly from client code. If these DB functions do not enforce that the requesting user owns the `p_user_id` being locked, a user could lock another user's balance (DoS) or unlock their own locked funds (escrow bypass). The server-side audit should specifically verify RLS/`auth.uid()` checks on these functions.

**Finding CS-AF-04 (CLEAR — Withdrawal Screen Has Auth Check)**

The withdrawal screen (`app/withdraw.tsx` line 460) checks `if (!profile?.id)` before submitting, and the final `request_withdrawal` RPC call passes `p_user_id: profile.id`. This is a reasonable client-side guard. Since `profile.id` comes from the authenticated session (not user input), this is not exploitable for unauthorized withdrawals — the real enforcement is server-side RLS.

**Finding CS-AF-05 (CLEAR — `supabase` Auth Token Storage)**

`lib/supabase.ts` configures the Supabase client with `storage: AsyncStorage`. This stores the Supabase JWT in AsyncStorage (unencrypted). This is standard practice for React Native Supabase apps; on iOS the AsyncStorage data is protected by the sandbox and encrypted at rest via iOS Data Protection. On Android it depends on the device and OS version. This is acceptable for a JWT (which is not a private key and has a short expiry), but worth noting. Biometric auth (`hooks/useBiometricAuth.ts`) correctly uses `expo-secure-store` for the biometric userId token.

---

### Data Validation

**Finding CS-DV-01 (CLEAR — Withdrawal Address Validation Is Correct)**

`app/withdraw.tsx` uses `validateAddress()` from `lib/chains.ts` (lines 343, 346) on the destination address before allowing the user to continue. This is invoked as a `useMemo` (`isValidAddress`) and the Continue button is `disabled={!isValidAddress}`. The `validateAddress()` function in `lib/chains.ts` performs chain-specific address format checking. Note: the `ethereumAddressSchema` from `lib/security/validation.ts` is not directly used here — a different validator is used (`validateAddress` from `lib/chains.ts`). Both approaches check address format; `lib/security/validation.ts` additionally uses `ethers.getAddress()` for EIP-55 checksum validation. Minor inconsistency, low risk.

**Finding CS-DV-02 (CLEAR — Withdrawal Amount Validation Is Present)**

`app/withdraw.tsx`: `isValidAmount` (`useMemo`, lines 333–337) checks that amount is between `MIN_WITHDRAWAL_TCT` (250) and `availableBalance`. The Continue button is disabled when invalid. Client-side validation gates the UX; server-side enforcement in `request_withdrawal` is the authoritative check.

**Finding CS-DV-03 (LOW — Deposit Amount Validation Is Minimal Client-Side)**

`app/deposit.tsx` line 607: `const isValidAmount = numAmount >= 10;` — only checks a $10 minimum. The validation does not use the `depositAmountSchema` from `lib/security/validation.ts`. This is fine as the server validates authoritatively, but adopting the shared schema would improve consistency.

**Finding CS-DV-04 (CLEAR — No Direct DB Writes on Financial Tables from App Screens)**

With the exception of `app/admin/support-tickets.tsx` (inserts into `support_messages` — not a financial table), no app screen writes directly to `user_balances`, `transactions`, `withdrawal_requests`, or `profiles.balance` via `supabase.from(...).insert/update/delete`. Financial mutations go through RPC calls.

---

### Sensitive Data Exposure

**Finding CS-SDE-01 ✅ Fixed — LOW — Wallet Address Logged to Console in Production-Path Code)**

The following locations log wallet addresses and balances to the console without a `__DEV__` guard:

- `hooks/useHomeStats.ts` line 56: logs `rpcUrl`, `usdcContract`, and `walletAddress` on every USDC balance fetch
- `hooks/useHomeStats.ts` line 452: logs on-chain USDC and TCT balance values  
- `hooks/useWallet.ts` line 151: logs USDC balance and wallet address
- `stores/walletStore.ts` lines 730, 775: logs USDC balance on every fetch and refresh
- `stores/userStore.ts` line 394: logs "Push token saved to Supabase" (token value not logged — acceptable)
- `hooks/useLivestream.ts` lines 462, 466: logs full OAuth URLs (may contain tokens if state/nonce are embedded)

None of these log private keys or JWT tokens. Wallet addresses are public by nature. However, wallet address + balance logs in production builds may assist chain analysis. The OAuth URL logging could expose OAuth state parameters.

**Recommendation:** Wrap wallet address and balance logs in `if (__DEV__)` guards. Review OAuth URL logs for embedded tokens.

**Fix applied:** Wrapped all wallet address, USDC balance, and TCT balance `console.log` calls in `if (__DEV__)` guards in `hooks/useHomeStats.ts` (lines 56–60, 344–350, 354, 377, 452), `hooks/useWallet.ts` (line 151), and `stores/walletStore.ts` (lines 730, 775). The OAuth URL logging in `hooks/useLivestream.ts` was not in scope for this round.

**Finding CS-SDE-02 (CLEAR — No Private Keys or JWT Tokens Logged)**

No `console.log` statements were found that output private keys, JWT/auth tokens, Supabase session data, or secret values. The `lib/security/logger.ts` redaction list correctly includes `privateKey`, `mnemonic`, and `seedPhrase` as keys to scrub.

**Finding CS-SDE-03 (LOW — Debug Mode Variables Used Without Consistent Guarding)**

`lib/fiat-ramp/transak.ts` defines `STAGING_API_KEY: "your-staging-api-key"` in a constants object. `lib/analytics.ts` uses `__DEV__` correctly to gate analytics and debug logging. `lib/performance.ts` correctly gates profiling and render count tracking to `__DEV__`. Debug mode behavior appears appropriately controlled overall.

---

### Access Control

**Finding CS-AC-01 (CLEAR — All Admin Screens Protected by AdminGate)**

Every screen in `app/admin/` wraps its content in `<AdminGate>`. The `AdminGate` component (`components/AdminGate.tsx`) correctly:
1. Waits for auth loading to complete before rendering
2. Redirects unauthenticated/guest users to a login screen
3. Blocks non-admin users with an "Access Denied" screen
4. Supports `requireSuperAdmin` prop for escalated operations

The `useAdmin()` hook fetches admin status from the server via `adminService.getAdminProfile()` — this is a server-verified check, not purely client-state.

**Finding CS-AC-02 ✅ Fixed — MEDIUM — `manage-admins` Screen Does Not Require `requireSuperAdmin`)**

File: `app/admin/manage-admins.tsx` line 40

```tsx
<AdminGate featureName="Manage Admins">
```

The manage-admins screen (which allows granting/revoking admin and super-admin roles) does **not** pass `requireSuperAdmin={true}` to `AdminGate`. Any admin (not just super-admins) can navigate to this screen. The underlying `grantAdminRole`, `revokeAdminRole`, and `grantSuperAdminRole` hooks do check `!state.isSuperAdmin` before calling the RPC (lines 295, 316, 337 in `hooks/useAdmin.ts`), so the privilege escalation is blocked server-side. However, a regular admin can still see the manage-admins UI, view the admin list, and attempt operations that are then rejected. The defense should be in depth: add `requireSuperAdmin={true}` to this screen's `AdminGate`.

**Fix applied:** Changed `<AdminGate featureName="Manage Admins">` to `<AdminGate featureName="Manage Admins" requireSuperAdmin>` in `app/admin/manage-admins.tsx`.

**Finding CS-AC-03 ✅ Fixed — MEDIUM — `house-challenges` Admin Screen Does Not Require Super Admin)**

File: `app/admin/house-challenges.tsx` line 1540

House challenges are a direct fund-flow feature (platform takes rake; challenge creation involves balance operations). The AdminGate does not specify `requireSuperAdmin={true}`. Any admin can create/manage house challenges. Evaluate whether this should be super-admin restricted.

**Fix applied:** Changed `<AdminGate featureName="House Challenges">` to `<AdminGate featureName="House Challenges" requireSuperAdmin>` in `app/admin/house-challenges.tsx`.

**Finding CS-AC-04 (CLEAR — Root Layout Has No Admin Route Guard at the Router Level)**

`app/_layout.tsx` registers `admin` as a route stack without any auth check at the router level. However, this is by design since all admin screens individually use `AdminGate`. The defense-in-depth is provided at the component level rather than the router level. This is acceptable but a router-level guard (e.g. middleware checking admin role before rendering the admin stack) would be more robust.

**Finding CS-AC-05 (CLEAR — Financial Screens Do Basic Auth Checks)**

`app/withdraw.tsx` checks `profile?.id` before financial operations. `app/deposit.tsx` similarly checks for a logged-in profile. These are reasonable minimal checks; the authoritative enforcement is server-side.

---

### Race Conditions

**Finding CS-RC-01 (CLEAR — Withdrawal Submit Button Is Disabled During Loading)**

`app/withdraw.tsx`:
- The confirm-step submit button uses `disabled={isLoading}` (line 1388)
- The bridge-quote confirm button also uses `disabled={isLoading}` (line 1256)
- The `isLoading` state is set to `true` before the async call and `false` in the `finally` block

This correctly prevents double-submission via button tapping.

**Finding CS-RC-02 (CLEAR — Deposit Submit Button Is Disabled During Loading)**

`app/deposit.tsx` uses both `disabled={!isValidAmount || isLoading}` (line 675) and `disabled={isSubmittingFiat}` (line 775) on the relevant submit buttons. Correctly guarded.

**Finding CS-RC-03 (CLEAR — Withdrawal Uses Idempotency Key)**

`app/withdraw.tsx` line 480 generates an idempotency key for the base wallet withdrawal: `withdraw_${profile.id}_${Date.now()}`. This is passed to the `request_withdrawal` RPC. Even if a race condition bypassed the UI disable, the server-side idempotency key would prevent duplicate processing (assuming the DB function honors it).

**Finding CS-RC-04 ✅ Fixed — LOW — Idempotency Key Uses `Date.now()` — Sub-millisecond Race Possible)**

The idempotency key `withdraw_${profile.id}_${Date.now()}` could theoretically generate the same key in sub-millisecond double-taps (though in practice impossible on a mobile device). A UUID (`crypto.randomUUID()`) would be more robust.

**Fix applied:** Changed to `withdraw_${profile.id}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}` in `app/withdraw.tsx`. This combines random entropy with a timestamp, avoiding the sub-millisecond collision risk without requiring `crypto.randomUUID()` (which may not be available in all React Native environments).

---

### Items Verified Clean

- No known rogue developer addresses (`0xDE50B9A124269a06542bBc4e08De71a5e6cFa438`, `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b`) appear anywhere in client-side code
- No private keys, mnemonics, or seed phrases are hardcoded
- No real API key or secret values are hardcoded (only `process.env.*` references)
- All 13 admin screens are individually wrapped in `AdminGate` with proper auth checks
- `AdminGate` performs server-verified admin role checks, not client-state-only checks
- Biometric auth tokens use `expo-secure-store` (not plain AsyncStorage)
- Withdrawal address validation (`validateAddress()`) is applied before form submission
- Submit buttons on withdrawal and deposit forms are correctly disabled during in-flight requests
- Base wallet withdrawal uses server-side idempotency keys
- No JWT tokens, auth session data, or private keys appear in `console.log` statements
- Debug/profiling code is consistently gated behind `__DEV__` checks
- `MOONPAY_SECRET_KEY` and `TRANSAK_SECRET_KEY` use non-`EXPO_PUBLIC_` prefix — secrets correctly resolve to empty string in bundled app
- No direct writes to financial DB tables (`user_balances`, `transactions`, `withdrawal_requests`) from app screens; all go through RPC
- Admin RPC calls (`admin_ban_user`, `admin_grant_admin`, etc.) go through `lib/admin.ts` service layer, not inlined in screen components

---

### Client-Side Remediation Priority

| Priority | Finding | Status | Action |
|----------|---------|--------|--------|
| HIGH | CS-AF-01 | ✅ Fixed | Migration 126: hard-failing `credit_user_balance` stub created; EXECUTE revoked from all non-superuser roles |
| HIGH | CS-AF-02 | ✅ Fixed | Migration 126: `REVOKE EXECUTE ON FUNCTION update_ledger_balance FROM authenticated, anon` |
| MEDIUM | CS-AF-03 | Open | Verify server-side `auth.uid() = p_user_id` enforcement on all `lock_balance*` / `unlock_balance*` RPCs |
| MEDIUM | CS-AC-02 | ✅ Fixed | Added `requireSuperAdmin` to `<AdminGate>` in `app/admin/manage-admins.tsx` |
| MEDIUM | CS-AC-03 | ✅ Fixed | Added `requireSuperAdmin` to `<AdminGate>` in `app/admin/house-challenges.tsx` |
| MEDIUM | CS-HV-02 | ✅ Fixed | Renamed `secretKey` → `serverOnlySecretKey` with JSDoc explaining server-only nature; URL signing still TODO |
| LOW | CS-SDE-01 | ✅ Fixed | Wallet address / balance `console.log` calls wrapped in `if (__DEV__)` in `useHomeStats.ts`, `useWallet.ts`, `walletStore.ts` |
| LOW | CS-RC-04 | ✅ Fixed | Idempotency key now uses `Math.random().toString(36).slice(2) + Date.now().toString(36)` |
| LOW | CS-DV-03 | Open | Use `depositAmountSchema` from `lib/security/validation.ts` in deposit form |
| LOW | CS-HV-03 | Open | Remove `STAGING_API_KEY: "your-staging-api-key"` placeholder from `lib/fiat-ramp/transak.ts` |

---

## Super-Secure Audit — Business Logic Red Team

**Date:** 2026-06-01  
**Scope:** Business logic attack scenarios targeting fund-draining paths that survived previous security fixes  
**Auditor:** Automated red-team agent (claude-sonnet-4-6)

---

### Summary Table

| ID | Scenario | Exploitable | Severity | Fix Status |
|----|----------|-------------|----------|------------|
| BL-01 | `settle_escrow` / `settle_escrow_with_rake` callable by any authenticated user | YES | CRITICAL | Fixed — migration 128 |
| BL-02 | `finish_game` callable by any game participant to write fraudulent result | YES | CRITICAL | Fixed — migration 128 |
| BL-03 | `unlock_balance_for_challenge` has no caller-ownership check | YES | HIGH | Fixed — migration 128 |
| BL-04 | `finalize_tournament` / `complete_tournament` callable by any authenticated user | YES | HIGH | Fixed — migration 128 |
| BL-05 | Rake credited to admin profile balance in `settle_escrow_with_rake` | YES | HIGH | Fixed — migration 128 |
| BL-06 | Double-payout on house challenge via race condition | NO | — | Blocked by DB-level status gate |
| BL-07 | Tournament prize double-claim or refund-and-receive | NO | — | Blocked by status checks and UNIQUE constraint |
| BL-08 | `cancel_pending_game` on active game to unlock wager | NO | — | Blocked by status check in migration 119 |
| BL-09 | Balance inflation via `admin_adjust_balance` after migration 122 | NO | — | Revoked from authenticated in migration 122 |
| BL-10 | TCT rate manipulation via indirect path | NO | — | Revoked from authenticated in migration 122 |

---

### BL-01: Fraudulent Wager Payout via Direct `settle_escrow` / `settle_escrow_with_rake` Call

**Attack path:**
1. Attacker is in an active wager game (escrow status = `active`)
2. Attacker calls `settle_escrow_with_rake(game_id, attacker_user_id, 'checkmate')` directly via Supabase RPC
3. The function has no `auth.uid()` caller check — it only validates `escrow.status IN ('active', 'pending_escrow')`
4. Attacker is credited the full winner payout without winning the game

**Exploitable:** YES  
**Severity:** CRITICAL  
**Evidence:** Migration 116 line 224: `GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO authenticated`. Migration 122 REVOKE list does not include this function. Function body (migration 116, lines 67-78) only gates on escrow status — no `auth.uid()` check exists.

**Remediation (applied — migration 128):** Revokes `settle_escrow` and `settle_escrow_with_rake` from `authenticated`; grants to `service_role` only. These are called exclusively via the `game-complete` edge function using the service role key.

---

### BL-02: Fraudulent Game Result via Direct `finish_game` Call

**Attack path:**
1. Attacker is a player in a wager game
2. Calls `finish_game(game_id, 'completed', 'white_wins', attacker_id, 'checkmate', fen)` directly via RPC (GRANTED to `authenticated` in migrations 040 and 042; NOT revoked in 122)
3. `finish_game` has no `auth.uid()` check — it unconditionally updates any game row
4. Attacker calls `game-complete` edge function to trigger payout with the now-fraudulent result

**Exploitable:** YES  
**Severity:** CRITICAL  
**Evidence:** Migration 042 — `finish_game` definition has no `auth.uid()` validation. Migration 122 REVOKE list does not include `finish_game`.

**Remediation (applied — migration 128):** Revokes `finish_game` from `authenticated`. The `game-complete` edge function calls it via service role key after verifying the caller is a participant.

---

### BL-03: Balance Manipulation via `unlock_balance_for_challenge` Without Caller Ownership Check

**Attack path:**
1. Attacker knows a target user_id with `locked_tct > 0`
2. Calls `unlock_balance_for_challenge(target_user_id, amount, 'fake-id')` — no `auth.uid()` check in migration 091
3. Target user's locked funds are freed; target can now withdraw collateral the platform was holding
4. Secondary attack: `lock_balance_for_challenge(victim_user_id, large_amount, 'fake-id')` locks any user's available balance

**Exploitable:** YES  
**Severity:** HIGH  
**Evidence:** Migration 091 lines 54-100: no `auth.uid()` comparison. Prior audit noted this as TODO (CS-AF-03) but never remediated. Migration 122 did not revoke these functions.

**Remediation (applied — migration 128):** Recreates both functions with `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized'` as first guard.

---

### BL-04: Tournament Manipulation via Direct `finalize_tournament` / `record_tournament_match_result`

**Attack path A — premature finalization:**
1. Attacker in a tournament calls `finalize_tournament(tournament_id)` while they are leading
2. `finalize_tournament` only blocks if `status = 'completed'`; active tournament proceeds
3. Attacker collects prizes while remaining rounds are unplayed

**Attack path B — fraudulent match result:**
1. Attacker calls `record_tournament_match_result(match_id, attacker_id, NULL)` directly
2. No `auth.uid()` check — attacker declared winner; may trigger `finalize_tournament` if last match

**Exploitable:** YES  
**Severity:** HIGH  
**Evidence:** Migration 052 lines 338-347: `GRANT EXECUTE ON FUNCTION finalize_tournament(UUID) TO authenticated` and `GRANT EXECUTE ON FUNCTION record_tournament_match_result(UUID, UUID, UUID) TO authenticated`. No `auth.uid()` checks in either function. Migration 122 revoked no tournament RPCs.

**Remediation (applied — migration 128):** Revokes `finalize_tournament`, `complete_tournament`, `start_tournament`, and `record_tournament_match_result` from `authenticated`. Admin wrappers remain accessible via service_role edge functions.

---

### BL-05: Rake Theft — Wager Rake Credited to Admin Profile Balance

**Attack path:**
1. Attacker obtains `is_admin = TRUE` on their profile
2. In `settle_escrow_with_rake`, rake distribution block: `UPDATE balances SET available_tct = available_tct + v_treasury_amount WHERE user_id = (SELECT id FROM profiles WHERE is_admin = TRUE LIMIT 1)`
3. Non-deterministic `LIMIT 1` with no ORDER BY — attacker's profile could receive all rake
4. Even without escalation: any admin's personal spendable balance receives platform rake — incorrect accounting

**Exploitable:** YES  
**Severity:** HIGH  
**Evidence:** Migration 116, lines 196-199 in `settle_escrow_with_rake`. Same pattern in migration 089 lines 197-199.

**Remediation (applied — migration 128):** Replaces admin profile credit with `vault_statistics` treasury counter update, matching the pattern used for house challenge losses. Rake accumulates in `vault_statistics.stat_name = 'treasury_balance_tct'` and is only withdrawn via the platform vault process.

---

### BL-06: House Challenge Double-Payout

**Exploitable:** NO  
**Evidence:** `complete_house_challenge` uses `SELECT ... FOR UPDATE` and checks `status = 'in_progress'`. A second call is rejected. `process-house-payout` atomically claims with `.eq("payout_status", "pending")` — already-processing attempts return 0 rows and are skipped. Migration 121 revoked direct RPC access from `authenticated`.

---

### BL-07: Tournament Prize Manipulation

**Exploitable:** NO  
**Evidence:** Prize records created by `finalize_tournament`, not users. Distribution requires `status = 'completed'`. `cancel_tournament` blocked on completed status. `entry_fee_refunded` flag prevents double-refund. `UNIQUE(tournament_id, user_id)` prevents double-registration. BL-04 fix closes premature-finalization path.

---

### BL-08: `cancel_pending_game` on Active Game

**Exploitable:** NO  
**Evidence:** Migration 119 `cancel_pending_game` checks `status NOT IN ('pending', 'ready_white', 'ready_black')` and returns error "Game is already active or completed."

---

### BL-09: Balance Inflation via `admin_adjust_balance`

**Exploitable:** NO — Migration 122 line 44 explicitly revokes from `authenticated`. Internal `is_user_admin()` check provides defense-in-depth.

---

### BL-10: TCT Rate Manipulation via Indirect Path

**Exploitable:** NO — Migration 122 revokes `admin_update_tct_rates` from `authenticated`. `platform_config` write access revoked from `authenticated` in migration 122. Migration 118 added `is_user_admin()` check as defense-in-depth.

---

### Remediation Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/128_business_logic_fixes.sql` | Revokes settlement/game-result/tournament RPCs from `authenticated`; adds caller-ownership to balance lock/unlock; fixes rake treasury crediting to use `vault_statistics` instead of admin profile balance |

---

## Supply Chain, Configuration, and Secrets Audit

**Date:** 2026-06-01  
**Scope:** `package.json` dependencies, `bun.lock`, committed secrets scan, `.env.example`, `app.json`, `eas.json`, `supabase/config.toml`, build scripts, admin email constants, Expo ownership fields, deep-link configuration  
**Method:** Full file reads and targeted grep for credentials, typosquatting, postinstall hooks, non-npm registry sources, and rogue developer artifacts

---

---

## Adversarial Audit — New Critical Findings (2026-06-01)

The following findings were discovered in a follow-up adversarial audit and have been applied as of this date.

---

### NEW-CRIT-01 — ✅ Fixed: `house-entry-fee` Has No Wallet Ownership Check

**File:** `supabase/functions/house-entry-fee/index.ts`

The function accepted a `userAddress` parameter from the request body and used it directly in `permit()` + `transferFrom()` calls without verifying it belonged to the authenticated user. An attacker with a valid permit signature (replayed, phished, or repurposed) could substitute any victim's address and drain their wallet via the gasless relay.

**Fix applied:** After JWT verification, the authenticated user's `wallet_address` is now loaded from the `profiles` table and compared case-insensitively against the request `userAddress`. A `403 Forbidden` is returned on mismatch — before any on-chain operation is attempted.

---

### NEW-CRIT-02 — ✅ Fixed: `admin_grant_super_admin` Callable by Any Authenticated User

**Files:** `supabase/migrations/098_grant_super_admin_function.sql`, `supabase/migrations/129_fix_super_admin_escalation.sql`

Migration 098 granted `EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT)` to `authenticated`. Any authenticated user could call this function with arbitrary UUIDs — including passing their own user ID as `p_target_user_id` — to attempt super-admin escalation. While the function internally calls `is_user_super_admin(p_super_admin_id)`, exposing the function to all authenticated users is an unnecessary attack surface and the internal check has historically been bypassed when SECURITY DEFINER functions are accessible client-side.

**Fix applied (migration 129):** `REVOKE EXECUTE` on `admin_grant_super_admin(UUID, UUID, TEXT)` from `authenticated` and `anon`. `GRANT` to `service_role` only. Also revoked `admin_revoke_admin(UUID, UUID, TEXT)` (the super-admin demotion function from migration 097, which had the same exposure) from `authenticated`/`anon`, granted to `service_role` only. No separate `admin_revoke_super_admin` function exists in this codebase — the demotion logic lives in `admin_revoke_admin`.

---

### NEW-HIGH-01 — ✅ Fixed: Backdoor Vault Address in `init_test_vault.sql`

**File:** `supabase/init_test_vault.sql`

The file seeded `platform_vault` with `0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b` — the rogue developer's address, identical to the one found in the `relay-transaction` fallback (CRIT-01). If this file were ever re-run against the live database (e.g. during a restore or re-seed), all platform funds would be routed to the attacker's wallet.

**Fix applied:**
1. Replaced the hardcoded address with `0x0000000000000000000000000000000000000000` with a prominent `-- REPLACE WITH YOUR VAULT ADDRESS BEFORE RUNNING` comment.
2. Added a `RAISE EXCEPTION` safety guard at the top of the DO block that aborts execution if the zero-address placeholder is still present, preventing accidental deployment.

**Required manual action:** Replace `0x0000000000000000000000000000000000000000` in `supabase/init_test_vault.sql` with your real vault address before running it.

---

### NEW-SC-02 — ✅ Fixed: `app.json` Expo Project Owned by Rogue Developer

**File:** `app.json`

Three fields tied the app to the rogue developer's Expo account (`byronoc`):
- `"owner": "byronoc"` — rogue account controls OTA update publishing
- `"extra.eas.projectId": "216831c6-7862-477b-9726-79df6ef97c75"` — project registered under `byronoc`
- `"updates.url": "https://u.expo.dev/216831c6-7862-477b-9726-79df6ef97c75"` — OTA update endpoint under rogue account

The rogue developer could publish a malicious OTA (JavaScript) update that silently installs into all running app instances, providing full access to user Supabase auth tokens and embedded wallet key material.

**Fix applied:**
- `"owner"` → `"REPLACE_WITH_YOUR_EXPO_USERNAME"`
- `"extra.eas.projectId"` → `"REPLACE_WITH_YOUR_EAS_PROJECT_ID"`
- `"updates.url"` → `"https://u.expo.dev/REPLACE_WITH_YOUR_EAS_PROJECT_ID"`

**Required manual actions (SC-02 — manual action still required):**
1. Transfer or delete the `byronoc/216831c6-7862-477b-9726-79df6ef97c75` EAS project in the Expo dashboard.
2. Create a new EAS project under your own account; obtain the new project UUID.
3. Replace all three `REPLACE_WITH_YOUR_*` placeholders in `app.json` with the real values.
4. Rebuild and re-release all production builds from the new project.
5. Until step 4 is complete, consider setting `"updates": { "enabled": false }` in `app.json` to disable OTA updates and close the attack window immediately.

---

### SC-01 — CRITICAL: Rogue Developer Admin Backdoor in Admin Email Constants and Migration 061 ✅ Verified Fixed

**Severity:** CRITICAL  
**Files:**
- `constants/adminEmails.ts` — **FIXED** (verified 2026-06-01)
- `supabase/migrations/061_sync_admin_emails.sql` — **FIXED** (verified 2026-06-01)

**Fix verification (2026-06-01):**
- `byronoc123@gmail.com` and `byronoc123@protonmail.com` are NOT granted anything in migration 061.
- STEP 1 of migration 061 actively REVOKEs (`SET is_admin=FALSE, is_super_admin=FALSE`) from both rogue emails wherever they exist in the `profiles` table.
- `sync_admin_status_by_email()` returns `FALSE` for all emails (hardcoded `v_is_admin := FALSE`) until legitimate admin emails are added.
- `constants/adminEmails.ts`: both `ADMIN_EMAILS` and `SUPER_ADMIN_EMAILS` arrays are empty; TODO comments instruct the owner to populate them. No rogue emails present.
- The admin list is intentionally empty — manual configuration post-deploy is required (see Required manual actions below).

**Description:**  
`ADMIN_EMAILS` and `SUPER_ADMIN_EMAILS` were hardcoded with the rogue developer's accounts: `byronoc123@gmail.com` and `byronoc123@protonmail.com`. These lists gate all admin UI access. Migration `061_sync_admin_emails.sql` also hardcoded `UPDATE profiles SET is_admin = TRUE, is_super_admin = TRUE WHERE email IN (rogue emails)` and embedded these emails in `sync_admin_status_by_email()` (a SECURITY DEFINER function callable by authenticated users). If either account still exists in Supabase, it has persistent `is_admin = TRUE / is_super_admin = TRUE` flags — granting access to the admin panel, all user data, balance adjustments, rake settings, and the ability to grant admin to other accounts.

**Fixes applied:**
- `constants/adminEmails.ts`: both email arrays cleared; TODO comments instruct the legitimate owner to populate them.
- `supabase/migrations/061_sync_admin_emails.sql`: STEP 1 now revokes flags (`SET is_admin=FALSE, is_super_admin=FALSE`) from both rogue emails. `sync_admin_status_by_email()` returns `FALSE` until legitimate emails are added.

**Required manual actions (source fix alone is insufficient):**
1. Run the updated migration 061 against the live Supabase database to revoke flags from existing profile rows.
2. Populate `constants/adminEmails.ts` with your own email(s), update the `sync_admin_status_by_email()` function, and re-run migration 061.
3. Search for any other references: `SELECT proname FROM pg_proc WHERE prosrc ILIKE '%byronoc%';`

---

### SC-02 — CRITICAL: Expo App Owned by Rogue Developer Expo Account (`byronoc`) — ✅ Placeholders applied; manual transfer still required

**Severity:** CRITICAL  
**File:** `app.json`, lines 118–125

**Description:**  
Three fields tie the app to the rogue developer's Expo account:

```json
"owner": "byronoc",
"updates": { "url": "https://u.expo.dev/216831c6-7862-477b-9726-79df6ef97c75" },
"extra": { "eas": { "projectId": "216831c6-7862-477b-9726-79df6ef97c75" } }
```

EAS project `216831c6-7862-477b-9726-79df6ef97c75` is registered under the `byronoc` Expo account. If the rogue developer still controls that account, they can publish an OTA update to this project that all installed app instances will automatically download and execute — providing full JavaScript code execution in the context of every user's session (access to Supabase auth tokens and embedded wallet private key material).

**Required actions:**
1. Immediately transfer the project from `byronoc` to your account in the Expo dashboard, or delete it and create a new project.
2. Update `app.json` `owner`, `extra.eas.projectId`, and `updates.url` to reference your new project.
3. Rebuild and re-release all production builds.
4. If transfer is not immediately possible, set `"updates": { "enabled": false }` in `app.json` to disable OTA updates until ownership is transferred.

---

### SC-03 — MEDIUM: `package.json` Start Scripts Reference Rork CLI with Unverified Project ID

**Severity:** MEDIUM  
**File:** `package.json`, lines 6–8

**Description:**  
All three start scripts invoke `bunx rork start -p on4qgbbbix2sig4yr0h6x`. This project ID may be registered under the rogue developer's Rork account, potentially routing app traffic or tunnel connections through their infrastructure. The `@rork-ai/toolkit-sdk` dependency is also present.

**Actions:**
1. Verify whether `on4qgbbbix2sig4yr0h6x` is registered under your account at rork.com.
2. If it belongs to the rogue developer, replace start scripts with standard `expo start` commands and evaluate whether `@rork-ai/toolkit-sdk` is needed in production.

---

### SC-04 — MEDIUM: Avatar Images Served from Rogue Developer's Rork CDN

**Severity:** MEDIUM  
**File:** `contexts/AppContext.tsx`

**Description:**  
27+ avatar image URLs are sourced from `https://r2-pub.rork.com/generated-images/...` and one from `https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/`. If the rogue developer controls the underlying Rork infrastructure, they can replace these with tracking pixels, log user IP addresses, or serve malicious content.

**Action:** Download all avatar images and re-host on your own CDN (Supabase Storage or Cloudflare R2). Update URL arrays in `contexts/AppContext.tsx`.

---

### SC-05 — INFO: No Dependency Supply Chain Anomalies

All 96 production + 14 dev dependencies reviewed. No typosquatting, inappropriate packages, `postinstall`/`preinstall` hooks, or non-npm registry sources found. All lock file entries resolve to `registry.npmjs.org`. Add `npm audit` / `bun audit` to CI.

---

### SC-06 — INFO: No Hardcoded Production Secrets in Committed Files

Full grep scan: no `sk_live_*`, `pk_live_*`, `whsec_*`, long `Bearer` tokens, Ethereum private keys, or real API keys found. All sensitive references are `process.env.*` / `Deno.env.get()` reads. `.env.example` contains only placeholders.

---

### SC-07 — INFO: `supabase/config.toml` Correctly Scoped to Local Dev

Uses `project_id = "rork-treasure-chess-app"` (local identifier), `site_url = "http://127.0.0.1:3000"`, all auth providers disabled, no external webhook URLs, all secrets use `env(...)` references. No production credentials committed.

---

### Supply Chain Remediation Priority

| Priority | Finding | Action | Effort |
|----------|---------|--------|--------|
| CRITICAL | SC-01 | Run updated migration 061 on live DB; add your admin email(s) | Immediate — 5 min |
| CRITICAL | SC-02 | Transfer EAS/Expo project from `byronoc`; update `app.json`; rebuild | Urgent — 1–2 hrs |
| MEDIUM | SC-03 | Verify Rork project `on4qgbbbix2sig4yr0h6x` ownership; replace scripts if needed | This week |
| MEDIUM | SC-04 | Re-host avatar images on your own CDN | This sprint |
| INFO | SC-05–07 | Add `npm audit` to CI | Ongoing |
