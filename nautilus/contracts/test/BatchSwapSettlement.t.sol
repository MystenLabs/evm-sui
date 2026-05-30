// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BatchSwapSettlement} from "../src/BatchSwapSettlement.sol";

contract BatchSwapSettlementTest is Test {
    BatchSwapSettlement internal bs;
    address internal signer = address(0xE9C1);
    address internal stranger = address(0xBAD);

    bytes32 internal batchId = bytes32(uint256(7));
    bytes32 internal pair = bytes32("ETH/USDC");
    uint256 internal clearingPrice = 2500e18;
    uint256 internal buyFilled = 10 ether;
    uint256 internal sellFilled = 10 ether;
    uint16  internal participants = 8;
    bytes32 internal proof = bytes32(uint256(0xB10B));

    function setUp() public {
        bs = new BatchSwapSettlement(signer);
    }

    function test_settleBatch_storesAndEmits() public {
        vm.prank(signer);
        vm.expectEmit(true, true, true, true);
        emit BatchSwapSettlement.BatchSettled(
            batchId, pair,
            clearingPrice, buyFilled, sellFilled,
            participants, proof, uint64(block.timestamp)
        );
        bs.settleBatch(batchId, pair, clearingPrice, buyFilled, sellFilled, participants, proof);

        BatchSwapSettlement.Batch memory b = bs.settled(batchId);
        assertEq(b.batchId, batchId);
        assertEq(b.tokenPair, pair);
        assertEq(b.clearingPrice, clearingPrice);
        assertEq(b.totalBuyFilled, buyFilled);
        assertEq(b.totalSellFilled, sellFilled);
        assertEq(b.numParticipants, participants);
        assertEq(b.proofBlobId, proof);
        assertGt(b.settledAt, 0);
    }

    function test_settleBatch_revertsOnDuplicate() public {
        vm.prank(signer);
        bs.settleBatch(batchId, pair, clearingPrice, buyFilled, sellFilled, participants, proof);

        vm.prank(signer);
        vm.expectRevert(bytes("BatchSwapSettlement: already settled"));
        bs.settleBatch(batchId, pair, clearingPrice, buyFilled, sellFilled, participants, proof);
    }

    function test_settleBatch_revertsOnUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("BatchSwapSettlement: unauthorized"));
        bs.settleBatch(batchId, pair, clearingPrice, buyFilled, sellFilled, participants, proof);
    }

    function test_settled_returnsZeroForUnknown() public view {
        BatchSwapSettlement.Batch memory b = bs.settled(bytes32(uint256(999)));
        assertEq(b.settledAt, 0);
    }
}
