// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// DAO governance with proposal bodies on Walrus, built on OpenZeppelin `Governor`.
///
/// The proposal body (markdown / JSON / whatever the DAO renders) lives on
/// Walrus as a single blob; the proposer pays the WAL storage cost out of band.
/// This contract only stores the 32-byte Walrus blob id as an on-chain pointer
/// and lets OpenZeppelin's `Governor` stack handle everything else — proposal
/// lifecycle, snapshot voting, quorum, and state transitions.
///
/// Composed modules:
///   - `GovernorSettings`            — voting delay / period / proposal threshold
///   - `GovernorCountingSimple`      — Against / For / Abstain tallying
///   - `GovernorVotes`               — voting weight from an `IVotes` token
///   - `GovernorVotesQuorumFraction` — quorum as a % of past total supply
///
/// Snapshot voting comes for free: `Governor` records each proposal's vote
/// snapshot (`proposalSnapshot`) and reads weight via `IVotes.getPastVotes`, so
/// tokens flash-borrowed or transferred to a fresh wallet *after* the snapshot
/// carry zero weight — the flash-loan and vote-recycling attacks are closed by
/// the same mechanism `Governor` uses everywhere. `token` MUST implement
/// `IVotes` (e.g. an OpenZeppelin `ERC20Votes` token) and holders MUST delegate
/// (self-delegation is fine) for their balance to count.
///
/// Proposals here are *signaling only*: they carry no on-chain actions, so
/// there is nothing to `queue`/`execute` — the outcome is the vote result over
/// a Walrus-hosted body. Wiring real actions (and a `TimelockController`) is a
/// standard `Governor` extension and orthogonal to the Walrus integration this
/// showcase demonstrates.
contract Governance is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction
{
    /// @notice Walrus blob id holding each proposal's body, keyed by the OZ proposal id.
    /// Readable in one `eth_call` — no event-log scraping needed.
    mapping(uint256 proposalId => bytes32 blobId) public proposalBlob;

    /// @notice Emitted alongside `Governor`'s `ProposalCreated` with the Walrus pointer.
    event ProposalBlob(uint256 indexed proposalId, bytes32 blobId);

    error ZeroBlobId();

    constructor(
        IVotes token_
    )
        Governor("WalrusDAO")
        GovernorSettings(1 /* votingDelay: 1 block */, 50_400 /* votingPeriod: ~1 week @ 12s blocks */, 0 /* proposalThreshold */)
        GovernorVotes(token_)
        GovernorVotesQuorumFraction(4 /* quorum: 4% of past total supply */)
    {}

    /// @notice Open a signaling proposal whose body lives on Walrus.
    /// @dev The blob must already be uploaded to Walrus — this stores only the
    /// pointer. The blob id is encoded into the proposal description, so the OZ
    /// `proposalId` is derived from the body (identical bodies dedupe: a second
    /// proposal for the same blob reverts via `Governor`'s duplicate guard), and
    /// is also mirrored into `proposalBlob` for direct on-chain lookup.
    ///
    /// This is the only entry point that records a Walrus pointer. The inherited
    /// 4-arg `Governor.propose` stays callable but leaves `proposalBlob` unset,
    /// so this showcase's tooling always proposes through `proposeWithBlob`.
    /// @param blobId 32-byte Walrus blob id of the proposal body.
    /// @return proposalId The OZ proposal id (hash of the no-op action set + description).
    function proposeWithBlob(bytes32 blobId) external returns (uint256 proposalId) {
        if (blobId == bytes32(0)) revert ZeroBlobId();

        // Signaling vote: `Governor` rejects a zero-action proposal, so we carry
        // a single no-op action (a 0-value, empty-calldata self-call). Nothing
        // is ever executed — the proposal exists only to be voted on — so the
        // action's contents are immaterial.
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(this);

        proposalId = propose(targets, values, calldatas, _blobDescription(blobId));
        proposalBlob[proposalId] = blobId;
        emit ProposalBlob(proposalId, blobId);
    }

    /// @dev Canonical description for a Walrus-bodied proposal: `walrus:0x<64 hex>`.
    /// Encoding the blob id here is what makes the `proposalId` a function of the
    /// body and lets identical bodies collide instead of creating duplicates.
    function _blobDescription(bytes32 blobId) internal pure returns (string memory) {
        return string.concat("walrus:", Strings.toHexString(uint256(blobId), 32));
    }

    // ── Required overrides for the composed Governor modules ────────────────

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function quorum(
        uint256 timepoint
    ) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(timepoint);
    }
}
