// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title VJTITieredBadge
 * @notice ERC-721 token supporting Tier 1 (Light Node), Tier 2 (Synced Node), and Tier 3 (Validator) badges for ETH VJTI Workshop & Hackathon.
 */
contract VJTITieredBadge is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _nextTokenId;
    mapping(address => bool) public hasMinted;
    mapping(uint256 => uint8) public tokenTier;
    mapping(uint8 => string) public tierURIs;

    event BadgeMinted(address indexed recipient, uint256 indexed tokenId, uint8 indexed tier);
    event TierURIUpdated(uint8 indexed tier, string newUri);

    error AlreadyMinted();
    error InvalidTier();

    constructor(
        string memory tier1Uri,
        string memory tier2Uri,
        string memory tier3Uri
    ) ERC721("VJTI ETH Community Badge", "VJTI-BADGE") Ownable(msg.sender) {
        tierURIs[1] = tier1Uri;
        tierURIs[2] = tier2Uri;
        tierURIs[3] = tier3Uri;
    }

    /**
     * @notice Mints a badge corresponding to the candidate's assigned tier.
     * @param tier 1 for Light Node, 2 for Synced Node, 3 for Validator.
     */
    function mintBadge(uint8 tier) external returns (uint256) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (tier < 1 || tier > 3) revert InvalidTier();

        uint256 tokenId = ++_nextTokenId;
        hasMinted[msg.sender] = true;
        tokenTier[tokenId] = tier;

        _safeMint(msg.sender, tokenId);
        emit BadgeMinted(msg.sender, tokenId, tier);

        return tokenId;
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
