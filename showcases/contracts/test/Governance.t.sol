// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Governance} from "../src/Governance.sol";

contract VoteToken is ERC20 {
    constructor() ERC20("Vote", "VOTE") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
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
        gov = new Governance(IERC20(address(token)));
        token.mint(alice, 100 ether);
        token.mint(bob, 200 ether);
        token.mint(carol, 50 ether);
    }

    function test_propose_storesProposalAndEmits() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(proposer);
        uint256 id = gov.propose(blob, deadline);
        assertEq(id, 1);

        (address p, bytes32 b, uint64 d, uint128 yes, uint128 no) = gov.proposals(id);
        assertEq(p, proposer);
        assertEq(b, blob);
        assertEq(d, deadline);
        assertEq(yes, 0);
        assertEq(no, 0);
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

        (, , , uint128 yes, uint128 no) = gov.proposals(id);
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
