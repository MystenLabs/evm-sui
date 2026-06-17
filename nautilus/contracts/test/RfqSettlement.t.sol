// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RfqSettlement} from "../src/RfqSettlement.sol";

contract RfqSettlementTest is Test {
    RfqSettlement internal rfq;
    address internal signer = address(0xE9C1);
    address internal stranger = address(0xBAD);

    bytes32 internal rfqId = bytes32(uint256(1));
    address internal taker = address(0xA11CE);
    address internal maker = address(0xB0B);
    address internal base = address(0xBA5E);
    address internal quote = address(0x0070E);
    uint256 internal amount = 100 ether;
    uint256 internal price = 2000e18;
    bytes32 internal proof = bytes32(uint256(0xB10B));

    function setUp() public {
        rfq = new RfqSettlement(signer);
    }

    function test_settle_storesAndEmits() public {
        vm.prank(signer);
        vm.expectEmit(true, true, true, true);
        emit RfqSettlement.Settled(
            rfqId, taker, maker, base, quote,
            amount, price, proof, uint64(block.timestamp)
        );
        rfq.settle(rfqId, taker, maker, base, quote, amount, price, proof);

        RfqSettlement.Settlement memory s = rfq.settled(rfqId);
        assertEq(s.rfqId, rfqId);
        assertEq(s.taker, taker);
        assertEq(s.winningMaker, maker);
        assertEq(s.amount, amount);
        assertEq(s.price, price);
        assertEq(s.proofBlobId, proof);
        assertGt(s.settledAt, 0);
    }

    function test_settle_revertsOnDuplicate() public {
        vm.prank(signer);
        rfq.settle(rfqId, taker, maker, base, quote, amount, price, proof);

        vm.prank(signer);
        vm.expectRevert(bytes("RfqSettlement: already settled"));
        rfq.settle(rfqId, taker, maker, base, quote, amount, price, proof);
    }

    function test_settle_revertsOnUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("RfqSettlement: unauthorized"));
        rfq.settle(rfqId, taker, maker, base, quote, amount, price, proof);
    }

    function test_settled_returnsZeroForUnknown() public view {
        RfqSettlement.Settlement memory s = rfq.settled(bytes32(uint256(999)));
        assertEq(s.settledAt, 0);
    }
}
