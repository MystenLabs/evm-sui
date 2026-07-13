/// Minimal Governor equivalent.
///
/// Solidity habit: a Governor contract stores proposals in mappings, tracks
/// `hasVoted[proposalId][voter]` to stop double-voting, and gates execution on
/// `block.number > deadline`.
///
/// Sui idiom: a proposal is a shared object. Double-voting is prevented by a
/// `VecSet<address>` of voters held right in the object, and the deadline is
/// read from the shared `Clock`. Execution simply checks the clock and tally —
/// the same logic, minus the storage-slot bookkeeping.
module patterns::governance;

use sui::clock::Clock;
use sui::vec_set::{Self, VecSet};

#[error(code = 0)]
const EVotingClosed: vector<u8> = b"Voting period has ended";
#[error(code = 1)]
const EAlreadyVoted: vector<u8> = b"Address has already voted";
#[error(code = 2)]
const EStillVoting: vector<u8> = b"Voting period has not ended yet";
#[error(code = 3)]
const ENotPassed: vector<u8> = b"Proposal did not pass";
#[error(code = 4)]
const EAlreadyExecuted: vector<u8> = b"Proposal has already been executed";

/// A shared, one-address-one-vote proposal.
public struct Proposal has key {
    id: UID,
    deadline_ms: u64,
    yes: u64,
    no: u64,
    voted: VecSet<address>, // enforces one vote per address
    executed: bool,
}

public fun create(deadline_ms: u64, ctx: &mut TxContext) {
    transfer::share_object(Proposal {
        id: object::new(ctx),
        deadline_ms,
        yes: 0,
        no: 0,
        voted: vec_set::empty(),
        executed: false,
    });
}

/// Cast a vote. One address, one vote — the `voted` set rejects repeats.
public fun vote(proposal: &mut Proposal, support: bool, clock: &Clock, ctx: &mut TxContext) {
    assert!(clock.timestamp_ms() < proposal.deadline_ms, EVotingClosed);
    let voter = ctx.sender();
    assert!(!proposal.voted.contains(&voter), EAlreadyVoted);
    proposal.voted.insert(voter);
    if (support) proposal.yes = proposal.yes + 1 else proposal.no = proposal.no + 1;
}

/// Execute after the deadline if yes-votes lead. Returns whether it passed;
/// real governance would perform the enacted action here.
public fun execute(proposal: &mut Proposal, clock: &Clock): bool {
    assert!(clock.timestamp_ms() >= proposal.deadline_ms, EStillVoting);
    assert!(proposal.yes > proposal.no, ENotPassed);
    assert!(!proposal.executed, EAlreadyExecuted); // mirrors Solidity's require(!p.executed)
    proposal.executed = true;
    true
}

public fun tally(proposal: &Proposal): (u64, u64) { (proposal.yes, proposal.no) }

#[test]
fun test_vote_and_execute() {
    use sui::test_scenario;
    use sui::clock;
    let a = @0xA;
    let b = @0xB;
    let mut sc = test_scenario::begin(a);
    let mut clk = clock::create_for_testing(sc.ctx());
    clk.set_for_testing(0);

    create(100, sc.ctx());

    // Two distinct addresses vote yes.
    sc.next_tx(a);
    let mut proposal = sc.take_shared<Proposal>();
    vote(&mut proposal, true, &clk, sc.ctx());
    sc.next_tx(b);
    vote(&mut proposal, true, &clk, sc.ctx());
    let (yes, no) = tally(&proposal);
    assert!(yes == 2 && no == 0);

    // After the deadline it executes.
    clk.set_for_testing(150);
    assert!(execute(&mut proposal, &clk));

    test_scenario::return_shared(proposal);
    clk.destroy_for_testing();
    sc.end();
}
