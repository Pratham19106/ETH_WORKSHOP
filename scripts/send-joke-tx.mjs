#!/usr/bin/env node

/**
 * Send a transaction with custom UTF-8 text/joke embedded in the Input Data.
 * Perfect for demonstrating Etherscan / Basescan to students!
 *
 * Usage:
 *   node scripts/send-joke-tx.mjs "Your funny joke here"
 *
 * If no argument is provided, a classic Ethereum programmer joke is sent.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const customMessage = process.argv[2] || "Why do Ethereum developers wear glasses? Because they don't C#! 👓⚡ - ETH VJTI Workshop 2026";

  console.log("=================================================");
  console.log("  SEND ETHERSCAN INPUT DATA JOKE TRANSACTION");
  console.log("=================================================");
  console.log("Message to embed:\n", `"${customMessage}"\n`);

  // 1. Read private key from blockchain/.env or environment
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
    console.error("ERROR: No PRIVATE_KEY found in env or blockchain/.env");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) {
    privateKey = `0x${privateKey}`;
  }

  // 2. Connect to provider (Base Sepolia or Sepolia)
  const rpcUrl = process.env.VITE_ALCHEMY_RPC_URL || "https://sepolia.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Sender Address :", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance        :", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("\n❌ INSUFFICIENT BALANCE: Sender address has 0 ETH on this network.");
    process.exit(1);
  }

  // 3. Convert UTF-8 string to Hex input data
  const hexData = ethers.hexlify(ethers.toUtf8Bytes(customMessage));
  console.log("Hex Data bytes :", hexData);

  // 4. Send 0 ETH transaction to self with hex data attached
  console.log("\nBroadcasting transaction to network...");
  const tx = await wallet.sendTransaction({
    to: wallet.address, // send to self to burn 0 ETH, only paying small gas
    value: 0n,
    data: hexData,
  });

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation...");
  const receipt = await tx.wait(1);
  console.log("Mined in Block  :", receipt.blockNumber);

  console.log("\n=================================================");
  console.log("🎉 SUCCESS! SHOW THIS LINK ON THE PROJECTOR:");
  console.log(`https://sepolia.basescan.org/tx/${tx.hash}`);
  console.log("=================================================");
  console.log("\nIn the block explorer:");
  console.log("  1. Scroll down to 'More Details'");
  console.log("  2. Look for 'Input Data'");
  console.log("  3. Click 'View Input As' -> Select 'UTF-8'");
  console.log("  4. Your joke appears in plain English permanently on the blockchain!\n");
}

main().catch((err) => {
  console.error("Transaction error:", err);
  process.exit(1);
});

