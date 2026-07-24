// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 01 — Fungible token (ERC-20)
/// @notice One of the most deployed patterns on EVM chains — OpenZeppelin's
///         ERC-20 is among the most widely reused contracts in the ecosystem.
///         All balances live in ONE contract as a
///         `mapping(address => uint256)`; holders never custody anything.
/// @dev Sui counterpart: `patterns/move/patterns/sources/fungible_token.move` —
///      `coin_registry::new_currency_with_otw` creates a currency whose `Coin<T>` objects holders own
///      directly; there is no balances mapping to read or corrupt.
contract PatternToken is ERC20, Ownable {
    constructor(address admin) ERC20("Pattern Token", "PTRN") Ownable(admin) {}

    /// The `onlyOwner` mint gate is the piece Sui replaces with possession of
    /// the `TreasuryCap` object — an unforgeable capability, not an if-check.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
