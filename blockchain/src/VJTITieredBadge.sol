// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VJTITieredBadge
 * @notice Gamified Soulbound ERC-721 token supporting 3-Phase Node Badge collection:
 *         Tier 1 (Light Node), Tier 2 (Synced Node), and Tier 3 (Validator).
 *         Attendees collect badges in phases; collecting all 3 unlocks the "Absolute Winner" status.
 */
contract VJTITieredBadge is ERC721, Ownable {
    uint256 public constant MAX_SUPPLY = 250; // Accommodates all attendees collecting full sets

    uint256 private _nextTokenId;
    bool public claimActive = true;

    // Phase / Tier specific on-chain toggles (Tier 1, Tier 2, Tier 3)
    mapping(uint8 => bool) public tierClaimActive;

    // Multi-token tracking: address => tier => hasMinted
    mapping(address => mapping(uint8 => bool)) public hasMintedTier;
    mapping(uint256 => uint8) public tokenTier;
    mapping(uint8 => string) public tierURIs;

    event BadgeMinted(address indexed recipient, uint256 indexed tokenId, uint8 indexed tier);
    event TierURIUpdated(uint8 indexed tier, string newUri);
    event ClaimActiveUpdated(bool active);
    event TierClaimActiveUpdated(uint8 indexed tier, bool active);

    error AlreadyMinted();
    error InvalidTier();
    error ClaimingPaused();
    error MaxSupplyReached();
    error NonTransferableBadge();

    constructor(
        string memory tier1Uri,
        string memory tier2Uri,
        string memory tier3Uri
    ) ERC721("VJTI ETH Community Badge", "VJTI-BADGE") Ownable(msg.sender) {
        tierURIs[1] = tier1Uri;
        tierURIs[2] = tier2Uri;
        tierURIs[3] = tier3Uri;

        // Default all tiers active on-chain (admin can pause globally or per tier)
        tierClaimActive[1] = true;
        tierClaimActive[2] = true;
        tierClaimActive[3] = true;
    }

    /**
     * @notice Mints a badge for the specified tier.
     *         A candidate can mint each tier once (T1, T2, T3) as phases rollout.
     * @param tier 1 for Light Node, 2 for Synced Node, 3 for Validator.
     */
    function mintBadge(uint8 tier) external returns (uint256) {
        if (!claimActive) revert ClaimingPaused();
        if (tier < 1 || tier > 3) revert InvalidTier();
        if (!tierClaimActive[tier]) revert ClaimingPaused();
        if (hasMintedTier[msg.sender][tier]) revert AlreadyMinted();
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();

        uint256 tokenId = ++_nextTokenId;
        hasMintedTier[msg.sender][tier] = true;
        tokenTier[tokenId] = tier;

        _safeMint(msg.sender, tokenId);
        emit BadgeMinted(msg.sender, tokenId, tier);

        return tokenId;
    }

    /**
     * @notice Checks if a participant has collected the entire set of badges (Absolute Winner).
     */
    function hasFullSet(address user) external view returns (bool) {
        return hasMintedTier[user][1] && hasMintedTier[user][2] && hasMintedTier[user][3];
    }

    /**
     * @notice Helper to check if an address has minted at least one badge.
     */
    function hasMinted(address user) external view returns (bool) {
        return hasMintedTier[user][1] || hasMintedTier[user][2] || hasMintedTier[user][3];
    }

    /**
     * @notice Soulbound Token (SBT) constraint: Badges cannot be transferred between users.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert NonTransferableBadge();
        }
        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Admin circuit breaker to pause or unpause badge claiming globally.
     */
    function setClaimActive(bool active) external onlyOwner {
        claimActive = active;
        emit ClaimActiveUpdated(active);
    }

    /**
     * @notice Admin circuit breaker to pause or unpause badge claiming for a specific phase/tier.
     */
    function setTierClaimActive(uint8 tier, bool active) external onlyOwner {
        if (tier < 1 || tier > 3) revert InvalidTier();
        tierClaimActive[tier] = active;
        emit TierClaimActiveUpdated(tier, active);
    }

    /**
     * @notice Admin function to update metadata URIs for specific tiers.
     */
    function setTierURI(uint8 tier, string memory uri) external onlyOwner {
        if (tier < 1 || tier > 3) revert InvalidTier();
        tierURIs[tier] = uri;
        emit TierURIUpdated(tier, uri);
    }

    /**
     * @notice Returns compliant ERC-721 token URI corresponding to the token's tier.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint8 tier = tokenTier[tokenId];
        return tierURIs[tier];
    }

    /**
     * @notice Total number of badges minted so far.
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
