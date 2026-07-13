// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title 05 — Factory + minimal-proxy clones (ERC-1167)
/// @notice The #1 operational pattern by volume: factories have minted >90% of
///         all contracts on Ethereum and Polygon since 2020. Because deploying bytecode is
///         expensive, factories stamp out 45-byte ERC-1167 clones that
///         delegatecall one shared implementation (Uniswap pairs, Safe
///         wallets, NFT drops all work this way).
/// @dev Sui counterpart: `no_factory.move` — the entire pattern evaporates.
///      One published package serves unlimited instances; "deploying an
///      account" is just creating an object. No clones, no delegatecall.
contract UserAccount is Initializable {
    address public owner;

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        owner = owner_;
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "not owner");
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "transfer failed");
    }

    receive() external payable {}
}

contract AccountFactory {
    address public immutable implementation;
    mapping(address user => address account) public accountOf;

    event AccountCreated(address indexed user, address account);

    constructor() {
        implementation = address(new UserAccount());
    }

    function createAccount() external returns (address account) {
        require(accountOf[msg.sender] == address(0), "already created");
        account = Clones.clone(implementation); // 45-byte proxy, ~41k gas
        UserAccount(payable(account)).initialize(msg.sender);
        accountOf[msg.sender] = account;
        emit AccountCreated(msg.sender, account);
    }
}
