#!/usr/bin/env node

/**
 * Automatically bridges Sepolia ETH to Base Sepolia.
 * Uses the official Base Sepolia L1StandardBridge: 0xfd0Bf71F60660E2f608ed56e1659C450eB113120
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("==================================================");
  console.log("  BRIDGE ETHEREUM SEPOLIA ETH -> BASE SEPOLIA");
  console.log("==================================================");

  // Read private key from blockchain/.env
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

  // 1. Ethereum Sepolia Provider
  const l1Rpc = "https://ethereum-sepolia-rpc.publicnode.com";
  const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
  const l1Wallet = new ethers.Wallet(privateKey, l1Provider);

  // 2. Base Sepolia Provider
  const l2Rpc = "https://sepolia.base.org";
  const l2Provider = new ethers.JsonRpcProvider(l2Rpc);

  console.log("Wallet Address:", l1Wallet.address);

  const l1Balance = await l1Provider.getBalance(l1Wallet.address);
  const l2BalanceBefore = await l2Provider.getBalance(l1Wallet.address);

  console.log("Ethereum Sepolia Balance (L1):", ethers.formatEther(l1Balance), "ETH");
  console.log("Base Sepolia Balance (L2)    :", ethers.formatEther(l2BalanceBefore), "ETH");

  if (l1Balance < ethers.parseEther("0.1")) {
    console.error("\n❌ INSUFFICIENT ETHEREUM SEPOLIA ETH.");
    console.error(`Please make sure ${l1Wallet.address} has at least 0.1 Sepolia ETH.`);
    process.exit(1);
  }

  // Amount to bridge: default 0.5 ETH (or pass via command line arg)
  const amountToBridge = process.argv[2] || "0.5";
  const bridgeValue = ethers.parseEther(amountToBridge);

  console.log(`\nInitiating bridge of ${amountToBridge} ETH from Sepolia to Base Sepolia...`);

  // Official Base Sepolia L1 Standard Bridge on Ethereum Sepolia
  const L1_BRIDGE_ADDRESS = "0xfd0Bf71F60660E2f608ed56e1659C450eB113120";
  const bridgeAbi = [
    "function bridgeETH(uint32 _minGasLimit, bytes calldata _extraData) external payable"
  ];

  const bridgeContract = new ethers.Contract(L1_BRIDGE_ADDRESS, bridgeAbi, l1Wallet);

  // Call bridgeETH(200000, "0x", { value })
  const tx = await bridgeContract.bridgeETH(200000, "0x", { value: bridgeValue });
  console.log("Transaction broadcasted on Ethereum Sepolia!");
  console.log("Tx Hash:", tx.hash);
  console.log("Explorer:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log("Waiting for L1 confirmation...");

  await tx.wait(1);
  console.log("\n✅ L1 Deposit Confirmed!");
  console.log("Waiting for Base Sepolia (L2) to receive the funds (~1-2 minutes)...");

  // Poll Base Sepolia balance until it increases
  let attempts = 0;
  while (attempts < 60) {
    await new Promise((r) => setTimeout(r, 5000));
    attempts++;
    const l2BalanceAfter = await l2Provider.getBalance(l1Wallet.address);
    if (l2BalanceAfter > l2BalanceBefore) {
      console.log("\n==================================================");
      console.log("🎉 SUCCESS! Funds Arrived on Base Sepolia!");
      console.log("New Base Sepolia Balance:", ethers.formatEther(l2BalanceAfter), "ETH");
      console.log("Base Sepolia Explorer   :", `https://sepolia.basescan.org/address/${l1Wallet.address}`);
      console.log("==================================================");
      console.log("\nYou can now deploy your contracts:");
      console.log("  node scripts/deploy-voting.mjs");
      console.log("  node scripts/deploy-base-sepolia.mjs\n");
      return;
    }
    process.stdout.write(`Waiting for L2 relay... (${attempts * 5}s elapsed)\r`);
  }

  console.log("\nDeposit has been submitted to the bridge. It should arrive on Base Sepolia shortly.");
  console.log(`Check your balance at: https://sepolia.basescan.org/address/${l1Wallet.address}`);
}

main().catch((err) => {
  console.error("Bridge failed:", err);
  process.exit(1);
});

