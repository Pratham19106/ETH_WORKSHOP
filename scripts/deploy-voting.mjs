import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("=================================================");
  console.log("  DEPLOY VJTI WORKSHOP VOTING TO BASE SEPOLIA");
  console.log("=================================================");

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
    console.error("ERROR: No PRIVATE_KEY found in env or blockchain/.env");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) {
    privateKey = `0x${privateKey}`;
  }

  const rpcUrl = process.env.VITE_ALCHEMY_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/alch_4v5zXSq8-_WiQ_zfPmc1G";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deployer Address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer Balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("\n❌ INSUFFICIENT FUNDS: Deployer address has 0.0 ETH on Base Sepolia.");
    process.exit(1);
  }

  // Load contract artifact
  const artifactPath = path.resolve(__dirname, "../blockchain/out/VJTIWorkshopVoting.sol/VJTIWorkshopVoting.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found at:", artifactPath);
    console.error("Please run: forge build");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const { abi, bytecode } = artifact;

  console.log("\nDeploying VJTIWorkshopVoting contract...");
  const factory = new ethers.ContractFactory(abi, bytecode.object, wallet);
  const contract = await factory.deploy();
  console.log("Waiting for deployment transaction:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("\n=================================================");
  console.log("🎉 VJTI WORKSHOP VOTING DEPLOYED SUCCESSFULLY!");
  console.log("Contract Address:", deployedAddress);
  console.log("=================================================");
  console.log("\nAdd this address to your frontend/.env:");
  console.log(`VITE_VOTING_CONTRACT_ADDRESS=${deployedAddress}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});

