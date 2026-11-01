// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VJTIWorkshopVoting.sol";

contract VJTIWorkshopVotingTest is Test {
    VJTIWorkshopVoting public voting;

    address public owner = address(0x1000);
    address public voter1 = address(0x2001);
    address public voter2 = address(0x2002);
    address public voter3 = address(0x2003);
    address public voter4 = address(0x2004);
    address public outsider = address(0x9999);

    event Voted(address indexed voter, uint8 indexed option);
    event VotingStateChanged(bool active);

    function setUp() public {
        vm.prank(owner);
        voting = new VJTIWorkshopVoting();
    }

    // 1. Initial State
    function test_InitialState() public view {
        assertTrue(voting.votingActive());
        assertEq(voting.totalVotes(), 0);
        assertEq(voting.owner(), owner);

        (uint256 c1, uint256 c2, uint256 c3, uint256 c4) = voting.getResults();
        assertEq(c1, 0);
        assertEq(c2, 0);
        assertEq(c3, 0);
        assertEq(c4, 0);
    }

    // 2. Voting for Options 1 to 4
    function test_Vote_Option1_Success() public {
        vm.prank(voter1);
        vm.expectEmit(true, true, false, false);
        emit Voted(voter1, 1);
        voting.vote(1);

        assertTrue(voting.hasVoted(voter1));
        assertEq(voting.voterChoice(voter1), 1);
        assertEq(voting.votesReceived(1), 1);
        assertEq(voting.totalVotes(), 1);
    }

    function test_MultipleVoters_AllFourOptions() public {
        vm.prank(voter1);
        voting.vote(1);

        vm.prank(voter2);
        voting.vote(2);

        vm.prank(voter3);
        voting.vote(3);

        vm.prank(voter4);
        voting.vote(4);

        assertEq(voting.totalVotes(), 4);

        (uint256 c1, uint256 c2, uint256 c3, uint256 c4) = voting.getResults();
        assertEq(c1, 1);
        assertEq(c2, 1);
        assertEq(c3, 1);
        assertEq(c4, 1);

        uint256[4] memory counts = voting.getVoteCounts();
        assertEq(counts[0], 1);
        assertEq(counts[1], 1);
        assertEq(counts[2], 1);
        assertEq(counts[3], 1);
    }

    // 3. Revert: Duplicate Vote
    function test_RevertIf_AlreadyVoted() public {
        vm.prank(voter1);
        voting.vote(1);

        vm.prank(voter1);
        vm.expectRevert(VJTIWorkshopVoting.AlreadyVoted.selector);
        voting.vote(2);
    }

    // 4. Revert: Invalid Options (0 or > 4)
    function test_RevertIf_OptionZero() public {
        vm.prank(voter1);
        vm.expectRevert(VJTIWorkshopVoting.InvalidOption.selector);
        voting.vote(0);
    }

    function test_RevertIf_OptionFive() public {
        vm.prank(voter1);
        vm.expectRevert(VJTIWorkshopVoting.InvalidOption.selector);
        voting.vote(5);
    }

    // 5. Admin: Pause & Resume Voting
    function test_Admin_PauseVoting() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit VotingStateChanged(false);
        voting.setVotingActive(false);

        assertFalse(voting.votingActive());

        vm.prank(voter1);
        vm.expectRevert(VJTIWorkshopVoting.VotingClosed.selector);
        voting.vote(1);

        // Resume
        vm.prank(owner);
        voting.setVotingActive(true);

        vm.prank(voter1);
        voting.vote(1);
        assertEq(voting.votesReceived(1), 1);
    }

    // 6. Revert: Non-owner calls setVotingActive
    function test_RevertIf_NonOwner_CallsSetVotingActive() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", outsider));
        voting.setVotingActive(false);
    }
}

