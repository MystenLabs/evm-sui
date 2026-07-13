// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title 09 — Merkle airdrop (claim with proof)
/// @notice Pushing tokens to 10,000 recipients costs the SENDER prohibitive
///         gas, so EVM airdrops invert the flow: publish one merkle root,
///         make each recipient prove membership and pay their own claim gas.
/// @dev Sui counterpart: `airdrop.move` — parallel execution + cheap object
///      creation make DIRECT distribution viable again: the sender batch-
///      creates Claim objects (or transfers Coins outright) in parallel
///      transactions. No proofs, no claim site, no unclaimed remainder.
contract MerkleAirdrop {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);

    constructor(IERC20 token_, bytes32 merkleRoot_) {
        token = token_;
        merkleRoot = merkleRoot_;
    }

    function claim(address account, uint256 amount, bytes32[] calldata proof) external {
        require(!claimed[account], "already claimed");
        // OZ standard double-hashed leaf: keccak256(keccak256(abi.encode(...)))
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "bad proof");
        claimed[account] = true;
        token.safeTransfer(account, amount);
        emit Claimed(account, amount);
    }
}
