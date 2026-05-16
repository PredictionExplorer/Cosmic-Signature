# CST Sqrt Emission Design

## Summary

`CosmicSignatureGameV2` replaces the old flat per-bid CST reward with a time-based formula:

```text
rewardWei = floor(sqrt(elapsedDurationInSeconds * bidCstRewardFormulaProduct))
```

By default:

```text
bidCstRewardFormulaProduct = 3 * (1 ether) * (1 ether)
```

For the first bid of a round, `elapsedDurationInSeconds` is measured from `roundActivationTime`. For later bids, it is measured from the previous bid timestamp in the same round.

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

The helper reads the outgoing last bidder before `_bidCommon` updates the bid state. That preserves the intended elapsed duration:

```text
elapsedDurationInSeconds = block.timestamp - previous bid timestamp
```

For ETH bids, `BiddingV2` mints the computed reward before calling `_bidCommon`.

For CST bids, `BiddingV2` burns the paid CST amount directly when the reward is zero. When the reward is positive, it burns and mints in one `mintAndBurnMany` call.

The token contract is unchanged. `CosmicSignatureToken` still allows only the game proxy address to mint or burn, so the UUPS upgrade keeps token authority intact.

## Security Notes

The formula product is configurable through the legacy `cstRewardAmountForBidding` storage slot. `initialize2` sets that slot to the V2 default product during the upgrade.

The arithmetic is safe for realistic timestamps:

```text
elapsedDurationInSeconds * bidCstRewardFormulaProduct
```

is far below `type(uint256).max` for any plausible blockchain timestamp.

Known economic consequences:

- Same-block bids mint zero CST because elapsed time is zero.
- First bids of rounds can mint CST if the round has been active for a while before the first bid.
- CST bids use the same reward formula. If the CST Dutch auction price decays to zero, a CST bid can still mint the time-based reward. This is intentional for V2 and covered by tests, but it should be monitored after deployment.
- Existing end-of-round CST prizes are unchanged.
- In V2, `cstRewardAmountForBidding` is the formula product rather than a flat per-bid reward amount.

## Testing

The implementation is covered by:

- `test/tests-src/CstSqrtEmission.js`
- `test/tests-src/CosmicSignatureGameV2.js`
- `test/tests-src/BidCstRewardMinLimit.js`
- simulator parity updates in `test/src/contract-simulators/CosmicSignatureGameProxySimulator.js`
- Slither upgradeability validation
- OpenZeppelin `validateUpgrade`
- focused Certora rules in `certora/CstSqrtEmission.spec`

## Deployment

Deploy only through the existing UUPS proxy upgrade flow. Do not redeploy CST.

Use the V2 rehearsal scripts:

```text
live-blockchain-testing/src/cosmic-signature-game-upgrade-v2/
```

For mainnet, run the normal Arbitrum One upgrade and registration tasks after the current round has ended and before the next round has received its first bid.
