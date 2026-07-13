// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20Permit, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title 10 — Gasless approval (EIP-2612 permit / meta-transactions)
/// @notice EVM UX problem: before a dapp can move your tokens you must send
///         an `approve()` transaction — which costs ETH the new user doesn't
///         have. `permit` replaces it with an off-chain EIP-712 signature a
///         relayer submits, paying the gas for you.
/// @dev Sui counterpart: `patterns/native/sponsored-tx.ts` — the platform
///      solves the general problem: a sponsor sets the gas payment on ANY
///      transaction (no approvals exist to begin with — you own your Coins).
///      No per-token opt-in, no signature-replay surface in app code.
contract PermitToken is ERC20Permit {
    constructor(uint256 supply) ERC20("Permit Token", "PMT") ERC20Permit("Permit Token") {
        _mint(msg.sender, supply);
    }
}

/// A dapp contract pulling deposits with a single user signature.
contract PermitDeposits {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public deposited;

    function depositWithPermit(
        IERC20 token,
        address owner,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // try/catch: front-running the permit call must not brick the deposit
        try IERC20Permit(address(token)).permit(owner, address(this), amount, deadline, v, r, s) {} catch {}
        token.safeTransferFrom(owner, address(this), amount);
        deposited[owner] += amount;
    }
}
