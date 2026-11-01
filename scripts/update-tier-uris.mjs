#!/usr/bin/env node

/**
 * Updates Tier Metadata URIs on the deployed VJTITieredBadge contract.
 * NO REDEPLOYMENT NEEDED!
 * Calls setTierURI(tier, newURI) on Base Sepolia.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("==================================================");
  console.log("  UPDATE TIER METADATA URIs ON BASE SEPOLIA       ");
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

  // 2. Read deployed contract address from frontend/.env
  let contractAddress = process.env.VITE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    const envPath = path.resolve(__dirname, "../frontend/.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/VITE_CONTRACT_ADDRESS=([^\r\n]+)/);
      if (match) contractAddress = match[1].trim();
    }
  }

  if (!contractAddress || !contractAddress.startsWith("0x")) {
    contractAddress = "0x7699D3DE98B6469f6B76BDa6493ec5E5Cea3Ae89";
  }

  console.log("Contract Address:", contractAddress);

  // 3. Connect to Base Sepolia
  const rpcUrl = process.env.VITE_ALCHEMY_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/alch_4v5zXSq8-_WiQ_zfPmc1G";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Admin Wallet Address:", wallet.address);

  // 4. Contract interface
  const abi = [
    "function owner() view returns (address)",
    "function tierURIs(uint8) view returns (string)",
    "function setTierURI(uint8 tier, string memory uri) external"
  ];

  const contract = new ethers.Contract(contractAddress, abi, wallet);

  const owner = await contract.owner();
  console.log("Contract Owner:", owner);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error("❌ ERROR: Wallet in blockchain/.env is not the owner of this contract!");
    console.error(`Owner is: ${owner}`);
    process.exit(1);
  }

  // 5. Updated Valid JSON Metadata URIs
  const newURIs = {
    1: 'data:application/json;utf8,{"name":"EthVJTI\'s Light Node","description":"Granted for attending the EthVjti\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiffgphnilox6jofqnlfcgn6manonvypj2dh3ofotwdd2ruxljwlfi","attributes":[{"trait_type":"Tier","value":"Light Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}',
    2: 'data:application/json;utf8,{"name":"EthVJTI\'s Synced Node","description":"Granted for active participation and two-way interaction at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiegvbxrksgrbmfy4ty6dmwhuduqmsfustnwjrvcppt622uf4bzp6i","attributes":[{"trait_type":"Tier","value":"Synced Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}',
    3: 'data:application/json;utf8,{"name":"EthVJTI\'s Validator","description":"Granted for exceptional contributions and insightful solutions at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeig355vegdvq2wueex547wbei3tlpglax5houu32grukgvalgrv7by","attributes":[{"trait_type":"Tier","value":"Validator"},{"trait_type":"Event","value":"Web3 Genesis"}]}'
  };

  let nonce = await provider.getTransactionCount(wallet.address, "latest");

  for (let tier = 1; tier <= 3; tier++) {
    console.log(`\nUpdating Tier ${tier} URI on-chain...`);
    const tx = await contract.setTierURI(tier, newURIs[tier], { nonce: nonce++ });
    console.log(`  Tx Hash: ${tx.hash}`);
    console.log(`  Explorer: https://sepolia.basescan.org/tx/${tx.hash}`);
    await tx.wait(1);
    console.log(`  ✅ Tier ${tier} URI successfully updated on-chain!`);
  }

  console.log("\n==================================================");
  console.log("🎉 SUCCESS! ALL TIER URIs UPDATED ON-CHAIN!");
  console.log("==================================================");

  // Verification read
  for (let tier = 1; tier <= 3; tier++) {
    const verified = await contract.tierURIs(tier);
    console.log(`\nVerified Tier ${tier} on-chain:`);
    console.log(`  ${verified}`);
  }
}

main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});

