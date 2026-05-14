// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// DAO governance with proposal bodies on Walrus.
///
/// The proposal body (markdown / JSON / whatever the DAO renders) lives on
/// Walrus as a single blob. The proposer pays the WAL storage cost via the
/// public Walrus publisher — the DAO contract is not on the WAL hook. The
/// 32-byte Walrus blob id is stored on-chain alongside the deadline and the
/// vote tallies.
///
/// Voting weight is the proposer-supplied ERC-20's `balanceOf` at vote time —
/// snapshotting is intentionally out of scope to keep the contract focused;
/// in production pair with an ERC20Votes-style token if Sybil-resistance
/// against last-minute transfers matters.
contract Governance {
    struct Proposal {
        address proposer;
        bytes32 blobId;     // Walrus blob holding the proposal body
        uint64 deadline;    // unix seconds; voting closes when block.timestamp >= deadline
        uint128 yes;        // sum of voter weights for YES
        uint128 no;         // sum of voter weights for NO
    }

    IERC20 public immutable voteToken;
    uint256 public lastProposalId;

    mapping(uint256 id => Proposal) public proposals;
    mapping(uint256 id => mapping(address voter => bool)) public hasVoted;

    event Proposed(uint256 indexed id, address indexed proposer, bytes32 blobId, uint64 deadline);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);

    constructor(IERC20 voteToken_) {
        voteToken = voteToken_;
    }

    /// @notice Submit a new proposal. The blob must already be uploaded to
    /// Walrus — this contract only stores the pointer.
    function propose(bytes32 blobId, uint64 deadline) external returns (uint256 id) {
        require(deadline > block.timestamp, "Governance: deadline in past");
        require(blobId != bytes32(0), "Governance: zero blobId");

        id = ++lastProposalId;
        proposals[id] = Proposal({
            proposer: msg.sender,
            blobId: blobId,
            deadline: deadline,
            yes: 0,
            no: 0
        });
        emit Proposed(id, msg.sender, blobId, deadline);
    }

    /// @notice Cast a yes/no vote weighted by the caller's vote-token balance
    /// at the time of voting.
    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(p.deadline != 0, "Governance: unknown proposal");
        require(block.timestamp < p.deadline, "Governance: voting closed");
        require(!hasVoted[id][msg.sender], "Governance: already voted");

        uint256 weight = voteToken.balanceOf(msg.sender);
        require(weight > 0, "Governance: zero weight");
        require(weight <= type(uint128).max, "Governance: weight overflow");

        hasVoted[id][msg.sender] = true;
        if (support) {
            p.yes += uint128(weight);
        } else {
            p.no += uint128(weight);
        }
        emit Voted(id, msg.sender, support, weight);
    }

    /// @notice Convenience view: returns (yes, no, passed, closed).
    function tally(uint256 id) external view returns (uint128 yes, uint128 no, bool passed, bool closed) {
        Proposal storage p = proposals[id];
        yes = p.yes;
        no = p.no;
        closed = block.timestamp >= p.deadline && p.deadline != 0;
        passed = closed && yes > no;
    }
}
