// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Nautilus batch-swap settlement — records the clearing result of a
/// batched order-matching round executed inside a TEE enclave.
///
/// Participants submit buy/sell intents off-chain.  The enclave collects
/// them, computes a uniform clearing price, and calls `settleBatch()` to
/// commit the aggregate result.  The `proofBlobId` points to a Walrus
/// blob containing per-fill details and the enclave attestation.
contract BatchSwapSettlement {
    struct Batch {
        bytes32 batchId;
        bytes32 tokenPair;
        uint256 clearingPrice;
        uint256 totalBuyFilled;
        uint256 totalSellFilled;
        uint16  numParticipants;
        bytes32 proofBlobId;
        uint64  settledAt;
    }

    address public immutable enclaveSigner;

    mapping(bytes32 batchId => Batch) internal _batches;

    event BatchSettled(
        bytes32 indexed batchId,
        bytes32 indexed tokenPair,
        uint256 clearingPrice,
        uint256 totalBuyFilled,
        uint256 totalSellFilled,
        uint16  numParticipants,
        bytes32 proofBlobId,
        uint64  settledAt
    );

    constructor(address enclaveSigner_) {
        require(enclaveSigner_ != address(0), "BatchSwapSettlement: zero signer");
        enclaveSigner = enclaveSigner_;
    }

    function settleBatch(
        bytes32 batchId,
        bytes32 tokenPair,
        uint256 clearingPrice,
        uint256 totalBuyFilled,
        uint256 totalSellFilled,
        uint16  numParticipants,
        bytes32 proofBlobId
    ) external {
        require(msg.sender == enclaveSigner, "BatchSwapSettlement: unauthorized");
        require(_batches[batchId].settledAt == 0, "BatchSwapSettlement: already settled");

        uint64 ts = uint64(block.timestamp);
        _batches[batchId] = Batch({
            batchId: batchId,
            tokenPair: tokenPair,
            clearingPrice: clearingPrice,
            totalBuyFilled: totalBuyFilled,
            totalSellFilled: totalSellFilled,
            numParticipants: numParticipants,
            proofBlobId: proofBlobId,
            settledAt: ts
        });

        emit BatchSettled(
            batchId, tokenPair,
            clearingPrice, totalBuyFilled, totalSellFilled,
            numParticipants, proofBlobId, ts
        );
    }

    function settled(bytes32 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }
}
