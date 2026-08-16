/**
 * ============================================================================
 * VJTI DECENTRAHACK ETH PORTAL - NETWORK & CONTRACT CONFIGURATION
 * ============================================================================
 */

// Contract address on Tenderly Virtual Testnet (VJTI_NET)
export const CONTRACT_ADDRESS = "0x5481663DDa284818Dd2EDEB5153D266d0DAA05f6";

// Network Parameters for VJTI_NET Virtual Testnet
export const NETWORK_CONFIG = {
  chainIdHex: "0x17432b3da7",
  chainIdDecimal: 99911155111,
  chainName: "VJTI_NET",
  rpcUrl: "https://virtual.sepolia.eu.rpc.tenderly.co/prathamm/project/7d4898-c5a921",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorerUrl: "https://dashboard.tenderly.co/explorer/vnet/9e8d7606-7d48-4887-8acc-32e59d394516",
};

// 3 Distinct Tier Configuration Data
export const BADGE_TIERS = {
  1: {
    id: 1,
    name: "Light Node",
    title: "VJTI ETH Light Node Badge",
    subtitle: "Workshop Attendee Tier",
    badgeColor: "from-amber-700 via-amber-600 to-amber-900",
    borderColor: "border-amber-500/50",
    glowClass: "glow-border-gold",
    accentColor: "#F59E0B",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreihg6vfx2mezfy3rwyz3dydqplhxoaxizbvuksm5vadlzmkzevq75q",
    metadataURI: 'data:application/json;utf8,{"name":"VJTI ETH Light Node Badge","description":"Granted for attending the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreihg6vfx2mezfy3rwyz3dydqplhxoaxizbvuksm5vadlzmkzevq75q","attributes":[{"trait_type":"Tier","value":"Light Node"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}',
    traits: [
      { trait_type: "Tier", value: "Light Node" },
      { trait_type: "Event", value: "Blockchain Introduction Workshop" },
      { trait_type: "Access", value: "General Attendee" },
    ]
  },
  2: {
    id: 2,
    name: "Synced Node",
    title: "VJTI ETH Synced Node Badge",
    subtitle: "Active Builder Tier",
    badgeColor: "from-cyan-500 via-slate-400 to-cyan-800",
    borderColor: "border-cyan-400/50",
    glowClass: "glow-border-cyan",
    accentColor: "#00F0FF",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreicvnkwltluuwp3phzesdmnlmgl2ksl43nzgd7rymww52gsm5zfnvi",
    metadataURI: 'data:application/json;utf8,{"name":"VJTI ETH Synced Node Badge","description":"Granted for active participation and two-way interaction at the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreicvnkwltluuwp3phzesdmnlmgl2ksl43nzgd7rymww52gsm5zfnvi","attributes":[{"trait_type":"Tier","value":"Synced Node"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}',
    traits: [
      { trait_type: "Tier", value: "Synced Node" },
      { trait_type: "Event", value: "Blockchain Introduction Workshop" },
      { trait_type: "Access", value: "Active Contributor" },
    ]
  },
  3: {
    id: 3,
    name: "Validator",
    title: "VJTI ETH Validator Badge",
    subtitle: "Top Hackathon Winner Tier",
    badgeColor: "from-pink-500 via-purple-600 to-yellow-500",
    borderColor: "border-pink-500/50",
    glowClass: "glow-border-magenta",
    accentColor: "#FF007A",
    image: "https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreig4rl6cdtwjpeajbdaedlknkfmsymbunddn4bh2poeucpxgcmjuvq",
    metadataURI: 'data:application/json;utf8,{"name":"VJTI ETH Validator Badge","description":"Granted for exceptional contributions and insightful solutions at the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreig4rl6cdtwjpeajbdaedlknkfmsymbunddn4bh2poeucpxgcmjuvq","attributes":[{"trait_type":"Tier","value":"Validator"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}',
    traits: [
      { trait_type: "Tier", value: "Validator" },
      { trait_type: "Event", value: "Blockchain Introduction Workshop" },
      { trait_type: "Access", value: "Exceptional Interaction" },
    ]
  }
};

// ABI for VJTITieredBadge Contract
export const VJTITIEREDBADGE_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function hasMinted(address account) external view returns (bool)",
  "function tokenTier(uint256 tokenId) external view returns (uint8)",
  "function tierURIs(uint8 tier) external view returns (string)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function owner() external view returns (address)",

  "function mintBadge(uint8 tier) external returns (uint256)",
  "function setTierURI(uint8 tier, string memory uri) external",

  "event BadgeMinted(address indexed recipient, uint256 indexed tokenId, uint8 indexed tier)",
  "event TierURIUpdated(uint8 indexed tier, string newUri)",

  "error AlreadyMinted()",
  "error InvalidTier()"
];
