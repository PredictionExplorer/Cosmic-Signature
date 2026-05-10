# CST Sqrt Emission Design

## Summary

`CosmicSignatureGameV2` replaces the old flat per-bid CST reward with a time-based formula:

```text
rewardCst = sqrt(3 * elapsedSeconds)
```

where `elapsedSeconds` is the time since the previous bid in the same round.

Because CST uses 18 decimals, Solidity mints:

```text
rewardWei = floor(sqrt(3 * elapsedSeconds * 1e36))
```

The first bid of each round mints `0` CST because there is no previous bid in that round.

## Examples

| Elapsed since previous bid | Reward |
| --- | ---: |
| 0 seconds | 0 CST |
| 1 second | ~1.732 CST |
| 60 seconds | ~13.416 CST |
| 1 hour | ~103.923 CST |
| 1 day | ~509.117 CST |

## Implementation

The implementation lives in `contracts/production/BiddingV2.sol`.

The helper reads the outgoing last bidder before `_bidCommon` updates the bid state. That preserves the intended meaning of `elapsedSeconds`:

```text
elapsedSeconds = block.timestamp - biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp
```

For ETH bids, `BiddingV2` mints the computed reward before calling `_bidCommon`.

For CST bids, `BiddingV2` burns the paid CST amount and mints the computed reward in one `mintAndBurnMany` call.

The token contract is unchanged. `CosmicSignatureToken` still allows only the game proxy address to mint or burn, so the UUPS upgrade keeps token authority intact.

## Security Notes

The formula is intentionally simple and has no configurable parameters. That reduces deployment and governance risk.

The arithmetic is safe for realistic timestamps:

```text
3 * elapsedSeconds * 1e36
```

is far below `type(uint256).max` for any plausible blockchain timestamp.

Known economic consequences:

- Same-block bids mint zero CST because elapsed time is zero.
- First bids of rounds mint zero CST.
- CST bids use the same reward formula. If the CST Dutch auction price decays to zero, a CST bid can still mint the time-based reward. This is intentional for V2 and covered by tests, but it should be monitored after deployment.
- Existing end-of-round CST prizes are unchanged.
- `cstRewardAmountForBidding` remains in storage for layout compatibility and V1 behavior, but V2 bid rewards do not use it.

## Testing

The implementation is covered by:

- `test/tests-src/CstSqrtEmission.js`
- `test/tests-src/CosmicSignatureGameV2.js`
- simulator parity updates in `test/src/contract-simulators/CosmicSignatureGameProxySimulator.js`
- Slither upgradeability validation
- OpenZeppelin `validateUpgrade`
- focused Certora rules in `certora/CstSqrtEmission.spec`

## Assertion And SMTChecker Strategy

The V2 formula is split into:

- `CstRewardCalculator.computeRadicand(elapsedSeconds)`, which proves the bounded arithmetic input to the square root.
- `CstRewardCalculator.compute(elapsedSeconds)`, which calls OpenZeppelin `Math.sqrt` and is validated by runtime tests and assertion-enabled tests.

SMTChecker can prove the radicand arithmetic with BMC:

```bash
HARDHAT_MODE_CODE=1 \
ENABLE_HARDHAT_PREPROCESSOR=true \
ENABLE_ASSERTS=true \
ENABLE_SMTCHECKER=2 \
SMTCHECKER_ENGINE=bmc \
SMTCHECKER_TIMEOUT_MS=10000 \
SMTCHECKER_DIRECT_SOLC_FILE='contracts/tests/CstRewardCalculatorSmtHarness.sol' \
SMTCHECKER_DIRECT_SOLC_CONTRACT='CstRewardCalculatorSmtHarness' \
python3 smtchecker/compile-1.py
```

This proves the harness assertions and overflow checks for the bounded radicand calculation. CHC and full `CosmicSignatureGameV2` SMT runs are currently impractical in this codebase because OpenZeppelin `Math.sqrt` and the full game inheritance graph cause solver timeouts. The exact square-root bounds remain guarded by `#enable_asserts // #disable_smtchecker` runtime assertions and by the randomized BigInt test oracle in `test/tests-src/CstSqrtEmission.js`.

The V2 tests were run in the important build modes:

- assertions enabled;
- assertions enabled plus SMT preprocessing;
- production mode with assertions disabled;
- preprocessor enabled with assertions disabled.

The full-suite failures seen in some modes were `proper-lockfile` contention in existing tests and passed when rerun in isolation.

## Deployment

Deploy only through the existing UUPS proxy upgrade flow. Do not redeploy CST.

Use:

```text
tasks/runners/run-upgrade-cosmic-signature-game-arbitrumSepolia.bash
tasks/runners/run-register-upgraded-cosmic-signature-game-arbitrumSepolia.bash
```

for rehearsal, then repeat with the Arbitrum One runners after the current round has ended and before the next round has received its first bid.
