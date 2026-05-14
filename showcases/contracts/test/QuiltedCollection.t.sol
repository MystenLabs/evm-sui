// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {QuiltedCollection} from "../src/QuiltedCollection.sol";

contract QuiltedCollectionTest is Test {
    QuiltedCollection internal c;

    string internal constant QUILT_ID = "6XUOE-Q5-nAXHRifN6n9nomVDtHZQbGuAkW3PjlBuKo";
    string internal constant AGG = "https://aggregator.walrus-testnet.walrus.space";

    address internal alice = address(0xA11CE);
    address internal owner_ = address(0xBEEF);

    function setUp() public {
        c = new QuiltedCollection("Drop", "DROP", QUILT_ID, AGG, 3, owner_);
    }

    function test_constructor_revertsOnEmptyQuiltId() public {
        vm.expectRevert(bytes("QuiltedCollection: empty quiltId"));
        new QuiltedCollection("D", "D", "", AGG, 1, owner_);
    }

    function test_constructor_revertsOnEmptyAggregator() public {
        vm.expectRevert(bytes("QuiltedCollection: empty aggregator"));
        new QuiltedCollection("D", "D", QUILT_ID, "", 1, owner_);
    }

    function test_constructor_revertsOnZeroMaxSupply() public {
        vm.expectRevert(bytes("QuiltedCollection: zero maxSupply"));
        new QuiltedCollection("D", "D", QUILT_ID, AGG, 0, owner_);
    }

    function test_mint_assignsSequentialIdsAndEmits() public {
        vm.prank(alice);
        uint256 id1 = c.mint();
        vm.prank(alice);
        uint256 id2 = c.mint();
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(c.ownerOf(1), alice);
        assertEq(c.ownerOf(2), alice);
        assertEq(c.totalMinted(), 2);
    }

    function test_mint_capsAtMaxSupply() public {
        vm.startPrank(alice);
        c.mint();
        c.mint();
        c.mint();
        vm.expectRevert(bytes("QuiltedCollection: sold out"));
        c.mint();
        vm.stopPrank();
    }

    function test_tokenURI_buildsExpectedAggregatorURL() public {
        vm.prank(alice);
        uint256 id = c.mint();
        string memory uri = c.tokenURI(id);
        // Expected:
        // https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-id/<quiltId>/1.json
        assertEq(
            uri,
            string.concat(AGG, "/v1/blobs/by-quilt-id/", QUILT_ID, "/1.json")
        );
    }

    function test_tokenURI_revertsForUnmintedToken() public {
        // OZ ERC721 reverts with ERC721NonexistentToken(uint256) from _requireOwned.
        vm.expectRevert();
        c.tokenURI(42);
    }

    function test_setAggregator_ownerCanMigrateAggregator() public {
        vm.prank(alice);
        uint256 id = c.mint();

        string memory newAgg = "https://aggregator.walrus.example";
        vm.prank(owner_);
        c.setAggregator(newAgg);

        assertEq(c.aggregator(), newAgg);
        assertEq(
            c.tokenURI(id),
            string.concat(newAgg, "/v1/blobs/by-quilt-id/", QUILT_ID, "/1.json")
        );
    }

    function test_setAggregator_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(); // OZ Ownable: OwnableUnauthorizedAccount
        c.setAggregator("https://aggregator.walrus.example");
    }

    function test_setAggregator_revertsOnEmpty() public {
        vm.prank(owner_);
        vm.expectRevert(bytes("QuiltedCollection: empty aggregator"));
        c.setAggregator("");
    }
}
