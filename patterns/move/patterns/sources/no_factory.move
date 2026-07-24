/// Factory / ERC-1167 minimal-proxy equivalent.
///
/// Solidity habit: to give every user their own contract instance you deploy a
/// factory that `CREATE`s a fresh contract per instance — usually a 45-byte
/// ERC-1167 minimal proxy that delegatecalls a shared implementation (switch to
/// `CREATE2` when you want the address computable in advance). ERC-1167 is the
/// proxy bytecode, not an opcode. Each clone still costs a deployment and lives
/// at its own address.
///
/// Sui idiom: there are no per-instance deployments. One published package is
/// the code for *unlimited* instances; an "instance" is just an object you
/// allocate with `object::new`. The `create` function below is the entire
/// factory — no clone bytecode, no CREATE2 address prediction, no registry.
module patterns::no_factory;

/// The per-user instance. Publishing the package once lets anyone mint as many
/// of these as they like.
public struct Vault has key, store {
    id: UID,
    owner: address,
    balance: u64,
}

/// "Deploy a new instance" = allocate an object and transfer it. This single
/// package call replaces an ERC-1167 clone factory.
public fun create(ctx: &mut TxContext): Vault {
    Vault { id: object::new(ctx), owner: ctx.sender(), balance: 0 }
}
