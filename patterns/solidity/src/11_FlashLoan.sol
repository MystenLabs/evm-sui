// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20FlashMint, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";
import {IERC3156FlashBorrower} from "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title 11 — Flash loan (ERC-3156)
/// @notice Borrow with zero collateral as long as you repay within the same
///         transaction. On EVM this REQUIRES a callback: the lender calls
///         `onFlashLoan` on your contract and CHECKS BALANCES AFTER — the
///         exact dynamic-dispatch re-entry surface behind a long list of
///         DeFi exploits.
/// @dev Sui counterpart: `flash_loan.move` — the "hot potato" pattern. The
///      loan returns a `Receipt` struct with NO abilities: it cannot be
///      stored, copied, or dropped, so the transaction literally cannot end
///      until `repay` consumes it. Repayment is a type-system guarantee, not
///      a balance check, and there is no callback to re-enter.
contract FlashToken is ERC20FlashMint {
    constructor(uint256 supply) ERC20("Flash Token", "FLT") {
        _mint(msg.sender, supply);
    }

    /// 0.1% flash fee (default is 0). Fee is burned by _flashFeeReceiver=0.
    function _flashFee(address, uint256 amount) internal pure override returns (uint256) {
        return amount / 1000;
    }
}

/// Minimal borrower: receives tokens, does its arbitrage (elided), approves
/// principal + fee back to the lender.
contract FlashBorrower is IERC3156FlashBorrower {
    bytes32 private constant CALLBACK_OK = keccak256("ERC3156FlashBorrower.onFlashLoan");

    IERC3156FlashLender public immutable lender;

    constructor(IERC3156FlashLender lender_) {
        lender = lender_;
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata
    ) external override returns (bytes32) {
        // Two mandatory ERC-3156 checks: only our known lender may invoke the
        // callback, and the loan must have been initiated by us.
        require(msg.sender == address(lender), "untrusted lender");
        require(initiator == address(this), "untrusted initiator");
        // ... use `amount` for arbitrage/liquidation/refinancing here ...
        IERC20(token).approve(msg.sender, amount + fee);
        return CALLBACK_OK;
    }

    function borrow(address token, uint256 amount) external {
        lender.flashLoan(this, token, amount, "");
    }
}
