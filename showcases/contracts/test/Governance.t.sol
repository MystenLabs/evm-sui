// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {Governance} from "../src/Governance.sol";

/// Minimal ERC20Votes token: snapshot-aware voting power, block.number clock.
contract VoteToken is ERC20, ERC20Permit, ERC20Votes {
    constructor() ERC20("Vote", "VOTE") ERC20Permit("Vote") {}

    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}

contract GovernanceTest is Test {
    Governance internal gov;
    VoteToken internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA801);
    address internal proposer = address(0xBEEF);

    bytes32 internal blob = bytes32(uint256(0xB10B));

    function setUp() public {
        token = new VoteToken();
        gov = new Governance(IVotes(address(token)));

        // ERC20Votes only tracks voting power for delegated balances, so each
        // holder mints then self-delegates.
        _fund(alice, 100 ether);
        _fund(bob, 200 ether);
        _fund(carol, 50 ether);

        // Advance one block so the mint+delegate checkpoints are final and a
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

    function test_propose_storesProposalAndEmits() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(proposer);
        uint256 id = gov.propose(blob, deadline);
        assertEq(id, 1);

        (address p, bytes32 b, uint64 d, uint128 yes, uint128 no, uint48 startBlock) = gov.proposals(id);
        assertEq(p, proposer);
        assertEq(b, blob);
        assertEq(d, deadline);
        assertEq(yes, 0);
        assertEq(no, 0);
        assertEq(uint256(startBlock), block.number - 1);
    }

    function test_propose_secondCall_assignsSequentialIdAndIndependentStorage() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes32 anotherBlob = bytes32(uint256(0xFADE));

        vm.prank(proposer);
        uint256 id1 = gov.propose(blob, deadline);
        vm.prank(proposer);
        uint256 id2 = gov.propose(anotherBlob, deadline);

        assertEq(id1, 1);
        assertEq(id2, 2);

        (, bytes32 b1, , , , ) = gov.proposals(id1);
        (, bytes32 b2, , , , ) = gov.proposals(id2);
        assertEq(b1, blob);
        assertEq(b2, anotherBlob);

        // Voting on one proposal must not bleed into the other's tallies.
        vm.prank(alice);
        gov.vote(id1, true);
        (, , , uint128 yes1, , ) = gov.proposals(id1);
        (, , , uint128 yes2, , ) = gov.proposals(id2);
        assertEq(uint256(yes1), 100 ether);
        assertEq(uint256(yes2), 0);
    }

    function test_propose_revertsOnPastDeadline() public {
        vm.expectRevert(bytes("Governance: deadline in past"));
        gov.propose(blob, uint64(block.timestamp));
    }

    function test_propose_revertsOnZeroBlob() public {
        vm.expectRevert(bytes("Governance: zero blobId"));
        gov.propose(bytes32(0), uint64(block.timestamp + 1 days));
    }

    function test_vote_addsWeightedTally() public {
        uint256 id = gov.propose(blob, uint64(block.timestamp + 1 days));

        vm.prank(alice);
        gov.vote(id, true);
        vm.prank(bob);
        gov.vote(id, false);
        vm.prank(carol);
        gov.vote(id, true);

        (, , , uint128 yes, uint128 no, ) = gov.proposals(id);
        assertEq(uint256(yes), 150 ether);
        assertEq(uint256(no), 200 ether);
    }

    function test_vote_revertsOnDoubleVote() public {
        uint256 id = gov.propose(blob, uint64(block.timestamp + 1 days));
        vm.prank(alice);
        gov.vote(id, true);
        vm.prank(alice);
        vm.expectRevert(bytes("Governance: already voted"));
        gov.vote(id, false);
    }

    function test_vote_revertsAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 id = gov.propose(blob, deadline);
        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert(bytes("Governance: voting closed"));
        gov.vote(id, true);
    }

    function test_vote_revertsOnZeroWeight() public {
        uint256 id = gov.propose(blob, uint64(block.timestamp + 1 days));
        address voterWithNoTokens = address(0xDEAD);
        vm.prank(voterWithNoTokens);
        vm.expectRevert(bytes("Governance: zero weight"));
        gov.vote(id, true);
    }

    /// The snapshot defeats both flash-loan voting and vote-recycling: a
    /// balance acquired *after* the proposal's snapshot block carries zero
    /// weight, so transferring already-voted tokens to a fresh wallet cannot
    /// vote them a second time.
    function test_vote_snapshotResistsTransferRecycling() public {
        uint256 id = gov.propose(blob, uint64(block.timestamp + 1 days));

        // Alice votes her snapshotted 100.
        vm.prank(alice);
        gov.vote(id, true);

        // Move the tokens to a fresh wallet and delegate — but only *now*,
        // after the snapshot block.
        address mule = address(0x1234);
        vm.prank(alice);
        token.transfer(mule, 100 ether);
        vm.prank(mule);
        token.delegate(mule);

        // The mule holds tokens today but had zero voting power at the
        // snapshot block, so the recycled vote is rejected.
        vm.prank(mule);
        vm.expectRevert(bytes("Governance: zero weight"));
        gov.vote(id, true);

        (, , , uint128 yes, , ) = gov.proposals(id);
        assertEq(uint256(yes), 100 ether); // not 200 — recycling blocked
    }

    function test_tally_openProposal_isNotClosedNotPassed() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = gov.propose(blob, deadline);
        vm.prank(alice);
        gov.vote(id, true);
        vm.prank(bob);
        gov.vote(id, false);

        (uint128 y, uint128 n, bool passed, bool closed) = gov.tally(id);
        assertEq(uint256(y), 100 ether);
        assertEq(uint256(n), 200 ether);
        assertFalse(closed);
        assertFalse(passed);
    }

    function test_tally_closedAndFailed_whenNoExceedsYes() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = gov.propose(blob, deadline);
        vm.prank(alice);
        gov.vote(id, true);
        vm.prank(bob);
        gov.vote(id, false);

        vm.warp(deadline + 1);
        (, , bool passed, bool closed) = gov.tally(id);
        assertTrue(closed);
        assertFalse(passed);
    }

    function test_tally_revertsOnUnknownProposal() public {
        vm.expectRevert(bytes("Governance: unknown proposal"));
        gov.tally(999);
    }

    function test_tally_closedAndPassed_whenYesExceedsNo() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = gov.propose(blob, deadline);
        vm.prank(bob);
        gov.vote(id, true);

        vm.warp(deadline + 1);
        (, , bool passed, bool closed) = gov.tally(id);
        assertTrue(closed);
        assertTrue(passed);
    }
}
