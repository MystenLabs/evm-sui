// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title 04 — Upgradeable contract (UUPS proxy)
/// @notice Upgradeability on EVM is a workaround: an ERC-1967 proxy
///         `delegatecall`s an implementation, so code can change while state
///         stays put. The cost: constructors don't run (initializers instead),
///         storage layout is append-only forever, and a storage collision
///         bricks the contract. 98.24% of upgradeable proxies never upgrade.
/// @dev Sui counterpart: `versioned.move` — package upgrades are NATIVE and
///      `UpgradeCap`-mediated; the chain enforces layout compatibility, no
///      delegatecall exists. Only shared-object versioning remains your job.
contract CounterV1 is Initializable, UUPSUpgradeable {
    // Storage layout is the contract's real ABI now: V2+ may only APPEND.
    address public owner;
    uint256 public count;

    /// Implementations must never be initialized directly — only via proxy.
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        owner = owner_;
    }

    function increment() external {
        count += 1;
    }

    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == owner, "not owner");
    }
}

/// V2 repeats V1's layout verbatim (owner, count), then appends. Reordering
/// or retyping either field would silently corrupt live state.
contract CounterV2 is Initializable, UUPSUpgradeable {
    address public owner; // slot 0 — unchanged
    uint256 public count; // slot 1 — unchanged
    uint256 public step;  // slot 2 — appended by V2

    constructor() {
        _disableInitializers();
    }

    function initializeV2(uint256 step_) external reinitializer(2) {
        step = step_;
    }

    function increment() external {
        count += step;
    }

    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == owner, "not owner");
    }
}
