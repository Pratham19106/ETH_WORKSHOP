// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VJTIWorkshopVoting
 * @notice Generalized, context-free 4-option voting contract for ETH VJTI Workshop.
 *         The contract simply tracks votes for Options 1, 2, 3, and 4.
 *         Context, labels, and question descriptions are provided dynamically by the frontend.
 */
contract VJTIWorkshopVoting is Ownable {
    // Voting state toggle
    bool public votingActive = true;
    uint256 public totalVotes;

    // Vote tallies for Option 1, 2, 3, and 4
    mapping(uint8 => uint256) public votesReceived;

    // Voter tracking to enforce one vote per wallet
    mapping(address => bool) public hasVoted;
    mapping(address => uint8) public voterChoice;

    // Events
    event Voted(address indexed voter, uint8 indexed option);
    event VotingStateChanged(bool active);

    // Custom Errors
    error VotingClosed();
    error AlreadyVoted();
    error InvalidOption();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Casts a vote for one of the 4 options.
     * @param option Integer choice: 1, 2, 3, or 4.
     */
    function vote(uint8 option) external {
        if (!votingActive) revert VotingClosed();
        if (option < 1 || option > 4) revert InvalidOption();
        if (hasVoted[msg.sender]) revert AlreadyVoted();

        hasVoted[msg.sender] = true;
        voterChoice[msg.sender] = option;
        votesReceived[option]++;
        totalVotes++;

        emit Voted(msg.sender, option);
    }

    /**
     * @notice Returns the vote tally for all 4 options in a single call.
     * @return option1 Votes for Option 1
     * @return option2 Votes for Option 2
     * @return option3 Votes for Option 3
     * @return option4 Votes for Option 4
     */
    function getResults() external view returns (
        uint256 option1,
        uint256 option2,
        uint256 option3,
        uint256 option4
    ) {
        return (
            votesReceived[1],
            votesReceived[2],
            votesReceived[3],
            votesReceived[4]
        );
    }

    /**
     * @notice Returns all 4 counts as a fixed-size array [opt1, opt2, opt3, opt4].
     */
    function getVoteCounts() external view returns (uint256[4] memory counts) {
        counts[0] = votesReceived[1];
        counts[1] = votesReceived[2];
        counts[2] = votesReceived[3];
        counts[3] = votesReceived[4];
    }

    /**
     * @notice Admin function to pause or unpause the voting activity.
     */
    function setVotingActive(bool active) external onlyOwner {
        votingActive = active;
        emit VotingStateChanged(active);
    }
}

