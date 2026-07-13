// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 02 — NFT (ERC-721)
/// @notice One contract per collection; token ownership is a row in the
///         contract's `_owners` mapping and metadata is a URI the contract
///         points at. Marketplaces must be trusted to honor royalties.
/// @dev Sui counterpart: `nft.move` — every NFT is a first-class object with
///      its own on-chain ID and fields; `Display` renders metadata natively
///      and royalty policies are enforced by the chain (kiosk), not goodwill.
contract PatternNFT is ERC721URIStorage, Ownable {
    uint256 private _nextId;

    constructor(address admin) ERC721("Pattern NFT", "PNFT") Ownable(admin) {}

    function mint(address to, string calldata uri) external onlyOwner returns (uint256 id) {
        id = ++_nextId;
        _safeMint(to, id);
        _setTokenURI(id, uri);
    }
}
