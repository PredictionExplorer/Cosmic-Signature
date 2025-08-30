## Cosmic Signature Contracts — Security Review and Improvement Plan
Version reviewed: Solidity 0.8.30, OZ v5.x, Arbitrum L2
Scope: production contracts and libraries under `contracts/production`

### Executive summary
Overall, the system is thoughtfully designed and mostly well-structured: upgradeability, round-state guards, reentrancy protection, and custody separation are present. However, a few critical and high-risk issues could lead to proxy bricking or round lock-ups due to parameter misconfiguration. Several medium/low issues pertain to randomness quality, admin misuses, and missed invariants. This report prioritizes those fixes and then lists hardening, readability, and gas suggestions.

### Severity legend
- Critical: can permanently brick or irreversibly lock core functionality or funds.
- High: can block rounds, enable history rewrite or enable meaningful loss/DoS until governance/operators act.
- Medium: weaker security/randomness, footguns, less-severe DoS.
- Low/Info: style, clarity, minor correctness/gas issues.

---

## Findings

### [C-01] UUPS upgrade path lacks proxiable (ERC1822) check and “onlyProxy” guard
- Risk: Critical
- Impact: Owner could accidentally upgrade to a non-UUPS/non-code address and brick the proxy irrecoverably; absence of onlyProxy guard reduces safety guarantees.
- Details:
  - `CosmicSignatureGame.upgradeTo` writes the implementation slot directly without verifying the new implementation is a UUPS-compatible contract and without the usual UUPS safety checks (e.g., `proxiableUUID`).
```151:156:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGame.sol
function upgradeTo(address newImplementationAddress_) external override {
	_authorizeUpgrade(newImplementationAddress_);
	StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = newImplementationAddress_;
	emit IERC1967.Upgraded(newImplementationAddress_);
}
```
- Why it matters: If upgraded to an EOA or a contract without proper proxiable interface, subsequent calls through the proxy will revert and you cannot upgrade again to recover. This is a known UUPS footgun; OZ’s `upgradeToAndCallUUPS` mitigates it.
- Recommendations:
  - Replace custom `upgradeTo` body with OZ’s `_upgradeToAndCallUUPS(newImpl, data, false)` to enforce proxiable interface.
  - Add OZ’s `onlyProxy` guard to prevent calling upgrade logic on the implementation.
  - Optionally check `newImplementationAddress_.code.length > 0` for non-empty code.

---

### [C-02] No global percentage-sum invariant; misconfig can permanently brick end-of-round claims
- Risk: Critical
- Impact: If the configurable ETH percentages sum to > 100%, `claimMainPrize()` will revert on ETH transfers (insufficient balance), blocking round closure. Because setters are `onlyRoundIsInactive`, you cannot fix during an active (stuck) round, effectively bricking the game.
- Details:
  - ETH splits are computed as percentages of total balance and transferred in sequence (raffles + chrono via `PrizesWallet`, then staking, charity, finally main prize). There is no enforcement that the cumulative configured percentages are ≤ 100.
```512:528:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
mainEthPrizeAmount_ = getMainEthPrizeAmount();
charityEthDonationAmount_ = getCharityEthDonationAmount();
cosmicSignatureNftStakingTotalEthRewardAmount_ = getCosmicSignatureNftStakingTotalEthRewardAmount();
uint256 timeoutTimeToWithdrawSecondaryPrizes_ =
	prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, _msgSender(), ethDeposits_);
emit MainPrizeClaimed(...);
```
- Why it matters: A single misconfiguration before round activation can make `claimMainPrize` revert forever; setters and upgrades are disallowed while a round is active, so there is no recovery path without social coordination or proxy-breaking changes.
- Recommendations:
  - In setters, enforce a global invariant:
    - `main + chrono + raffle + staking + charity ≤ 100`
  - Consider a safety margin (e.g., require ≤ 95–98 to account for rounding).
  - Add a pre-flight check in `claimMainPrize()` to revert with a deterministic error if invariant violated (with a helpful message), ideally before any external calls.

---

### [H-01] `PrizesWallet._registerRoundEnd` permits history rewrite by the Game address
- Risk: High
- Impact: A malicious or faulty Game implementation (via upgrade when inactive) could re-register a past round’s `mainPrizeBeneficiaryAddresses[round]` and reset `roundTimeoutTimesToWithdrawPrizes[round]`, enabling immediate donated-token/NFT claims as “beneficiary” for old rounds (or blocking on-behalf withdrawals by moving the timeout).
```126:143:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
function _registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) private returns (uint256) {
	// asserts are commented out (no enforce)
	mainPrizeBeneficiaryAddresses[roundNum_] = mainPrizeBeneficiaryAddress_;
	uint256 roundTimeoutTimeToWithdrawPrizes_ = block.timestamp + timeoutDurationToWithdrawPrizes;
	roundTimeoutTimesToWithdrawPrizes[roundNum_] = roundTimeoutTimeToWithdrawPrizes_;
	return roundTimeoutTimeToWithdrawPrizes_;
}
```
- Why it matters: `PrizesWallet` is the trust anchor for custody/timeouts. It should be append-only for round registration.
- Recommendations:
  - Enforce:
    - `require(mainPrizeBeneficiaryAddresses[round] == address(0), "already registered");`
    - `require(round == 0 || mainPrizeBeneficiaryAddresses[round - 1] != address(0), "must be sequential");`
    - `require(mainPrizeBeneficiaryAddress_ != address(0))`
  - Document immutability clearly; re-enable the commented assertions as `require`s.

---

### [M-01] Randomness is pseudo-/miner-influenced and correlated within a block
- Risk: Medium
- Impact: Biased raffle outcomes are possible (not catastrophic given use-case), especially with multiple calls in a single L2 block and block-producer influence on `block.basefee`. Arbitrum precompile calls are best-effort but optional.
```41:88:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/libraries/RandomNumberHelpers.sol
function generateRandomNumberSeed() internal /*view*/ returns (uint256) {
	uint256 randomNumberSeed_ = uint256(blockhash(block.number - 1)) >> 1;
	randomNumberSeed_ ^= block.basefee << 64;
	// optional Arb precompiles xor
	return randomNumberSeed_;
}
```
- Recommendations:
  - If stronger unpredictability is desired, integrate a commit-reveal scheme or verifiable randomness (VRF) with proper fee/budgeting.
  - At minimum, enforce single-random-seed-per-tx and derive all draws from it (already done via `RandomNumberSeedWrapper`); avoid calling `generateRandomNumberSeed` multiple times in one tx.

---

### [M-02] CST burn authority is centralized in Game (by design) and could be abused by a compromised Game
- Risk: Medium
- Impact: `CosmicSignatureToken` allows the Game to burn/mint arbitrarily; a compromised Game implementation could arbitrarily burn users’ CST (outside bid paths).
```80:89:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureToken.sol
function burn(address account_, uint256 value_) external override _onlyGame {
	_burn(account_, value_);
}
```
- Recommendations:
  - Keep the Game proxy secure; strong multisig for owner.
  - Consider widening protection: burn only in specific bid-flows (harder to abuse), or add circuit breakers for abnormal burns.
  - Add on-chain monitoring/alerts for unusual mint/burn sizes.

---

### [M-03] ETH bid overpayment “swallow” logic depends on `tx.gasprice` on Arbitrum
- Risk: Medium
- Impact: Using `tx.gasprice` to decide whether to refund tiny overpayments is heuristic; on L2s, values and refund cost models differ and may change. Could lead to unintuitive UX where small overpayments are kept.
```248:264:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
uint256 ethBidRefundAmountToSwallowMaxLimit_ = ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice;
if (uint256(overpaidEthPrice_) <= ethBidRefundAmountToSwallowMaxLimit_) {
	overpaidEthPrice_ = int256(0);
	paidEthPrice_ = msg.value;
}
```
- Recommendations:
  - Make the threshold explicitly configurable per-chain and document it for users.
  - Consider refunding always (simpler and user-friendly) or a fixed wei threshold.

---

### [M-04] Endurance/chrono calculations rely on sentinel `chronoWarriorDuration = uint256(int256(-1))`
- Risk: Medium
- Impact: Casting `uint256(-1)` to int is safe in current flows but brittle; future refactors could mis-handle this sentinel. It also makes external analytics confusing.
```103:106:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGame.sol
chronoWarriorDuration = uint256(int256(-1));
```
- Recommendations:
  - Replace sentinel with an explicit boolean flag (e.g., `chronoInitialized`) or use `type(uint256).max` as sentinel and avoid int-casts in comparisons.

---

### [L-01] Re-entrancy safe, but consider “checks-effects-interactions” ordering consistency
- Risk: Low
- Notes:
  - You correctly use `nonReentrant` across external entrypoints and perform state updates before external calls.
  - Continue auditing for any future additions; keep refunds and transfers last, after state changes, as you already do.

---

### [L-02] `PrizesWallet.withdrawEth(address)` timeout semantics depend on latest deposit’s round
- Risk: Low
- Impact: On-behalf (post-timeout) withdrawals use the winner’s last recorded `roundNum` in `EthBalanceInfo`. If a user accrues prizes across rounds without withdrawing, their on-behalf window keeps moving forward, which reduces community recovery for older unclaimed funds.
- Recommendation:
  - Acceptable design tradeoff; document explicitly for users. Optionally track per-round balances if fine-grained timeouts are desired (more storage).

---

### [L-03] `CharityWallet.send()` callable by anyone
- Risk: Low
- Impact: Anyone can trigger forwarding of the entire balance to the set charity. Not harmful (owner still controls charity address) but surprising.
```28:37:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CharityWallet.sol
function send() external override nonReentrant /*onlyOwner*/ {
	uint256 amount_ = address(this).balance;
	_send(amount_);
}
```
- Recommendation:
  - Either keep as-is but document, or restore `onlyOwner` if you want operational control over timing.

---

### [L-04] RandomWalkNFT is acknowledged legacy and has reentrancy patterns
- Risk: Low (based on scope; treated as external input)
- Notes:
  - You only read `ownerOf` or transfer into/out of staking. That isolates most of the legacy risk from the core Game.

---

## Professionalism, readability, and maintainability improvements

- Upgrade safety
  - Replace custom `upgradeTo` with OZ UUPS upgrade helpers (proxiable check, `onlyProxy`).
  - Add `newImplementationAddress_.code.length > 0` invariant and optionally proxiable UUID pre-check.

- Config invariants and validations
  - Enforce percentage sum invariant ≤ 100 in `SystemManagement` setters:
    - `mainEthPrizeAmountPercentage + chronoWarriorEthPrizeAmountPercentage + raffleTotalEthPrizeAmountForBiddersPercentage + cosmicSignatureNftStakingTotalEthRewardAmountPercentage + charityEthDonationAmountPercentage ≤ 100`.
  - Add sensible caps for divisors and limits to prevent degenerate cases (e.g., extremely long durations, 0 divisors, etc.).
  - Consider bounds on `marketingWalletCstContributionAmount`.

- Custody immutability
  - Harden `PrizesWallet._registerRoundEnd` with `require`s to prevent history rewrites (see [H-01]).

- Randomness hygiene
  - Ensure a single seed per tx and derive draws from it (already largely done).
  - Consider an optional VRF path for high-value raffles; keep current path as fallback.

- Eventing and analytics
  - Emit explicit events when critical config changes occur (already done for most setters).
  - Add event when ETH bid refunds are swallowed (for transparency).
  - Consider emitting aggregate prize-split snapshot at claim time (all percentages and computed wei).

- Code clarity
  - Reduce excessive inline “Comment-” scaffolding in production and move rationale into docs or NatSpec where helpful.
  - Replace sentinel `uint256(int256(-1))` with explicit flags for chrono-warrior init.
  - Prefer consistent naming for durations (`*_Divisor`, `*_Duration`, `*_TimeStamp`) and ensure helper comments stay in sync.

- Gas/UX
  - Consider always refunding ETH overpayments; L2 gas is cheap and predictable.
  - Batch mints/burns are good; continue to avoid per-item loops in hot paths and use unchecked where safe (already done carefully).

- Testability
  - Add property tests for:
    - Percentage-sum invariant never exceeding 100 (and claim succeeds).
    - Champions tracking correctness over randomized bid timelines.
    - PrizesWallet registration immutability.
    - Reentrancy guards preventing nested bids/refunds.
  - Add fuzz tests for Dutch auction math over boundary values (divisors, time offsets).

- Documentation
  - Your README is excellent. Add a short “Operator Safety” section summarizing the critical invariants and “what not to touch during active round.”

---

## Positive notes
- Good modularization: storage split, bidding base, management, prizes, donations.
- Strong reentrancy posture with transient storage guards (EIP-1153) and low-level call checks.
- Clear end-of-round sequence with comments; staking divide-by-zero handled via try/catch and reroute to charity.
- PrizesWallet introduces solid timeout mechanics and per-round donation custody isolation.

---

## Quick checklist of recommended changes (priority order)
1) Add proxiable check and `onlyProxy` to upgrade flow; avoid direct storage slot writes.
2) Enforce ETH percentage-sum invariant in setters; pre-flight assert before distribution.
3) Lock down `PrizesWallet._registerRoundEnd` with `require`s (append-only per round).
4) Replace chrono-warrior sentinel with explicit initialization flag, or avoid int-casts.
5) Consider refund policy clarity (always refund or explicit wei-threshold); document behavior for L2.
6) Optional: offer VRF path for raffles.

---

## Appendix: Additional code references

- Percentage getters used for splits
```653:671:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
function getMainEthPrizeAmount() public view override returns (uint256) { return address(this).balance * mainEthPrizeAmountPercentage / 100; }
function getCharityEthDonationAmount() public view override returns (uint256) { return address(this).balance * charityEthDonationAmountPercentage / 100; }
```

- Raffle and chrono allocations (computed from full balance)
```18:36:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/SecondaryPrizes.sol
function getChronoWarriorEthPrizeAmount() public view override returns (uint256) { return address(this).balance * chronoWarriorEthPrizeAmountPercentage / 100; }
function getRaffleTotalEthPrizeAmountForBidders() public view override returns (uint256) { return address(this).balance * raffleTotalEthPrizeAmountForBiddersPercentage / 100; }
```

- Register round end (needs immutability)
```100:113:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
function registerRoundEndAndDepositEthMany(...) external payable override nonReentrant _onlyGame returns (uint256) {
	uint256 roundTimeoutTimeToWithdrawPrizes_ = _registerRoundEnd(roundNum_, mainPrizeBeneficiaryAddress_);
	...
}
```
```