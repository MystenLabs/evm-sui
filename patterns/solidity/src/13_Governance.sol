// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title 13 — Governance (token voting)
/// @notice Minimal token-weighted governor: propose, vote until a deadline,
///         execute if yes > no. Production systems use OZ Governor +
///         ERC20Votes checkpoints so votes snapshot past balances (this
///         minimal version reads LIVE balances — flash-loan-manipulable,
///         kept simple deliberately; see comment in castVote).
/// @dev Sui counterpart: `governance.move` — a shared Proposal object that
///      voters mutate concurrently; the on-chain `Clock` provides the
///      deadline and votes are recorded per-address in the object itself.
contract MiniGovernor {
    IERC20 public immutable token;
    uint256 public constant VOTING_PERIOD = 3 days;

    struct Proposal {
        string description;
        uint256 deadline;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
    }

    Proposal[] public proposals;
    mapping(uint256 proposalId => mapping(address voter => bool)) public hasVoted;

    event Proposed(uint256 indexed id, string description);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ExecutionApproved(uint256 indexed id);

    constructor(IERC20 token_) {
        token = token_;
    }

    function propose(string calldata description) external returns (uint256 id) {
        id = proposals.length;
        proposals.push(Proposal(description, block.timestamp + VOTING_PERIOD, 0, 0, false));
        emit Proposed(id, description);
    }

    function castVote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(block.timestamp < p.deadline, "voting over");
        require(!hasVoted[id][msg.sender], "already voted");
        hasVoted[id][msg.sender] = true;
        // Live balance as weight — real governors use ERC20Votes checkpoints
        // to stop borrow-vote-return manipulation.
        uint256 weight = token.balanceOf(msg.sender);
        if (support) p.yesVotes += weight;
        else p.noVotes += weight;
        emit Voted(id, msg.sender, support, weight);
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        require(block.timestamp >= p.deadline, "voting open");
        require(!p.executed, "executed");
        require(p.yesVotes > p.noVotes, "rejected");
        p.executed = true;
        // Real governors queue the proposal's calldata in a timelock here.
        emit ExecutionApproved(id);
    }
}
