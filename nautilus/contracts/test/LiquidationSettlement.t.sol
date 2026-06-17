// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {LiquidationSettlement} from "../src/LiquidationSettlement.sol";

contract LiquidationSettlementTest is Test {
    LiquidationSettlement internal liq;
    address internal signer = address(0xE9C1);
    address internal stranger = address(0xBAD);

    bytes32 internal posId = bytes32(uint256(42));
    address internal borrower = address(0xA11CE);
    address internal liquidator = address(0xB0B);
    address internal collateral = address(0xC011);
    address internal debt = address(0xDE87);
    uint256 internal seized = 50 ether;
    uint256 internal repaid = 40 ether;
    uint16  internal bonus = 500; // 5%
    bytes32 internal proof = bytes32(uint256(0xB10B));

    function setUp() public {
        liq = new LiquidationSettlement(signer);
    }

    function test_liquidate_storesAndEmits() public {
        vm.prank(signer);
        vm.expectEmit(true, true, true, true);
        emit LiquidationSettlement.Liquidated(
            posId, borrower, liquidator,
            collateral, debt, seized, repaid, bonus,
            proof, uint64(block.timestamp)
        );
        liq.liquidate(posId, borrower, liquidator, collateral, debt, seized, repaid, bonus, proof);

        LiquidationSettlement.Liquidation memory l = liq.settled(posId);
        assertEq(l.positionId, posId);
        assertEq(l.borrower, borrower);
        assertEq(l.liquidator, liquidator);
        assertEq(l.collateralSeized, seized);
        assertEq(l.debtRepaid, repaid);
        assertEq(l.bonusBps, bonus);
        assertEq(l.proofBlobId, proof);
        assertGt(l.settledAt, 0);
    }

    function test_liquidate_revertsOnDuplicate() public {
        vm.prank(signer);
        liq.liquidate(posId, borrower, liquidator, collateral, debt, seized, repaid, bonus, proof);

        vm.prank(signer);
        vm.expectRevert(bytes("LiquidationSettlement: already settled"));
        liq.liquidate(posId, borrower, liquidator, collateral, debt, seized, repaid, bonus, proof);
    }

    function test_liquidate_revertsOnUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("LiquidationSettlement: unauthorized"));
        liq.liquidate(posId, borrower, liquidator, collateral, debt, seized, repaid, bonus, proof);
    }

    function test_settled_returnsZeroForUnknown() public view {
        LiquidationSettlement.Liquidation memory l = liq.settled(bytes32(uint256(999)));
        assertEq(l.settledAt, 0);
    }
}
