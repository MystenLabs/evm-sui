/// Factory / ERC-1167 minimal-proxy equivalent.
///
/// Solidity habit: to give every user their own contract instance you deploy a
/// factory that `CREATE`s (or `CREATE2` clones via ERC-1167) a fresh contract
/// per instance. Each clone costs a deployment and lives at its own address.
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

/// Convenience entry: create one and send it to the caller.
entry fun create_and_keep(ctx: &mut TxContext) {
    let vault = create(ctx);
    transfer::transfer(vault, ctx.sender());
}

public fun owner(vault: &Vault): address { vault.owner }

#[test]
fun test_many_instances() {
    use sui::test_scenario;
    let a = @0xA;
    let mut sc = test_scenario::begin(a);
    // One package, three independent instances — no extra deployments.
    let v1 = create(sc.ctx());
    let v2 = create(sc.ctx());
    let v3 = create(sc.ctx());
    assert!(v1.owner == a && v2.owner == a && v3.owner == a);
    transfer::transfer(v1, a);
    transfer::transfer(v2, a);
    transfer::transfer(v3, a);
    sc.end();
}
