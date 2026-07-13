// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/// @title 07 — Vesting (linear release over time)
/// @notice OZ's `VestingWallet` holds ETH/ERC-20 and releases it linearly
///         between `start` and `start + duration`. The beneficiary calls
///         `release()` to pull whatever has vested so far.
/// @dev Sui counterpart: `vesting.move` — the same mental model ported to
///      objects: the wallet IS an object the beneficiary owns, and time comes
///      from the on-chain `Clock`. The snippet releases linearly by hand;
///      OpenZeppelin Contracts for Sui's `openzeppelin_finance` package is the
///      production-grade version to reach for.
contract TeamVesting is VestingWallet {
    constructor(address beneficiary, uint64 startTimestamp, uint64 durationSeconds)
        VestingWallet(beneficiary, startTimestamp, durationSeconds)
    {}
}
