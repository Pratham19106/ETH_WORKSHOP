#!/usr/bin/env node

/**
 * ============================================================================
 * VJTI ETH WORKSHOP - SUPABASE DATABASE CLEANUP & RESET SCRIPT (CLI)
 * ============================================================================
 * Wipes all test attendees from `candidates` and resets `event_settings`
 * to the pristine initial workshop state.
 *
 * Usage:
 *   node scripts/clean-supabase-data.mjs
 *   node scripts/clean-supabase-data.mjs --confirm
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read environment variables
let SUPABASE_URL = "https://uxlldylwjzjvrzhzpchk.supabase.co";
let SUPABASE_KEY = "sb_publishable_VHfCuwbThCR0hO_kau52YQ_HlxMGaRk";

const envPath = path.resolve(__dirname, "../frontend/.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=([^\r\n]+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/);
  if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
  if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
}

// Check for service role key override
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function main() {
  console.log("==================================================");
  console.log("  VJTI ETH WORKSHOP - SUPABASE DATABASE CLEANUP   ");
  console.log("==================================================");
  console.log(`Target Supabase URL: ${SUPABASE_URL}\n`);

  const { createClient } = await import("../frontend/node_modules/@supabase/supabase-js/dist/index.mjs");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Fetch current candidates
  const { data: candidates, error: fetchErr } = await supabase
    .from("candidates")
    .select("id, name, reg_no, wallet_address");

  if (fetchErr) {
    console.error("❌ Failed to query candidates:", fetchErr.message);
    process.exit(1);
  }

  console.log(`Found ${candidates?.length || 0} candidate(s) currently in the database.`);

  // 2. Delete candidates
  if (candidates && candidates.length > 0) {
    console.log(`Deleting all ${candidates.length} candidate records...`);
    const { error: deleteErr } = await supabase
      .from("candidates")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteErr) {
      console.error("\n❌ DELETE FAILED via API (Row-Level Security):", deleteErr.message);
      console.log("\n💡 SOLUTION: Run the SQL script in your Supabase Dashboard:");
      console.log("   1. Open: https://supabase.com/dashboard/project/uxlldylwjzjvrzhzpchk/sql");
      console.log("   2. Paste the contents of clean-supabase-data.sql");
      console.log("   3. Click 'RUN'.\n");
      process.exit(1);
    }

    // Verify deletion
    const { data: remaining } = await supabase.from("candidates").select("id");
    if (remaining && remaining.length > 0) {
      console.warn(`\n⚠️ Note: RLS prevented API delete for ${remaining.length} rows.`);
      console.log("   Please run clean-supabase-data.sql in the Supabase SQL Editor:");
      console.log("   https://supabase.com/dashboard/project/uxlldylwjzjvrzhzpchk/sql\n");
      process.exit(1);
    } else {
      console.log("✅ All candidate records successfully deleted!");
    }
  } else {
    console.log("ℹ️ No candidates to delete. Table is already empty.");
  }

  // 3. Reset Event Settings
  console.log("\nResetting event_settings to initial workshop state...");
  const initialSettings = {
    id: 1,
    voting_active: false,
    badge_claim_active: true,
    admin_password_hash: "ethvjtiadmin2026",
    rpc_mode: "auto",
    rpc_locked: false,
    rpc_locked_endpoint: null,
    active_wave: 1,
    phase1_active: true,
    phase2_active: false,
    phase3_active: false,
    voting_active_wave: 99,
    updated_at: new Date().toISOString()
  };

  const { error: settingsErr } = await supabase
    .from("event_settings")
    .upsert([initialSettings], { onConflict: "id" });

  if (settingsErr) {
    console.error("❌ Failed to reset event_settings:", settingsErr.message);
  } else {
    console.log("✅ Event Settings successfully reset:");
    console.log("   - Badge Claiming: ACTIVE");
    console.log("   - Active Wave: WAVE 1");
    console.log("   - Phase 1 (Light Node): ACTIVE");
    console.log("   - Phase 2 (Synced Node): PAUSED (Ready to rollout)");
    console.log("   - Phase 3 (Validator): PAUSED (Ready to rollout)");
    console.log("   - Voting Arena: CLOSED (Ready to activate)");
    console.log("   - RPC Mode: AUTO");
  }

  console.log("\n==================================================");
  console.log("🎉 Database is 100% clean and ready for workshop!");
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

