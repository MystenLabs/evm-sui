// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Governance} from "../src/Governance.sol";

/// Minimal ERC20Votes token: snapshot-aware voting power, block.number clock.
contract VoteToken is ERC20, ERC20Permit, ERC20Votes {
    constructor() ERC20("Vote", "VOTE") ERC20Permit("Vote") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}

contract GovernanceTest is Test {
    // Counting-module support values (GovernorCountingSimple.VoteType).
    uint8 internal constant AGAINST = uint8(GovernorCountingSimple.VoteType.Against);
    uint8 internal constant FOR = uint8(GovernorCountingSimple.VoteType.For);
    uint8 internal constant ABSTAIN = uint8(GovernorCountingSimple.VoteType.Abstain);

    Governance internal gov;
    VoteToken internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA801);
    address internal dave = address(0xDA7E); // sub-quorum holder
    address internal proposer = address(0xBEEF);

    bytes32 internal blob = bytes32(uint256(0xB10B));

    // Mirror of Governance.ProposalBlob for vm.expectEmit matching.
    event ProposalBlob(uint256 indexed proposalId, bytes32 blobId);

    function setUp() public {
        token = new VoteToken();
        gov = new Governance(IVotes(address(token)));

        // ERC20Votes only tracks voting power for delegated balances, so each
        // holder mints then self-delegates. Total supply = 360 ether → 4%
        // quorum = 14.4 ether; dave (10) sits below it on his own.
        _fund(alice, 100 ether);
        _fund(bob, 200 ether);
        _fund(carol, 50 ether);
        _fund(dave, 10 ether);

        // Advance a block so the mint+delegate checkpoints are final and a
        // proposal created now snapshots a block in which everyone has weight.
        vm.roll(block.number + 1);
    }

    /// @dev Mint `amount` to `who` and self-delegate, giving `who` that much
    /// ERC20Votes voting power from this block onward.
    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.delegate(who);
    }

    function _expectedId(bytes32 blobId) internal view returns (uint256) {
        string memory desc = string.concat("walrus:", Strings.toHexString(uint256(blobId), 32));
        // Mirror the single no-op action proposeWithBlob builds.
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(gov);
        return gov.hashProposal(targets, values, calldatas, keccak256(bytes(desc)));
    }

    /// Roll to the first block at which `id` is Active and cast `support` for `voter`.
    function _voteWhenActive(uint256 id, address voter, uint8 support) internal {
        if (gov.state(id) == IGovernor.ProposalState.Pending) {
            vm.roll(gov.proposalSnapshot(id) + 1);
        }
        vm.prank(voter);
        gov.castVote(id, support);
    }

    // ── proposeWithBlob ─────────────────────────────────────────────────────

    function test_proposeWithBlob_storesPointerAndEmits() public {
        uint256 expected = _expectedId(blob);

        vm.expectEmit(true, false, false, true, address(gov));
        emit ProposalBlob(expected, blob);

        vm.prank(proposer);
        uint256 id = gov.proposeWithBlob(blob);

        assertEq(id, expected);
        assertEq(gov.proposalBlob(id), blob);
        assertEq(gov.proposalProposer(id), proposer);
        assertEq(uint8(gov.state(id)), uint8(IGovernor.ProposalState.Pending));
    }

    function test_proposeWithBlob_distinctBlobs_areIndependent() public {
        bytes32 anotherBlob = bytes32(uint256(0xFADE));

        vm.prank(proposer);
        uint256 id1 = gov.proposeWithBlob(blob);
        vm.prank(proposer);
        uint256 id2 = gov.proposeWithBlob(anotherBlob);

        assertTrue(id1 != id2);
        assertEq(gov.proposalBlob(id1), blob);
        assertEq(gov.proposalBlob(id2), anotherBlob);
    }

    function test_proposeWithBlob_revertsOnZeroBlob() public {
        vm.expectRevert(Governance.ZeroBlobId.selector);
        gov.proposeWithBlob(bytes32(0));
    }

    function test_proposeWithBlob_duplicateBlob_reverts() public {
        gov.proposeWithBlob(blob);
        // Same blob → same description → same proposalId → Governor rejects the duplicate.
        vm.expectPartialRevert(IGovernor.GovernorUnexpectedProposalState.selector);
        gov.proposeWithBlob(blob);
    }

    // ── voting ────────────────────────────────────────────────────────────

    function test_vote_talliesWeightByVoteType() public {
        uint256 id = gov.proposeWithBlob(blob);
        vm.roll(gov.proposalSnapshot(id) + 1);

        vm.prank(alice);
        gov.castVote(id, FOR);
        vm.prank(bob);
        gov.castVote(id, AGAINST);
        vm.prank(carol);
        gov.castVote(id, FOR);

        (uint256 against, uint256 forVotes, uint256 abstain) = gov.proposalVotes(id);
        assertEq(forVotes, 150 ether); // alice + carol
        assertEq(against, 200 ether); // bob
        assertEq(abstain, 0);
        assertTrue(gov.hasVoted(id, alice));
    }

    function test_vote_revertsOnDoubleVote() public {
        uint256 id = gov.proposeWithBlob(blob);
        _voteWhenActive(id, alice, FOR);

        vm.prank(alice);
        vm.expectPartialRevert(IGovernor.GovernorAlreadyCastVote.selector);
        gov.castVote(id, AGAINST);
    }

    function test_vote_revertsWhilePending() public {
        uint256 id = gov.proposeWithBlob(blob); // snapshot in the future → Pending
        vm.prank(alice);
        vm.expectPartialRevert(IGovernor.GovernorUnexpectedProposalState.selector);
        gov.castVote(id, FOR);
    }

    function test_vote_revertsAfterDeadline() public {
        uint256 id = gov.proposeWithBlob(blob);
        vm.roll(gov.proposalDeadline(id) + 1);
        vm.prank(alice);
        vm.expectPartialRevert(IGovernor.GovernorUnexpectedProposalState.selector);
        gov.castVote(id, FOR);
    }

    /// The snapshot defeats flash-loan voting and vote-recycling: a balance
    /// acquired *after* the proposal's snapshot block carries zero weight, so
    /// moving already-counted tokens to a fresh wallet adds nothing.
    function test_vote_snapshotResistsTransferRecycling() public {
        uint256 id = gov.proposeWithBlob(blob);
        vm.roll(gov.proposalSnapshot(id) + 1);

        // Alice votes her snapshotted 100.
        vm.prank(alice);
        gov.castVote(id, FOR);

        // Move the tokens to a fresh wallet and delegate — but only now, after
        // the snapshot block.
        address mule = address(0x1234);
        vm.prank(alice);
        token.transfer(mule, 100 ether);
        vm.prank(mule);
        token.delegate(mule);

        // The mule holds tokens today but had zero voting power at the snapshot,
        // so its vote is accepted but contributes zero weight.
        vm.prank(mule);
        gov.castVote(id, FOR);

        (, uint256 forVotes, ) = gov.proposalVotes(id);
        assertEq(forVotes, 100 ether); // not 200 — recycling blocked
    }

    // ── quorum + final state ────────────────────────────────────────────────

    function test_quorum_isFourPercentOfPastSupply() public {
        uint256 id = gov.proposeWithBlob(blob);
        uint256 snapshot = gov.proposalSnapshot(id);
        // quorum() reads getPastTotalSupply, so the snapshot must be in the past.
        vm.roll(snapshot + 1);
        // 360 ether total supply * 4% = 14.4 ether.
        assertEq(gov.quorum(snapshot), 14.4 ether);
    }

    function test_state_succeeded_whenForExceedsAgainstAndQuorum() public {
        uint256 id = gov.proposeWithBlob(blob);
        _voteWhenActive(id, bob, FOR); // 200 >= quorum, no opposition

        vm.roll(gov.proposalDeadline(id) + 1);
        assertEq(uint8(gov.state(id)), uint8(IGovernor.ProposalState.Succeeded));
    }

    function test_state_defeated_whenAgainstWins() public {
        uint256 id = gov.proposeWithBlob(blob);
        vm.roll(gov.proposalSnapshot(id) + 1);
        vm.prank(alice);
        gov.castVote(id, FOR); // 100
        vm.prank(bob);
        gov.castVote(id, AGAINST); // 200

        vm.roll(gov.proposalDeadline(id) + 1);
        assertEq(uint8(gov.state(id)), uint8(IGovernor.ProposalState.Defeated));
    }

    function test_state_defeated_whenQuorumNotReached() public {
        uint256 id = gov.proposeWithBlob(blob);
        _voteWhenActive(id, dave, FOR); // 10 ether < 14.4 quorum

        vm.roll(gov.proposalDeadline(id) + 1);
        assertEq(uint8(gov.state(id)), uint8(IGovernor.ProposalState.Defeated));
    }
}
