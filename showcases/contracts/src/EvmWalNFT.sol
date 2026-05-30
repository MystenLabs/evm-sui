// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EvmWalNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId = 1;

    /// @dev `to` is the token recipient/owner — the address the NFT is minted
    /// to, not necessarily the caller. In the `mintTo` gift path the caller and
    /// recipient differ, so indexing `to` keeps off-chain attribution aligned
    /// with the ERC-721 `Transfer` event.
    event Minted(uint256 indexed tokenId, address indexed to, string tokenURI_);

    constructor(address initialOwner)
        ERC721("EvmWal NFT", "WALNFT")
        Ownable(initialOwner)
    {}

    /// @notice Self-mint to msg.sender. Public — anyone may mint.
    function mint(string memory tokenURI_) external returns (uint256 tokenId) {
        return _mintWithURI(msg.sender, tokenURI_);
    }

    /// @notice Mint to a specified recipient. Public — anyone may mint (e.g., gift).
    function mintTo(address to, string memory tokenURI_) external returns (uint256 tokenId) {
        return _mintWithURI(to, tokenURI_);
    }

    function _mintWithURI(address to, string memory tokenURI_) internal returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        emit Minted(tokenId, to, tokenURI_);
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function tokenURI(uint256 tokenId)
        public view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
