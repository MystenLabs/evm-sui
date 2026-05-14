// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// 10 000-token NFT collection where every token's metadata + image lives
/// inside ONE Walrus Quilt.
///
/// Migration story vs. classic IPFS-pinned drops: pack the whole drop with
/// `walrus store-quilt --paths ./drop/**/*.{json,png}` (each file's name
/// becomes its quilt identifier), grab the resulting quiltId, and deploy this
/// contract with that quiltId + the canonical aggregator base + total supply.
/// `tokenURI(id)` deterministically returns the public Walrus aggregator URL
/// for that token's metadata JSON — no per-token pin, no per-token state.
///
/// The identifier inside the quilt is expected to be `<tokenId>.json` for
/// metadata (and `<tokenId>.png` for the matching image, referenced from the
/// metadata's `image` field). The collection's quiltId is immutable.
contract QuiltedCollection is ERC721, Ownable {
    using Strings for uint256;

    /// Base64url-encoded quiltId as a string (Walrus blob ids are not raw 32
    /// bytes when serialised in the aggregator URL — they're the canonical
    /// base64url form, which Move and Sui produce natively). Storing the
    /// already-encoded form sidesteps doing base64url inside Solidity.
    ///
    /// Solidity does not allow `immutable` on dynamic-size types, so these
    /// are plain storage variables that the constructor writes once and
    /// nothing thereafter mutates.
    string public quiltId;
    string public aggregator;
    uint256 public immutable maxSupply;

    uint256 private _nextTokenId = 1;

    event Minted(uint256 indexed tokenId, address indexed to);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory quiltId_,
        string memory aggregator_,
        uint256 maxSupply_,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        require(bytes(quiltId_).length > 0, "QuiltedCollection: empty quiltId");
        require(bytes(aggregator_).length > 0, "QuiltedCollection: empty aggregator");
        require(maxSupply_ > 0, "QuiltedCollection: zero maxSupply");
        quiltId = quiltId_;
        aggregator = aggregator_;
        maxSupply = maxSupply_;
    }

    /// @notice Self-mint to the caller. Caps at `maxSupply`.
    function mint() external returns (uint256 tokenId) {
        require(_nextTokenId <= maxSupply, "QuiltedCollection: sold out");
        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        emit Minted(tokenId, msg.sender);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Resolve token id to its Walrus-quilt-backed metadata URL.
    /// Shape: `<aggregator>/v1/blobs/by-quilt-id/<quiltId>/<tokenId>.json`
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(
            aggregator,
            "/v1/blobs/by-quilt-id/",
            quiltId,
            "/",
            tokenId.toString(),
            ".json"
        );
    }
}
