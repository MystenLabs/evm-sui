// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title 06 — Escrow (trustless NFT-for-ETH sale)
/// @notice The contract takes CUSTODY: the seller's NFT sits inside the
///         escrow's own address until the buyer pays. Both parties must trust
///         this code with their assets, and every path (accept/cancel) must
///         hand them back correctly.
/// @dev Sui counterpart: `escrow.move` — the item is wrapped in a shared
///      object; ownership mechanics are language-level (no `transferFrom`
///      approval dance) and the escrow cannot "forget" to return an object —
///      Move objects can't be silently dropped.
contract NftEscrow is ReentrancyGuard {
    struct Deal {
        address seller;
        IERC721 nft;
        uint256 tokenId;
        uint256 price;
    }

    uint256 private _nextDealId;
    mapping(uint256 dealId => Deal) public deals;

    event Listed(uint256 indexed dealId, address indexed seller, uint256 price);
    event Sold(uint256 indexed dealId, address indexed buyer);
    event Cancelled(uint256 indexed dealId);

    /// Seller must have called `nft.approve(escrow, tokenId)` first — the
    /// two-transaction approval dance Sui eliminates.
    function list(IERC721 nft, uint256 tokenId, uint256 price) external returns (uint256 dealId) {
        dealId = ++_nextDealId;
        deals[dealId] = Deal(msg.sender, nft, tokenId, price);
        nft.transferFrom(msg.sender, address(this), tokenId);
        emit Listed(dealId, msg.sender, price);
    }

    function buy(uint256 dealId) external payable nonReentrant {
        Deal memory deal = deals[dealId];
        require(deal.seller != address(0), "no deal");
        require(msg.value == deal.price, "wrong price");
        delete deals[dealId]; // effects before interactions
        deal.nft.transferFrom(address(this), msg.sender, deal.tokenId);
        (bool ok,) = deal.seller.call{value: msg.value}("");
        require(ok, "pay failed");
        emit Sold(dealId, msg.sender);
    }

    function cancel(uint256 dealId) external nonReentrant {
        Deal memory deal = deals[dealId];
        require(msg.sender == deal.seller, "not seller");
        delete deals[dealId];
        deal.nft.transferFrom(address(this), deal.seller, deal.tokenId);
        emit Cancelled(dealId);
    }
}
