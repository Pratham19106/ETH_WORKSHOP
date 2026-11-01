import { rpcManager, RPC_ENDPOINTS } from "../lib/rpcManager.js";

/**
 * ============================================================================
 * VJTI DECENTRAHACK ETH PORTAL - BASE SEPOLIA & CONTRACT CONFIGURATION
 * ============================================================================
 */

// Contract address on Base Sepolia (configurable via environment variable)
export const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONTRACT_ADDRESS) ||
  "0x7699D3DE98B6469f6B76BDa6493ec5E5Cea3Ae89";

// Base Sepolia Network Parameters
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
export const BASE_SEPOLIA_CHAIN_ID_DECIMAL = 84532;

export const NETWORK_CONFIG = {
  chainIdHex: BASE_SEPOLIA_CHAIN_ID_HEX,
  chainIdDecimal: BASE_SEPOLIA_CHAIN_ID_DECIMAL,
  chainName: "Base Sepolia",
  // Dynamic getter so reads always reflect the active / locked RPC endpoint
  get rpcUrl() {
    return rpcManager.getActiveRpcUrl();
  },
  // URL to inject into wallet when adding network (honors lock-in setting)
  get walletRpcUrl() {
    return rpcManager.getNetworkRpcUrl();
  },
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorerUrl: "https://sepolia.basescan.org",
};

// 3 Distinct Tier Configuration Data
export const BADGE_TIERS = {
  1: {
    id: 1,
    name: "Light Node",
    title: "EthVJTI\'s Light Node",
    subtitle: "Workshop Attendee Tier",
    badgeColor: "from-amber-700 via-amber-600 to-amber-900",
    borderColor: "border-amber-500/50",
    glowClass: "glow-border-gold",
    accentColor: "#F59E0B",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiffgphnilox6jofqnlfcgn6manonvypj2dh3ofotwdd2ruxljwlfi",
    metadataURI: 'data:application/json;utf8,{"name":"EthVJTI\'s Light Node","description":"Granted for attending the EthVjti\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiffgphnilox6jofqnlfcgn6manonvypj2dh3ofotwdd2ruxljwlfi","attributes":[{"trait_type":"Tier","value":"Light Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}',
    traits: [
      { trait_type: "Tier", value: "Light Node" },
      { trait_type: "Event", value: "Web3 Genesis" },
      { trait_type: "Access", value: "General Attendee" },
    ]
  },
  2: {
    id: 2,
    name: "Synced Node",
    title: "EthVJTI\'s Synced Node",
    subtitle: "Good Contributor Tier",
    badgeColor: "from-cyan-500 via-slate-400 to-cyan-800",
    borderColor: "border-cyan-400/50",
    glowClass: "glow-border-cyan",
    accentColor: "#00F0FF",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiegvbxrksgrbmfy4ty6dmwhuduqmsfustnwjrvcppt622uf4bzp6i",
    metadataURI: 'data:application/json;utf8,{"name":"EthVJTI\'s Synced Node","description":"Granted for active participation and two-way interaction at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeiegvbxrksgrbmfy4ty6dmwhuduqmsfustnwjrvcppt622uf4bzp6i","attributes":[{"trait_type":"Tier","value":"Synced Node"},{"trait_type":"Event","value":"Web3 Genesis"}]}',
    traits: [
      { trait_type: "Tier", value: "Synced Node" },
      { trait_type: "Event", value: "Web3 Genesis" },
      { trait_type: "Access", value: "Active Contributor" },
    ]
  },
  3: {
    id: 3,
    name: "Validator",
    title: "EthVJTI\'s Validator",
    subtitle: "Exceptional Contributor Tier",
    badgeColor: "from-pink-500 via-purple-600 to-yellow-500",
    borderColor: "border-pink-500/50",
    glowClass: "glow-border-magenta",
    accentColor: "#FF007A",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeig355vegdvq2wueex547wbei3tlpglax5houu32grukgvalgrv7by",
    metadataURI: 'data:application/json;utf8,{"name":"EthVJTI\'s Validator","description":"Granted for exceptional contributions and insightful solutions at the EthVJTI\'s Web3 Genesis Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafybeig355vegdvq2wueex547wbei3tlpglax5houu32grukgvalgrv7by","attributes":[{"trait_type":"Tier","value":"Validator"},{"trait_type":"Event","value":"Web3 Genesis"}]}',
    traits: [
      { trait_type: "Tier", value: "Validator" },
      { trait_type: "Event", value: "Web3 Genesis" },
      { trait_type: "Access", value: "Exceptional Interaction" },
    ]
  }
};

// ABI for VJTITieredBadge Contract
export const VJTITIEREDBADGE_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function claimActive() external view returns (bool)",
  "function tierClaimActive(uint8 tier) external view returns (bool)",
  "function hasMinted(address account) external view returns (bool)",
  "function hasMintedTier(address account, uint8 tier) external view returns (bool)",
  "function hasFullSet(address account) external view returns (bool)",
  "function tokenTier(uint256 tokenId) external view returns (uint8)",
  "function tierURIs(uint8 tier) external view returns (string)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function owner() external view returns (address)",

  "function mintBadge(uint8 tier) external returns (uint256)",
  "function setClaimActive(bool active) external",
  "function setTierClaimActive(uint8 tier, bool active) external",
  "function setTierURI(uint8 tier, string memory uri) external",

  "event BadgeMinted(address indexed recipient, uint256 indexed tokenId, uint8 indexed tier)",
  "event TierURIUpdated(uint8 indexed tier, string newUri)",
  "event ClaimActiveUpdated(bool active)",
  "event TierClaimActiveUpdated(uint8 indexed tier, bool active)",

  "error AlreadyMinted()",
  "error InvalidTier()",
  "error ClaimingPaused()",
  "error MaxSupplyReached()",
  "error NonTransferableBadge()"
];

// Voting Contract Address on Base Sepolia (configurable via env, localStorage, or direct deployment)
export const getVotingContractAddress = () => {
  if (typeof window !== "undefined") {
    const override = window.localStorage.getItem("vjti_voting_contract_address");
    if (override && override.startsWith("0x") && override.length === 42) {
      return override;
    }
  }
  return (typeof import.meta !== "undefined" && import.meta.env?.VITE_VOTING_CONTRACT_ADDRESS) || "0x11594106f5f0E6128543c17aFa969aB46ab8f0dC";
};

export const VOTING_CONTRACT_ADDRESS = getVotingContractAddress();

export const setDynamicVotingContractAddress = (address) => {
  if (typeof window !== "undefined") {
    if (address && address.startsWith("0x")) {
      window.localStorage.setItem("vjti_voting_contract_address", address);
    } else {
      window.localStorage.removeItem("vjti_voting_contract_address");
    }
  }
};

// ABI for Generalized 4-Option VJTIWorkshopVoting Contract
export const VJTIWORKSHOPVOTING_ABI = [
  "function votingActive() external view returns (bool)",
  "function totalVotes() external view returns (uint256)",
  "function votesReceived(uint8 option) external view returns (uint256)",
  "function hasVoted(address voter) external view returns (bool)",
  "function voterChoice(address voter) external view returns (uint8)",
  "function vote(uint8 option) external",
  "function getResults() external view returns (uint256 option1, uint256 option2, uint256 option3, uint256 option4)",
  "function getVoteCounts() external view returns (uint256[4] memory counts)",
  "function setVotingActive(bool active) external",
  "event Voted(address indexed voter, uint8 indexed option)",
  "event VotingStateChanged(bool active)",
  "error VotingClosed()",
  "error AlreadyVoted()",
  "error InvalidOption()"
];
