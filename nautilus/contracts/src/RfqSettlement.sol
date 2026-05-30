// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Nautilus RFQ settlement — records the outcome of a request-for-quote
/// auction that was resolved inside a TEE enclave.
///
/// The enclave signs the winning quote off-chain and calls `settle()` to
/// commit the result on-chain.  The `proofBlobId` points to a Walrus blob
/// containing the full attestation / quote log so anyone can audit later.
contract RfqSettlement {
    struct Settlement {
        bytes32 rfqId;
        address taker;
        address winningMaker;
        address baseToken;
        address quoteToken;
        uint256 amount;
        uint256 price;
        bytes32 proofBlobId;
        uint64  settledAt;
    }

    address public immutable enclaveSigner;

    mapping(bytes32 rfqId => Settlement) internal _settlements;

    event Settled(
        bytes32 indexed rfqId,
        address indexed taker,
        address indexed winningMaker,
        address baseToken,
        address quoteToken,
        uint256 amount,
        uint256 price,
        bytes32 proofBlobId,
        uint64  settledAt
    );

    constructor(address enclaveSigner_) {
        require(enclaveSigner_ != address(0), "RfqSettlement: zero signer");
        enclaveSigner = enclaveSigner_;
    }

    function settle(
        bytes32 rfqId,
        address taker,
        address winningMaker,
        address baseToken,
        address quoteToken,
        uint256 amount,
        uint256 price,
        bytes32 proofBlobId
    ) external {
        require(msg.sender == enclaveSigner, "RfqSettlement: unauthorized");
        require(_settlements[rfqId].settledAt == 0, "RfqSettlement: already settled");

        uint64 ts = uint64(block.timestamp);
        _settlements[rfqId] = Settlement({
            rfqId: rfqId,
            taker: taker,
            winningMaker: winningMaker,
            baseToken: baseToken,
            quoteToken: quoteToken,
            amount: amount,
            price: price,
            proofBlobId: proofBlobId,
            settledAt: ts
        });

        emit Settled(rfqId, taker, winningMaker, baseToken, quoteToken, amount, price, proofBlobId, ts);
    }

    function settled(bytes32 rfqId) external view returns (Settlement memory) {
        return _settlements[rfqId];
    }
}
