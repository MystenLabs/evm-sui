# Slither triage — teaching snippets

These contracts are **compact teaching artifacts**, not production code. Run the
analyzer yourself with:

```bash
cd patterns/solidity
slither src --filter-paths "lib/" --exclude-dependencies
```

Every finding below is expected and explained. None is an unintended bug.

## High / medium findings — all intentional

| Detector | Location | Verdict |
|---|---|---|
| `reentrancy-eth` | `12_SecurityPatterns.sol :: VulnerableVault.withdraw` | **Intentional.** This is *the* vulnerable example — the whole point of snippet 12. `HardenedVault` right below it is the fixed version, and `test_12_vulnerable_is_drained` proves the drain works. **Never deploy `VulnerableVault`.** |
| `uninitialized-state` / `constable-states` | `04_UpgradeableCounter.sol :: CounterV2.owner` | **False positive under isolation.** `owner` is proxy storage set by `CounterV1.initialize`; Slither analyzes the V2 implementation standalone and can't see the proxy wiring. Marking it `constant` (as `constable-states` suggests) would be *wrong* — it lives in proxy storage. This is inherent to the UUPS pattern the snippet teaches. |
| `arbitrary-send-erc20-permit` | `10_Permit.sol :: PermitDeposits.depositWithPermit` | **Inherent to the permit pattern.** `owner` is authenticated by the EIP-712 signature consumed in `permit`; `safeTransferFrom` can only move what that signed allowance granted. Slither flags every permit-based pull; this is the canonical shape. |
| `arbitrary-send-eth` | `03_AccessControl.sol :: RoleGuardedVault.drain` | **Role-gated by design.** `drain` is `onlyRole(DRAINER_ROLE)` — the snippet exists to show a powerful, separately-granted role. Sending to an arbitrary address is the demonstrated capability, not a leak. |

## Low / informational findings

- `reentrancy-no-eth` / `reentrancy-events` (Factory, Escrow, Multisig): external
  calls are to freshly-created or already-trusted contracts, or are the deliberate
  value-forwarding of a multisig/escrow. State/events after the call are harmless
  here; production versions would add `nonReentrant` (the `HardenedVault` shows how).
- `timestamp` (Governance): `block.timestamp` deadline comparisons — validators can
  nudge timestamps by seconds, irrelevant to a multi-day voting window. Real
  governors also use `ERC20Votes` checkpoints (noted in the snippet).
- `low-level-calls`: `.call{value:}` is the recommended ETH-send idiom post-Istanbul;
  flagged informationally.
