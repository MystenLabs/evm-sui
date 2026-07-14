/// ERC-721 equivalent.
///
/// Solidity habit: an ERC-721 is one contract holding `mapping(uint256 =>
/// address) owners` and `mapping(uint256 => string) tokenURIs`. A "token" is
/// just a row keyed by `tokenId`; it has no independent existence.
///
/// Sui idiom: there is no collection contract and no owner mapping. Each NFT is
/// a first-class object with its own `UID`; ownership is a property of the
/// object recorded by the runtime, not a row we maintain. `display::Display`
/// tells wallets/explorers how to render every object of this type at once,
/// replacing per-token `tokenURI` strings.
module patterns::nft;

use std::string::{Self, String};
use sui::display;
use sui::package;

/// The NFT itself. `key + store` means it is a standalone object that can also
/// be wrapped, traded in a kiosk, or held in another object.
public struct Nft has key, store {
    id: UID,
    name: String,
    image_url: String,
}

/// OTW so we can claim the `Publisher` needed to configure Display.
public struct NFT has drop {}

fun init(otw: NFT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    // One Display object describes rendering for *every* Nft. The `{name}` and
    // `{image_url}` templates read fields off each object at query time.
    let mut disp = display::new<Nft>(&publisher, ctx);
    disp.add(string::utf8(b"name"), string::utf8(b"{name}"));
    disp.add(string::utf8(b"image_url"), string::utf8(b"{image_url}"));
    disp.update_version();

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint = allocate a fresh object and transfer it. No global counter, no
/// `_mint` bookkeeping — the object's `UID` is its unique id. Declared `entry`
/// (not `public`) so it is PTB-callable but not composable from other packages —
/// the idiomatic form for a leaf mint.
entry fun mint(name: vector<u8>, image_url: vector<u8>, recipient: address, ctx: &mut TxContext) {
    let nft = Nft {
        id: object::new(ctx),
        name: string::utf8(name),
        image_url: string::utf8(image_url),
    };
    transfer::transfer(nft, recipient);
}
