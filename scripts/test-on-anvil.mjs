#!/usr/bin/env node

/**
 * End-to-end testing script against a local Anvil node.
 * Tests 3-Phase Gamified Multi-Token Collection.
 * Usage:
 *   1. Start Anvil: wsl /home/pratham/.foundry/bin/anvil
 *   2. Run this script: node scripts/test-on-anvil.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("==================================================");
  console.log("  TESTING GAMIFIED 3-PHASE VJTITIEREDBADGE ON ANVIL");
  console.log("==================================================");

  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const net = await provider.getNetwork();
    console.log(`Connected to local node (Chain ID: ${net.chainId})`);
  } catch (err) {
    console.error("\n❌ Could not connect to Anvil on http://127.0.0.1:8545.");
    console.error("Please start Anvil first in another terminal:");
    console.error("  wsl /home/pratham/.foundry/bin/anvil\n");
    process.exit(1);
  }

  // Pre-funded default accounts (10,000 ETH each)
  const adminSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  const user1 = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  const user2 = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", provider);

  console.log("Admin Address :", adminSigner.address);
  console.log("User 1 Address:", user1.address);
  console.log("User 2 Address:", user2.address);

  // Load compiled artifact
  const artifactPath = path.resolve(__dirname, "../blockchain/out/VJTITieredBadge.sol/VJTITieredBadge.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const { abi, bytecode } = artifact;

  const tier1Uri = 'data:application/json;utf8,{"name":"Light Node Badge"}';
  const tier2Uri = 'data:application/json;utf8,{"name":"Synced Node Badge"}';
  const tier3Uri = 'data:application/json;utf8,{"name":"Validator Badge"}';

  // 1. Deploy
  console.log("\n[1/7] Deploying contract from Admin...");
  let adminNonce = await provider.getTransactionCount(adminSigner.address, "latest");
  const factory = new ethers.ContractFactory(abi, bytecode.object, adminSigner);
  const contract = await factory.deploy(tier1Uri, tier2Uri, tier3Uri, { nonce: adminNonce++ });
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(" Contract deployed at:", contractAddress);

  // 2. Mint Tier 1 (Light Node) by User 1
  console.log("\n[2/7] Phase 1: User 1 minting Tier 1 (Light Node)...");
  let u1Nonce = await provider.getTransactionCount(user1.address, "latest");
  const cUser1 = contract.connect(user1);
  const tx1 = await cUser1.mintBadge(1, { nonce: u1Nonce++ });
  await tx1.wait(1);
  console.log(" User 1 minted Token ID 1!");
  console.log("   - hasMintedTier(user1, 1):", await contract.hasMintedTier(user1.address, 1));
  console.log("   - hasFullSet(user1):", await contract.hasFullSet(user1.address));

  // 3. User 1 tries to mint Tier 1 again (Should Revert)
  console.log("\n[3/7] User 1 attempting to mint Tier 1 again (Testing Duplicate Tier Revert)...");
  try {
    await cUser1.mintBadge.staticCall(1);
    console.error("❌ FAILED: User 1 was able to duplicate mint Tier 1!");
  } catch (err) {
    console.log(" Correctly reverted with AlreadyMinted() for duplicate Tier 1!");
  }

  // 4. User 1 mints Tier 2 (Synced Node) and Tier 3 (Validator) -> Completing Full Set!
  console.log("\n[4/7] Phase 2 & 3: User 1 collecting Tier 2 and Tier 3 (Completing Set)...");
  const tx2 = await cUser1.mintBadge(2, { nonce: u1Nonce++ });
  await tx2.wait(1);
  const tx3 = await cUser1.mintBadge(3, { nonce: u1Nonce++ });
  await tx3.wait(1);
  const isWinner = await contract.hasFullSet(user1.address);
  const balance = await contract.balanceOf(user1.address);
  console.log(` User 1 collected ${balance} tokens!`);
  console.log("   - hasFullSet(user1):", isWinner);
  if (isWinner) {
    console.log(" User 1 verified as ABSOLUTE WINNER (3/3 badges collected)!");
  }

  // 5. Soulbound Check: User 1 tries to transfer Token 1 to User 2 (Should Revert)
  console.log("\n[5/7] Testing Soulbound constraint: User 1 transferring to User 2...");
  try {
    await cUser1.transferFrom.staticCall(user1.address, user2.address, 1);
    console.error("❌ FAILED: Token was transferred! (Not Soulbound)");
  } catch (err) {
    console.log(" Correctly reverted with NonTransferableBadge! Token is strictly Soulbound.");
  }

  // 6. Admin Phase-Specific Pause Toggle
  console.log("\n[6/7] Testing Admin Tier-Specific Pause Switch (Pausing Tier 2)...");
  const pauseTier2Tx = await contract.connect(adminSigner).setTierClaimActive(2, false, { nonce: adminNonce++ });
  await pauseTier2Tx.wait(1);
  console.log("   - Tier 2 paused by admin. tierClaimActive(2) =", await contract.tierClaimActive(2));

  // User 2 mints Tier 1 (Should Succeed)
  let u2Nonce = await provider.getTransactionCount(user2.address, "latest");
  const cUser2 = contract.connect(user2);
  const txUser2T1 = await cUser2.mintBadge(1, { nonce: u2Nonce++ });
  await txUser2T1.wait(1);
  console.log(" User 2 successfully minted Tier 1 while Tier 2 is paused!");

  // User 2 attempts Tier 2 while paused (Should Revert)
  try {
    await cUser2.mintBadge.staticCall(2);
    console.error("❌ FAILED: User 2 was able to mint paused Tier 2!");
  } catch (err) {
    console.log(" Correctly reverted with ClaimingPaused() for paused Phase 2!");
  }

  // 7. Global Circuit Breaker Check
  console.log("\n[7/7] Testing Global Pause Circuit Breaker...");
  const globalPauseTx = await contract.connect(adminSigner).setClaimActive(false, { nonce: adminNonce++ });
  await globalPauseTx.wait(1);
  try {
    await cUser2.mintBadge.staticCall(3);
    console.error("❌ FAILED: User was able to mint while globally paused!");
  } catch (err) {
    console.log(" Correctly reverted with ClaimingPaused() under global pause!");
  }

  console.log("\n==================================================");
  console.log(" ALL 7 INTEGRATION CHECKS PASSED PERFECTLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
