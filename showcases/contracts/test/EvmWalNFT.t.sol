// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EvmWalNFT} from "../src/EvmWalNFT.sol";

contract EvmWalNFTTest is Test {
    EvmWalNFT internal nft;
    address internal owner = address(0xA11CE);
    address internal alice = address(0xB0B);
    address internal bob   = address(0xCAFE);
    address internal carol = address(0xD00D);

    event Minted(uint256 indexed tokenId, address indexed to, string tokenURI_);

    function setUp() public {
        nft = new EvmWalNFT(owner);
    }

    function test_AnyoneCanMint() public {
        vm.prank(alice);
        uint256 id = nft.mint("walrus://abc");
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.tokenURI(1), "walrus://abc");
    }

    function test_SelfMintReturnsSequentialIds() public {
        vm.prank(alice); assertEq(nft.mint("a"), 1);
        vm.prank(bob);   assertEq(nft.mint("b"), 2);
        vm.prank(carol); assertEq(nft.mint("c"), 3);
    }

    function test_MintToAssignsToRecipient() public {
        vm.prank(alice);
        uint256 id = nft.mintTo(bob, "uri");
        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.tokenURI(id), "uri");
    }

    function test_MintedEventEmitted() public {
        vm.expectEmit(true, true, false, true, address(nft));
        emit Minted(1, alice, "walrus://blob");
        vm.prank(alice);
        nft.mint("walrus://blob");
    }

    function test_TotalSupplyIncrements() public {
        vm.startPrank(alice);
        nft.mint("a"); nft.mint("b"); nft.mint("c");
        vm.stopPrank();
        assertEq(nft.totalSupply(), 3);
    }

    function test_SupportsInterface() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd));
        assertTrue(nft.supportsInterface(0x5b5e139f));
        assertTrue(nft.supportsInterface(0x01ffc9a7));
    }

    function test_TransferWorks() public {
        vm.prank(alice);
        uint256 id = nft.mint("uri");
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
    }
}
