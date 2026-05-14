// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {WalrusResolver, IENS, IERC165} from "../src/WalrusResolver.sol";

/// Minimal in-memory ENS registry used to drive ownership in tests. Mirrors the
/// surface area of `IENS` that WalrusResolver actually depends on.
contract MockENS is IENS {
    mapping(bytes32 => address) public owners;
    mapping(address => mapping(address => bool)) public operators;

    function setOwner(bytes32 node, address owner_) external {
        owners[node] = owner_;
    }

    function setApprovalForAll(address operator, bool approved) external {
        operators[msg.sender][operator] = approved;
    }

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }

    function isApprovedForAll(address owner_, address operator) external view returns (bool) {
        return operators[owner_][operator];
    }
}

contract WalrusResolverTest is Test {
    WalrusResolver internal resolver;
    MockENS internal ens;

    address internal vitalik = address(0xC1FA11);
    address internal mallory = address(0xBAD);
    address internal operator_ = address(0x0BEC);

    bytes32 internal node = keccak256("blog.vitalik.eth");
    bytes32 internal blobId = bytes32(uint256(0xB10B));
    bytes32 internal suiObjectId = bytes32(uint256(0x5111));
    bytes8 internal ct = bytes8("text/md");

    event WalrusBlobChanged(
        bytes32 indexed node,
        bytes32 blobId,
        bytes32 suiObjectId,
        bytes8 contentType,
        uint64 at
    );

    function setUp() public {
        ens = new MockENS();
        resolver = new WalrusResolver(IENS(address(ens)));
        ens.setOwner(node, vitalik);
    }

    function test_setWalrusBlob_storesPointerAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit WalrusBlobChanged(node, blobId, suiObjectId, ct, uint64(block.timestamp));

        vm.prank(vitalik);
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);

        (bytes32 b, bytes32 s, bytes8 c) = resolver.walrusBlob(node);
        assertEq(b, blobId);
        assertEq(s, suiObjectId);
        assertEq(c, ct);
    }

    function test_setWalrusBlob_revertsForUnauthorized() public {
        vm.prank(mallory);
        vm.expectRevert(bytes("WalrusResolver: not authorized"));
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);
    }

    function test_setWalrusBlob_allowsApprovedOperator() public {
        // Vitalik approves an operator via the ENS registry.
        vm.prank(vitalik);
        ens.setApprovalForAll(operator_, true);

        vm.prank(operator_);
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);

        (bytes32 b, , ) = resolver.walrusBlob(node);
        assertEq(b, blobId);
    }

    function test_setWalrusBlob_overwritePicksUpNewENSOwner() public {
        vm.prank(vitalik);
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);

        address newOwner = address(0xCAFE);
        ens.setOwner(node, newOwner);

        vm.prank(vitalik);
        vm.expectRevert(bytes("WalrusResolver: not authorized"));
        resolver.setWalrusBlob(node, bytes32(uint256(0xDEAD)), suiObjectId, ct);

        bytes32 nextBlob = bytes32(uint256(0xFEED));
        vm.prank(newOwner);
        resolver.setWalrusBlob(node, nextBlob, suiObjectId, ct);

        (bytes32 b, , ) = resolver.walrusBlob(node);
        assertEq(b, nextBlob);
    }

    function test_clearWalrusBlob_zerosPointerAndEmits() public {
        vm.prank(vitalik);
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);

        vm.expectEmit(true, false, false, true);
        emit WalrusBlobChanged(node, bytes32(0), bytes32(0), bytes8(0), uint64(block.timestamp));

        vm.prank(vitalik);
        resolver.clearWalrusBlob(node);

        (bytes32 b, bytes32 s, bytes8 c) = resolver.walrusBlob(node);
        assertEq(b, bytes32(0));
        assertEq(s, bytes32(0));
        assertEq(c, bytes8(0));
    }

    function test_clearWalrusBlob_revertsForUnauthorized() public {
        vm.prank(mallory);
        vm.expectRevert(bytes("WalrusResolver: not authorized"));
        resolver.clearWalrusBlob(node);
    }

    function test_walrusBlob_unsetNodeReturnsZeros() public view {
        bytes32 untouched = keccak256("never.set.eth");
        (bytes32 b, bytes32 s, bytes8 c) = resolver.walrusBlob(untouched);
        assertEq(b, bytes32(0));
        assertEq(s, bytes32(0));
        assertEq(c, bytes8(0));
    }

    function test_supportsInterface_erc165Only() public view {
        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        // No longer claims support via function selector — that was a category
        // confusion between ERC-165 interface ids and function selectors.
        assertFalse(resolver.supportsInterface(resolver.walrusBlob.selector));
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }
}
