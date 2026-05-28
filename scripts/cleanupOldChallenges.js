/**
 * Cleanup Old Challenges Script
 *
 * This script deletes all old challenges that are:
 * - Cancelled
 * - Declined
 * - Expired (past their expires_at time)
 * - Accepted (already have a game_id, no longer needed)
 *
 * Usage: node scripts/cleanupOldChallenges.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("=".repeat(60));
  console.log("CLEANUP OLD CHALLENGES");
  console.log("=".repeat(60));
  console.log("");

  // First, let's see what we have
  const { data: allChallenges, error: fetchError } = await supabase
    .from("challenges")
    .select("id, status, room_code, wager_tct, expires_at, created_at, game_id");

  if (fetchError) {
    console.error("Error fetching challenges:", fetchError);
    process.exit(1);
  }

  console.log(`Total challenges in database: ${allChallenges.length}`);
  console.log("");

  // Group by status
  const byStatus = {};
  for (const c of allChallenges) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }
  console.log("By status:");
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("");

  // Find challenges to delete
  const now = new Date().toISOString();
  const toDelete = allChallenges.filter(c =>
    c.status === "cancelled" ||
    c.status === "declined" ||
    c.status === "expired" ||
    (c.status === "accepted" && c.game_id) || // Accepted challenges with game already created
    (c.expires_at && c.expires_at < now && c.status === "pending") // Expired pending challenges
  );

  console.log(`Challenges to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log("\n✅ No old challenges to clean up!");
    return;
  }

  console.log("\nChallenges to be deleted:");
  console.log("-".repeat(60));
  for (const c of toDelete) {
    const expired = c.expires_at && c.expires_at < now ? " (EXPIRED)" : "";
    console.log(`  ${c.id.slice(0, 8)}... | ${c.status}${expired} | ${c.room_code || 'N/A'} | ${c.wager_tct} TCT`);
  }
  console.log("-".repeat(60));

  // Confirmation
  console.log("\n⚠️  ABOUT TO DELETE THESE CHALLENGES");
  console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Delete in batches
  const idsToDelete = toDelete.map(c => c.id);

  console.log("\nDeleting challenges...");

  const { error: deleteError, count } = await supabase
    .from("challenges")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    console.error("Error deleting challenges:", deleteError);
    process.exit(1);
  }

  console.log(`\n✅ Deleted ${toDelete.length} old challenges`);

  // Verify
  const { data: remaining } = await supabase
    .from("challenges")
    .select("id, status");

  console.log(`\nRemaining challenges: ${remaining?.length || 0}`);
  if (remaining && remaining.length > 0) {
    const remainingByStatus = {};
    for (const c of remaining) {
      remainingByStatus[c.status] = (remainingByStatus[c.status] || 0) + 1;
    }
    console.log("By status:");
    for (const [status, count] of Object.entries(remainingByStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  }
}

main().catch(error => {
  console.error("Script failed:", error);
  process.exit(1);
});
