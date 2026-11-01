#!/usr/bin/env node

/**
 * High-speed automated batch funding script for workshop attendees.
 * Reads all candidate addresses from Supabase and transfers Base Sepolia ETH
 * directly from the deployer private key (NO MetaMask clicking needed!).
 *
 * Usage:
 *   node scripts/batch-fund-wallets.mjs [amountPerWallet]
 *   node scripts/batch-fund-wallets.mjs 0.001
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read Supabase config
const SUPABASE_URL = "https://uxlldylwjzjvrzhzpchk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VHfCuwbThCR0hO_kau52YQ_HlxMGaRk";

async function main() {
  console.log("==================================================");
  console.log("  AUTOMATED BATCH WALLET FUNDER (BASE SEPOLIA)   ");
  console.log("==================================================");

  // 1. Read private key from blockchain/.env
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    const envPath = path.resolve(__dirname, "../blockchain/.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/PRIVATE_KEY=([^\r\n]+)/);
      if (match) privateKey = match[1].trim();
    }
  }

  if (!privateKey) {
    console.error("❌ ERROR: No PRIVATE_KEY found in blockchain/.env");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) {
    privateKey = `0x${privateKey}`;
  }

  // 2. Connect to Base Sepolia
  const rpcUrl = process.env.VITE_ALCHEMY_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/alch_4v5zXSq8-_WiQ_zfPmc1G";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const adminWallet = new ethers.Wallet(privateKey, provider);

  console.log("Funder Admin Address:", adminWallet.address);

  const balance = await provider.getBalance(adminWallet.address);
  console.log("Admin Base Sepolia Balance:", ethers.formatEther(balance), "ETH");

  const amountPerWallet = process.argv[2] || "0.001"; // 0.001 ETH is enough for 20+ transactions on Base
  const fundValue = ethers.parseEther(amountPerWallet);

  // 3. Fetch candidates from Supabase
  console.log("\nFetching registered attendees from Supabase...");
  const { createClient } = await import("../frontend/node_modules/@supabase/supabase-js/dist/main/index.js").catch(async () => {
    return await import("@supabase/supabase-js");
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, name, reg_no, wallet_address");

  if (error) {
    console.error("❌ Failed to fetch candidates from Supabase:", error.message);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    console.log("⚠️ No candidates currently registered in the database.");
    process.exit(0);
  }

  console.log(`Found ${candidates.length} registered candidate wallets.\n`);

  const totalRequired = fundValue * BigInt(candidates.length);
  console.log(`Allocation: ${amountPerWallet} ETH per wallet.`);
  console.log(`Total Required: ~${ethers.formatEther(totalRequired)} ETH (+ gas fees)`);

  if (balance < totalRequired) {
    console.error("\n❌ INSUFFICIENT ADMIN BALANCE:");
    console.error(`Admin has ${ethers.formatEther(balance)} ETH, but needs at least ${ethers.formatEther(totalRequired)} ETH.`);
    console.error(`Please bridge or acquire Base Sepolia ETH before batch funding.`);
    process.exit(1);
  }

  // 4. Batch Dispatch Transactions with sequential nonce management
  let currentNonce = await provider.getTransactionCount(adminWallet.address, "latest");
  let fundedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const addr = c.wallet_address;

    if (!addr || !addr.startsWith("0x") || addr.length !== 42) {
      console.log(`[SKIP] Candidate ${c.name} (${c.reg_no}) has invalid address: ${addr}`);
      skippedCount++;
      continue;
    }

    // Check candidate balance - skip if they already have sufficient gas
    const candidateBal = await provider.getBalance(addr);
    if (candidateBal >= fundValue) {
      console.log(`[ALREADY FUNDED] ${c.name} (${addr.slice(0, 6)}...${addr.slice(-4)}) has ${ethers.formatEther(candidateBal)} ETH. Skipping.`);
      skippedCount++;
      continue;
    }

    try {
      console.log(`[FUNDING ${i + 1}/${candidates.length}] Sending ${amountPerWallet} ETH to ${c.name} (${c.reg_no})...`);
      const tx = await adminWallet.sendTransaction({
        to: addr,
        value: fundValue,
        nonce: currentNonce++,
        gasLimit: 21000n,
      });

      console.log(`  -> Sent! Tx: ${tx.hash}`);
      await tx.wait(1);
      fundedCount++;
    } catch (txErr) {
      console.error(`  ❌ Failed to fund ${c.name}:`, txErr.message);
      // Re-fetch nonce in case of mismatch
      currentNonce = await provider.getTransactionCount(adminWallet.address, "latest");
    }
  }

  console.log("\n==================================================");
  console.log(`🎉 Batch Funding Complete!`);
  console.log(`- Successfully Funded: ${fundedCount} wallets`);
  console.log(`- Skipped (Already had gas or invalid): ${skippedCount} wallets`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("Batch funding script error:", err);
  process.exit(1);
});

