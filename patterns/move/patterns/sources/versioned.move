/// Upgradeable-proxy equivalent.
///
/// Solidity habit: to upgrade you deploy a proxy that `delegatecall`s into a
/// logic contract, and you must hand-manage a storage layout that both versions
/// agree on. Get the layout wrong and you get a *storage collision* that
/// silently corrupts state. There is no first-class notion of "the code changed
/// but the data is the same".
///
/// Sui idiom: packages are upgraded natively — `sui client upgrade` publishes a
/// new version at a new address while old versions stay callable forever. There
/// is no delegatecall and no shared storage layout, so storage collisions are
/// impossible. What you DO manage is a version gate: bump a `VERSION` constant
/// each upgrade and stamp your shared objects, so old code paths refuse to run
/// against migrated state.
module patterns::versioned;

/// Bumped by hand on every breaking upgrade. Entry points assert against it.
const VERSION: u64 = 1;

#[error(code = 0)]
const EWrongVersion: vector<u8> = b"Object version does not match package version";

/// The long-lived shared state. `version` records which package version last
/// migrated it.
public struct Config has key {
    id: UID,
    version: u64,
    value: u64,
}

/// Authority to run migrations — a capability, so upgrade rights are an object
/// you hold, not an address you compare.
public struct AdminCap has key, store { id: UID }

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(Config { id: object::new(ctx), version: VERSION, value: 0 });
}

/// Every entry point calls this first. After an upgrade, a stale `Config` (still
/// at the old version) makes the new code abort until `migrate` runs — the Sui
/// analogue of guarding against a not-yet-migrated proxy.
fun assert_version(config: &Config) {
    assert!(config.version == VERSION, EWrongVersion);
}

/// A normal, version-guarded operation.
public fun set_value(config: &mut Config, value: u64) {
    assert_version(config);
    config.value = value;
}

/// Run once after publishing an upgrade. Gated by the AdminCap; bumps the stored
/// version so guarded entry points start accepting the object again. Add any
/// data-shape migration here.
public fun migrate(_cap: &AdminCap, config: &mut Config) {
    assert!(config.version < VERSION, EWrongVersion);
    config.version = VERSION;
}

#[test]
fun test_version_gate() {
    use sui::test_scenario;
    let admin = @0xA;
    let mut sc = test_scenario::begin(admin);
    init(sc.ctx());

    sc.next_tx(admin);
    let mut config = sc.take_shared<Config>();
    set_value(&mut config, 99); // passes: versions match
    assert!(config.value == 99);
    test_scenario::return_shared(config);
    sc.end();
}
