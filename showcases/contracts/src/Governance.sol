// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// DAO governance with proposal bodies on Walrus.
///
/// The proposal body (markdown / JSON / whatever the DAO renders) lives on
/// Walrus as a single blob. The proposer pays the WAL storage cost via the
/// public Walrus publisher — the DAO contract is not on the WAL hook. The
/// 32-byte Walrus blob id is stored on-chain alongside the deadline and the
/// vote tallies.
///
/// Voting weight is *snapshotted*. Each proposal records the block in which it
/// was created (`startBlock`), and `vote()` reads the caller's past voting
/// power as of that block via `IVotes.getPastVotes`. Because the snapshot
/// block is fixed at proposal-creation time and always lies strictly in the
/// past by the time a vote is cast, tokens that are flash-borrowed,
/// flash-minted, or transferred to a fresh wallet *after* the proposal was
/// created carry zero weight. This closes the flash-loan and vote-recycling
/// attacks that a live `balanceOf` read would otherwise expose.
///
/// `voteToken` MUST implement `IVotes` (e.g. an OpenZeppelin `ERC20Votes`
/// token), and holders MUST delegate — self-delegation is fine — for their
/// balance to count toward voting power. This is the standard OpenZeppelin
/// Votes requirement, not specific to this contract.
contract Governance {
    struct Proposal {
        address proposer;
        bytes32 blobId;     // Walrus blob holding the proposal body
        uint64 deadline;    // unix seconds; voting closes when block.timestamp >= deadline
        uint128 yes;        // sum of voter weights for YES
        uint128 no;         // sum of voter weights for NO
        uint48 startBlock;  // snapshot block for voting-weight lookups (getPastVotes)
    }

    IVotes public immutable voteToken;
    uint256 public lastProposalId;

    mapping(uint256 id => Proposal) public proposals;
    mapping(uint256 id => mapping(address voter => bool)) public hasVoted;

    event Proposed(uint256 indexed id, address indexed proposer, bytes32 blobId, uint64 deadline);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);

    constructor(IVotes voteToken_) {
        voteToken = voteToken_;
    }

    /// @notice Submit a new proposal. The blob must already be uploaded to
    /// Walrus — this contract only stores the pointer. The voting-weight
    /// snapshot is taken at `block.number - 1` so it is already final and
    /// queryable via `getPastVotes` for votes cast in this block or later.
    function propose(bytes32 blobId, uint64 deadline) external returns (uint256 id) {
        require(deadline > block.timestamp, "Governance: deadline in past");
        require(blobId != bytes32(0), "Governance: zero blobId");

        id = ++lastProposalId;
        proposals[id] = Proposal({
            proposer: msg.sender,
            blobId: blobId,
            deadline: deadline,
            yes: 0,
            no: 0,
            startBlock: uint48(block.number - 1)
        });
        emit Proposed(id, msg.sender, blobId, deadline);
    }

    /// @notice Cast a yes/no vote weighted by the caller's vote-token voting
    /// power at the proposal's snapshot block.
    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(p.deadline != 0, "Governance: unknown proposal");
        require(block.timestamp < p.deadline, "Governance: voting closed");
        require(!hasVoted[id][msg.sender], "Governance: already voted");

        uint256 weight = voteToken.getPastVotes(msg.sender, p.startBlock);
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
    /// Reverts for unknown proposal ids — callers that need to probe for
    /// existence should compare `id <= lastProposalId` first.
    function tally(uint256 id) external view returns (uint128 yes, uint128 no, bool passed, bool closed) {
        Proposal storage p = proposals[id];
        require(p.deadline != 0, "Governance: unknown proposal");
        yes = p.yes;
        no = p.no;
        closed = block.timestamp >= p.deadline;
        passed = closed && yes > no;
    }
}
