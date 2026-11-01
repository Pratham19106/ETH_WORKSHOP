import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "../frontend/node_modules/ethers/lib.esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("=================================================");
  console.log("  DEPLOY VJTI TIERED BADGE TO BASE SEPOLIA");
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
    console.error(`Please send ~0.002 Base Sepolia ETH to: ${wallet.address}`);
    console.error("Or obtain testnet ETH from a Base Sepolia faucet (e.g. faucet.quicknode.com/base/sepolia or cloud.google.com/application/web3/faucet/ethereum/sepolia).");
    process.exit(1);
  }

  // Load contract artifact
  const artifactPath = path.resolve(__dirname, "../blockchain/out/VJTITieredBadge.sol/VJTITieredBadge.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found at:", artifactPath);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode.object;

  const tier1Uri = 'data:application/json;utf8,{"name":"EthVJTI\'s Light Node","description":"Granted for attending the EthVjti\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiffgphnilox6jofqnlfcgn6manonvypj2dh3ofotwdd2ruxljwlfi","attributes":[{"trait_type":"Tier","value":"Light Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}';
  const tier2Uri = 'data:application/json;utf8,{"name":"EthVJTI\'s Synced Node","description":"Granted for active participation and two-way interaction at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiegvbxrksgrbmfy4ty6dmwhuduqmsfustnwjrvcppt622uf4bzp6i","attributes":[{"trait_type":"Tier","value":"Synced Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}';
  const tier3Uri = 'data:application/json;utf8,{"name":"EthVJTI\'s Validator","description":"Granted for exceptional contributions and insightful solutions at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeig355vegdvq2wueex547wbei3tlpglax5houu32grukgvalgrv7by","attributes":[{"trait_type":"Tier","value":"Validator"},{"trait_type":"Event","value":"Web3 Genesis"}]}';

  console.log("\nDeploying VJTITieredBadge contract to Base Sepolia...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(tier1Uri, tier2Uri, tier3Uri);

  console.log("Tx Hash:", contract.deploymentTransaction()?.hash);
  console.log("Waiting for confirmation...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n=================================================");
  console.log("🎉 SUCCESS! Contract Deployed!");
  console.log("Contract Address:", contractAddress);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${contractAddress}`);
  console.log("=================================================");

  // Auto-update frontend/.env
  const frontendEnvPath = path.resolve(__dirname, "../frontend/.env");
  if (fs.existsSync(frontendEnvPath)) {
    let envContent = fs.readFileSync(frontendEnvPath, "utf8");
    if (envContent.includes("VITE_CONTRACT_ADDRESS=")) {
      envContent = envContent.replace(/VITE_CONTRACT_ADDRESS=.*/, `VITE_CONTRACT_ADDRESS=${contractAddress}`);
    } else {
      envContent += `\nVITE_CONTRACT_ADDRESS=${contractAddress}\n`;
    }
    fs.writeFileSync(frontendEnvPath, envContent);
    console.log("Updated frontend/.env with new contract address.");
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});

