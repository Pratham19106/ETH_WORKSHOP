// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CommunityBadge.sol";

contract CommunityBadgeTest is Test {
    CommunityBadge public badge;

    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    string public initialURI = "https://ipfs.io/ipfs/bafkreihg6vfx2mezfy3rwyz3dydqplhxoaxizbvuksm5vadlzmkzevq75q";
    string public updatedURI = "https://ipfs.io/ipfs/bafkreicvnkwltluuwp3phzesdmnlmgl2ksl43nzgd7rymww52gsm5zfnvi";

    event BadgeMinted(address indexed recipient, uint256 indexed tokenId);
    event TokenURIUpdated(string newURI);

    function setUp() public {
        vm.prank(owner);
        badge = new CommunityBadge(initialURI);
    }

    function test_InitialState() public view {
        assertEq(badge.name(), "CommunityBadge");
        assertEq(badge.symbol(), "CBADGE");
        assertEq(badge.owner(), owner);
        assertEq(badge.totalSupply(), 0);
        assertFalse(badge.hasClaimed(user1));
    }

    function test_MintBadge_Success() public {
        vm.prank(user1);
        vm.expectEmit(true, true, false, false);
        emit BadgeMinted(user1, 1);

        uint256 tokenId = badge.mintBadge();

        assertEq(tokenId, 1);
        assertTrue(badge.hasClaimed(user1));
        assertEq(badge.ownerOf(1), user1);
        assertEq(badge.totalSupply(), 1);
        assertEq(badge.tokenURI(1), initialURI);
    }

    function test_MintBadge_RevertIfAlreadyClaimed() public {
        vm.prank(user1);
        badge.mintBadge();

        vm.prank(user1);
        vm.expectRevert(CommunityBadge.AlreadyClaimed.selector);
        badge.mintBadge();
    }

    function test_MultipleUsersCanMint() public {
        vm.prank(user1);
        uint256 id1 = badge.mintBadge();

        vm.prank(user2);
        uint256 id2 = badge.mintBadge();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(badge.totalSupply(), 2);
        assertTrue(badge.hasClaimed(user1));
        assertTrue(badge.hasClaimed(user2));
    }

    function test_SetTokenURI_OwnerSuccess() public {
        vm.prank(user1);
        badge.mintBadge();

        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit TokenURIUpdated(updatedURI);

        badge.setTokenURI(updatedURI);
        assertEq(badge.tokenURI(1), updatedURI);
    }

    function test_SetTokenURI_RevertIfNotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        badge.setTokenURI(updatedURI);
    }

    function test_TokenURI_RevertIfNonExistent() public {
        vm.expectRevert(CommunityBadge.TokenDoesNotExist.selector);
        badge.tokenURI(999);
    }
}
