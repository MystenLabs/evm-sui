// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 12 — The security canon (CEI, reentrancy guard, pull payments, pausable)
/// @notice The defensive patterns every Solidity dev drills, and WHY: any
///         external call can hand control to attacker code that re-enters
///         you mid-state-change (the DAO hack). Defenses: order code as
///         checks-effects-interactions, add a reentrancy mutex, prefer pull
///         over push payments, keep a circuit breaker.
/// @dev Sui counterpart: `security.move` — most of this canon is MOOT. Move
///      has no dynamic dispatch, no fallback code on transfers, and native
///      overflow aborts: reentrancy guards, CEI discipline and SafeMath have
///      nothing to defend against. What still matters: rounding direction,
///      access control, and pausability — see the Move module.

/// ⚠️ INTENTIONALLY VULNERABLE — teaching artifact, never deploy.
/// Interaction (the call) happens BEFORE the effect (zeroing the balance):
/// the recipient's fallback can re-enter withdraw() and drain the vault.
contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok,) = msg.sender.call{value: amount}(""); // interaction first ❌
        require(ok, "send failed");
        balances[msg.sender] = 0;                         // effect last ❌
    }
}

/// The hardened version: CEI order + mutex + circuit breaker.
contract HardenedVault is ReentrancyGuard, Pausable, Ownable {
    mapping(address => uint256) public balances;

    constructor(address admin) Ownable(admin) {}

    function deposit() external payable whenNotPaused {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant whenNotPaused {
        uint256 amount = balances[msg.sender]; // check
        balances[msg.sender] = 0;              // effect
        (bool ok,) = msg.sender.call{value: amount}(""); // interaction last ✓
        require(ok, "send failed");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
