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
