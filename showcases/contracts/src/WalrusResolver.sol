// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal ENS Registry view needed for the ownership / authorization check.
/// Mirrors the relevant slice of ENSIP-1's `ENS` registry interface.
interface IENS {
    function owner(bytes32 node) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// ERC-165 interface detection.
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// IPNS replacement for the Walrus era.
///
/// An ENS name's owner can park a Walrus blob pointer on this resolver. The
/// pointer carries the on-Sui Blob object id alongside the content address, so
/// a permissionless keeper can extend the blob's epoch window without changing
/// the on-chain pointer.
///
/// History is reconstructable via `WalrusBlobChanged` events — keeping a single
/// SSTORE per update and no on-chain version array.
///
/// Intended deployment pattern: ENS owners set this resolver on a dedicated
/// subdomain (e.g. `blog.vitalik.eth`), leaving their primary name's resolver
/// untouched. See showcases/03-walrus-resolver/README.md.
contract WalrusResolver is IERC165 {
    struct Pointer {
        bytes32 blobId;       // Walrus content address
        bytes32 suiObjectId;  // on-Sui Blob object id (for keeper-driven extension)
        bytes8 contentType;   // ASCII MIME shortcode, e.g. "text/md", "app/json"
    }

    IENS public immutable ens;

    mapping(bytes32 node => Pointer) private _pointers;

    event WalrusBlobChanged(
        bytes32 indexed node,
        bytes32 blobId,
        bytes32 suiObjectId,
        bytes8 contentType,
        uint64 at
    );

    constructor(IENS ens_) {
        ens = ens_;
    }

    /// @notice Set the Walrus pointer for an ENS node. Caller must be the
    /// current node owner OR an operator the owner has approved via the ENS
    /// registry's `setApprovalForAll` — matching ENSIP-1 authorization
    /// semantics. There is no separate claim step. If the underlying .eth
    /// name transfers, the new owner can immediately overwrite this pointer.
    function setWalrusBlob(
        bytes32 node,
        bytes32 blobId,
        bytes32 suiObjectId,
        bytes8 contentType
    ) external {
        _requireAuthorized(node);
        _pointers[node] = Pointer(blobId, suiObjectId, contentType);
        emit WalrusBlobChanged(node, blobId, suiObjectId, contentType, uint64(block.timestamp));
    }

    /// @notice Clear the Walrus pointer for an ENS node. Same authorization
    /// rules as `setWalrusBlob`; equivalent to setting it to all zeros, but
    /// makes intent explicit in transaction history.
    function clearWalrusBlob(bytes32 node) external {
        _requireAuthorized(node);
        delete _pointers[node];
        emit WalrusBlobChanged(node, bytes32(0), bytes32(0), bytes8(0), uint64(block.timestamp));
    }

    /// @notice Read the current pointer for an ENS node.
    function walrusBlob(bytes32 node)
        external
        view
        returns (bytes32 blobId, bytes32 suiObjectId, bytes8 contentType)
    {
        Pointer memory p = _pointers[node];
        return (p.blobId, p.suiObjectId, p.contentType);
    }

    /// @notice ERC-165 detection. This contract intentionally is NOT a full
    /// ENS `IResolver` implementation (no `addr`, `text`, `contenthash` etc.)
    /// — it exposes the Walrus pointer record only. Consumers should detect
    /// support by direct staticcall to `walrusBlob(bytes32)`, not via ENS's
    /// resolver-record interface ids.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }

    function _requireAuthorized(bytes32 node) internal view {
        address nodeOwner = ens.owner(node);
        require(
            nodeOwner == msg.sender || ens.isApprovedForAll(nodeOwner, msg.sender),
            "WalrusResolver: not authorized"
        );
    }
}
