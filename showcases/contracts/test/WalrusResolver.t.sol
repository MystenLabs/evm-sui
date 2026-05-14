// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {WalrusResolver, IENS, IERC165} from "../src/WalrusResolver.sol";

/// Minimal in-memory ENS registry used to drive ownership in tests. Mirrors the
/// surface area of `IENS` that WalrusResolver actually depends on.
contract MockENS is IENS {
    mapping(bytes32 => address) public owners;

    function setOwner(bytes32 node, address owner_) external {
        owners[node] = owner_;
    }

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }
}

contract WalrusResolverTest is Test {
    WalrusResolver internal resolver;
    MockENS internal ens;

    address internal vitalik = address(0xC1FA11);
    address internal mallory = address(0xBAD);

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

    function test_setWalrusBlob_revertsForNonENSOwner() public {
        vm.prank(mallory);
        vm.expectRevert(bytes("WalrusResolver: not ENS owner"));
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);
    }

    function test_setWalrusBlob_overwritePicksUpNewENSOwner() public {
        // Vitalik writes first.
        vm.prank(vitalik);
        resolver.setWalrusBlob(node, blobId, suiObjectId, ct);

        // Name transfers in ENS — old owner can no longer write.
        address newOwner = address(0xCAFE);
        ens.setOwner(node, newOwner);

        vm.prank(vitalik);
        vm.expectRevert(bytes("WalrusResolver: not ENS owner"));
        resolver.setWalrusBlob(node, bytes32(uint256(0xDEAD)), suiObjectId, ct);

        // New owner immediately overwrites.
        bytes32 nextBlob = bytes32(uint256(0xFEED));
        vm.prank(newOwner);
        resolver.setWalrusBlob(node, nextBlob, suiObjectId, ct);

        (bytes32 b, , ) = resolver.walrusBlob(node);
        assertEq(b, nextBlob);
    }

    function test_walrusBlob_unsetNodeReturnsZeros() public view {
        bytes32 untouched = keccak256("never.set.eth");
        (bytes32 b, bytes32 s, bytes8 c) = resolver.walrusBlob(untouched);
        assertEq(b, bytes32(0));
        assertEq(s, bytes32(0));
        assertEq(c, bytes8(0));
    }

    function test_supportsInterface_erc165AndWalrusBlob() public view {
        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        assertTrue(resolver.supportsInterface(resolver.walrusBlob.selector));
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }
}
