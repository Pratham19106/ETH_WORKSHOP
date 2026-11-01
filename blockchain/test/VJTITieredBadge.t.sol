// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VJTITieredBadge.sol";

contract VJTITieredBadgeTest is Test {
    VJTITieredBadge public badge;

    address public owner = address(0x1000);
    address public attendee1 = address(0x2001);
    address public attendee2 = address(0x2002);
    address public attendee3 = address(0x2003);
    address public outsider = address(0x9999);

    string public tier1Uri = "data:application/json;utf8,{\"name\":\"Light Node Badge\"}";
    string public tier2Uri = "data:application/json;utf8,{\"name\":\"Synced Node Badge\"}";
    string public tier3Uri = "data:application/json;utf8,{\"name\":\"Validator Badge\"}";

    event BadgeMinted(address indexed recipient, uint256 indexed tokenId, uint8 indexed tier);
    event TierURIUpdated(uint8 indexed tier, string newUri);
    event ClaimActiveUpdated(bool active);
    event TierClaimActiveUpdated(uint8 indexed tier, bool active);

    function setUp() public {
        vm.prank(owner);
        badge = new VJTITieredBadge(tier1Uri, tier2Uri, tier3Uri);
    }

    // 1. Initial State Verification
    function test_InitialState() public view {
        assertEq(badge.name(), "VJTI ETH Community Badge");
        assertEq(badge.symbol(), "VJTI-BADGE");
        assertEq(badge.owner(), owner);
        assertEq(badge.totalSupply(), 0);
        assertTrue(badge.claimActive());
        assertTrue(badge.tierClaimActive(1));
        assertTrue(badge.tierClaimActive(2));
        assertTrue(badge.tierClaimActive(3));
        assertFalse(badge.hasMinted(attendee1));
        assertFalse(badge.hasMintedTier(attendee1, 1));
        assertFalse(badge.hasFullSet(attendee1));
        assertEq(badge.tierURIs(1), tier1Uri);
        assertEq(badge.tierURIs(2), tier2Uri);
        assertEq(badge.tierURIs(3), tier3Uri);
    }

    // 2. Successful Tier Mints
    function test_MintBadge_Tier1_Success() public {
        vm.prank(attendee1);
        vm.expectEmit(true, true, true, false);
        emit BadgeMinted(attendee1, 1, 1);

        uint256 tokenId = badge.mintBadge(1);

        assertEq(tokenId, 1);
        assertEq(badge.ownerOf(1), attendee1);
        assertTrue(badge.hasMinted(attendee1));
        assertTrue(badge.hasMintedTier(attendee1, 1));
        assertFalse(badge.hasFullSet(attendee1));
        assertEq(badge.tokenTier(1), 1);
        assertEq(badge.tokenURI(1), tier1Uri);
        assertEq(badge.totalSupply(), 1);
    }

    // 3. Multi-Token Collection: Single wallet mints full set
    function test_Gamified_MultiTierClaim_FullSet() public {
        vm.startPrank(attendee1);
        uint256 id1 = badge.mintBadge(1);
        uint256 id2 = badge.mintBadge(2);
        uint256 id3 = badge.mintBadge(3);
        vm.stopPrank();

        assertEq(badge.balanceOf(attendee1), 3);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(badge.totalSupply(), 3);

        assertTrue(badge.hasMintedTier(attendee1, 1));
        assertTrue(badge.hasMintedTier(attendee1, 2));
        assertTrue(badge.hasMintedTier(attendee1, 3));
        assertTrue(badge.hasFullSet(attendee1));

        assertEq(badge.tokenTier(1), 1);
        assertEq(badge.tokenTier(2), 2);
        assertEq(badge.tokenTier(3), 3);
    }

    // 4. Revert: Duplicate Minting of Same Tier
    function test_RevertIf_AlreadyMintedSameTier() public {
        vm.prank(attendee1);
        badge.mintBadge(1);

        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.AlreadyMinted.selector);
        badge.mintBadge(1);
    }

    // 5. Revert: Invalid Tiers
    function test_RevertIf_InvalidTier_Zero() public {
        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.InvalidTier.selector);
        badge.mintBadge(0);
    }

    function test_RevertIf_InvalidTier_AboveThree() public {
        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.InvalidTier.selector);
        badge.mintBadge(4);
    }

    // 6. Soulbound Guarantee: Transfers Must Revert
    function test_Soulbound_RevertIf_TransferFrom() public {
        vm.prank(attendee1);
        badge.mintBadge(1);

        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.NonTransferableBadge.selector);
        badge.transferFrom(attendee1, attendee2, 1);
    }

    function test_Soulbound_RevertIf_SafeTransferFrom() public {
        vm.prank(attendee1);
        badge.mintBadge(1);

        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.NonTransferableBadge.selector);
        badge.safeTransferFrom(attendee1, attendee2, 1);
    }

    // 7. Admin: Global Pause & Unpause Claiming
    function test_Admin_GlobalPauseClaiming() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit ClaimActiveUpdated(false);
        badge.setClaimActive(false);

        assertFalse(badge.claimActive());

        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.ClaimingPaused.selector);
        badge.mintBadge(1);

        // Unpause
        vm.prank(owner);
        badge.setClaimActive(true);

        vm.prank(attendee1);
        badge.mintBadge(1);
        assertTrue(badge.hasMintedTier(attendee1, 1));
    }

    // 8. Admin: Phase-Specific Tier Pause & Rollout
    function test_Admin_TierSpecificPause() public {
        vm.prank(owner);
        badge.setTierClaimActive(2, false);

        assertFalse(badge.tierClaimActive(2));
        assertTrue(badge.tierClaimActive(1));

        // Attendee can mint Tier 1
        vm.prank(attendee1);
        badge.mintBadge(1);
        assertTrue(badge.hasMintedTier(attendee1, 1));

        // Attendee attempts Tier 2 while phase 2 is paused
        vm.prank(attendee1);
        vm.expectRevert(VJTITieredBadge.ClaimingPaused.selector);
        badge.mintBadge(2);

        // Admin unlocks Phase 2
        vm.prank(owner);
        badge.setTierClaimActive(2, true);

        vm.prank(attendee1);
        badge.mintBadge(2);
        assertTrue(badge.hasMintedTier(attendee1, 2));
    }

    // 9. Admin Only Constraints
    function test_RevertIf_NonOwner_CallsSetClaimActive() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", outsider));
        badge.setClaimActive(false);
    }

    function test_RevertIf_NonOwner_CallsSetTierClaimActive() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", outsider));
        badge.setTierClaimActive(2, false);
    }

    function test_RevertIf_NonOwner_CallsSetTierURI() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", outsider));
        badge.setTierURI(1, "https://example.com/new1");
    }

    // 10. Admin: Update Tier Metadata URI
    function test_Admin_UpdateTierURI() public {
        string memory updatedUri = "ipfs://QmNewUpdatedTier1MetadataHash";

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit TierURIUpdated(1, updatedUri);
        badge.setTierURI(1, updatedUri);

        assertEq(badge.tierURIs(1), updatedUri);

        vm.prank(attendee1);
        badge.mintBadge(1);
        assertEq(badge.tokenURI(1), updatedUri);
    }

    // 11. Revert: Token URI for Non-Existent Token
    function test_RevertIf_TokenURINonExistent() public {
        vm.expectRevert(abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 999));
        badge.tokenURI(999);
    }
}
