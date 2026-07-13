// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title 08 — Multisig wallet (M-of-N approval)
/// @notice On EVM, shared custody requires a CONTRACT (Safe being the
///         canonical one): owners submit a transaction, co-owners confirm
///         on-chain (each confirmation is its own transaction + gas), and
///         once the threshold is met anyone can execute.
/// @dev Sui counterpart: `patterns/native/multisig.sh` — NO contract at all.
///      Multisig is a native key scheme: an address can BE a k-of-n composite
///      of ed25519/secp256k1 keys, signatures are combined off-chain, and the
///      combined transaction is a single normal transaction.
contract MultisigWallet {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public immutable threshold;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        uint256 confirmations;
        bool executed;
    }

    Transaction[] public transactions;
    mapping(uint256 txId => mapping(address owner => bool)) public confirmed;

    event Submitted(uint256 indexed txId, address indexed by);
    event Confirmed(uint256 indexed txId, address indexed by);
    event Executed(uint256 indexed txId);

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    constructor(address[] memory owners_, uint256 threshold_) {
        require(owners_.length >= threshold_ && threshold_ > 0, "bad threshold");
        for (uint256 i = 0; i < owners_.length; i++) {
            require(owners_[i] != address(0) && !isOwner[owners_[i]], "bad owner");
            isOwner[owners_[i]] = true;
        }
        owners = owners_;
        threshold = threshold_;
    }

    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 txId) {
        txId = transactions.length;
        transactions.push(Transaction(to, value, data, 0, false));
        emit Submitted(txId, msg.sender);
    }

    /// Each confirmation is an on-chain transaction — the coordination cost
    /// Sui moves off-chain into signature aggregation.
    function confirm(uint256 txId) external onlyOwner {
        require(!confirmed[txId][msg.sender], "already confirmed");
        confirmed[txId][msg.sender] = true;
        transactions[txId].confirmations += 1;
        emit Confirmed(txId, msg.sender);
    }

    function execute(uint256 txId) external onlyOwner {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "executed");
        require(txn.confirmations >= threshold, "below threshold");
        txn.executed = true;
        (bool ok,) = txn.to.call{value: txn.value}(txn.data);
        require(ok, "call failed");
        emit Executed(txId);
    }

    receive() external payable {}
}
