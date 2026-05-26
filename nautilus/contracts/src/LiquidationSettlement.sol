// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Nautilus liquidation settlement — records liquidation outcomes computed
/// inside a TEE enclave (health-factor checks, bonus calculations, etc.).
///
/// The enclave determines which positions are under-collateralised, runs
/// the liquidation auction, and calls `liquidate()` to commit the result
/// on-chain. The `proofBlobId` links to a Walrus blob with the full
/// attestation so anyone can verify the computation was correct.
contract LiquidationSettlement {
    struct Liquidation {
        bytes32 positionId;
        address borrower;
        address liquidator;
        address collateralToken;
        address debtToken;
        uint256 collateralSeized;
        uint256 debtRepaid;
        uint16  bonusBps;
        bytes32 proofBlobId;
        uint64  settledAt;
    }

    address public immutable enclaveSigner;

    mapping(bytes32 positionId => Liquidation) internal _liquidations;

    event Liquidated(
        bytes32 indexed positionId,
        address indexed borrower,
        address indexed liquidator,
        address collateralToken,
        address debtToken,
        uint256 collateralSeized,
        uint256 debtRepaid,
        uint16  bonusBps,
        bytes32 proofBlobId,
        uint64  settledAt
    );

    constructor(address enclaveSigner_) {
        require(enclaveSigner_ != address(0), "LiquidationSettlement: zero signer");
        enclaveSigner = enclaveSigner_;
    }

    function liquidate(
        bytes32 positionId,
        address borrower,
        address liquidator,
        address collateralToken,
        address debtToken,
        uint256 collateralSeized,
        uint256 debtRepaid,
        uint16  bonusBps,
        bytes32 proofBlobId
    ) external {
        require(msg.sender == enclaveSigner, "LiquidationSettlement: unauthorized");
        require(_liquidations[positionId].settledAt == 0, "LiquidationSettlement: already settled");

        uint64 ts = uint64(block.timestamp);
        _liquidations[positionId] = Liquidation({
            positionId: positionId,
            borrower: borrower,
            liquidator: liquidator,
            collateralToken: collateralToken,
            debtToken: debtToken,
            collateralSeized: collateralSeized,
            debtRepaid: debtRepaid,
            bonusBps: bonusBps,
            proofBlobId: proofBlobId,
            settledAt: ts
        });

        emit Liquidated(
            positionId, borrower, liquidator,
            collateralToken, debtToken,
            collateralSeized, debtRepaid, bonusBps,
            proofBlobId, ts
        );
    }

    function settled(bytes32 positionId) external view returns (Liquidation memory) {
        return _liquidations[positionId];
    }
}
