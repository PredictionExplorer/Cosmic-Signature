## Cosmic Signature Contracts — Security Review (September 2025)

Version reviewed: Solidity 0.8.30, OpenZeppelin 5.x, Arbitrum L2

Scope: all contracts and libraries in `contracts/production`

### Executive summary - Complete Revert Analysis

**This document provides a COMPREHENSIVE analysis of ALL possible reverts in the Cosmic Signature codebase**, including:
- All custom error reverts defined in `CosmicSignatureErrors`
- All `require` statements and their failure conditions
- All arithmetic panics (division by zero, overflow/underflow)
- All OpenZeppelin-inherited reverts (ERC20, ERC721, Governor, access control, etc.)
- All low-level call failures and their error propagation
- Gas-related reverts and edge cases

The analysis covers both explicit reverts and implicit Solidity 0.8+ panics. Each revert condition is documented with its location, trigger condition, and impact on the system.

### Executive summary

- The system is thoughtfully modular with strong reentrancy protections and clear custody separation. Overall code quality is high with extensive checks and events.
- Critical finding: `claimMainPrize` can revert on the final main ETH transfer if the winner rejects ETH, which bricks round closure. This is a critical operational risk and should be made non-blocking (fallback to `PrizesWallet`) or refactored to a pull-claim pattern.
- **Additional CRITICAL findings**: 
  1. CharityWallet can permanently lock ALL donated ETH if charity address is not set
  2. ETH percentage-sum invariant is not enforced, which can brick round closure
  3. Staking wallet deposit only handles division-by-zero panics; other panics will brick `claimMainPrize`
- High-severity issues: PrizesWallet history rewriting, NFTs one-time staking limitation
- Randomness and MEV risks are acceptable for low-stakes but should be documented or mitigated for higher value.
- Upgrade path appears safe now via OpenZeppelin UUPS (prior direct-slot write issue no longer present).

### Severity legend

- Critical: Irrecoverable bricking or loss of core functionality/funds
- High: Enables history rewrite, blocks flows, or meaningful DoS until governance acts
- Medium: Security weakening, bounded DoS, or economic/MEV risks
- Low/Info: Minor correctness, ergonomics, or documentation gaps

---

## Contract inventory (responsibilities)

- CosmicSignatureGame: UUPS upgradeable game orchestrator; composes bidding, main/secondary prizes, donations, statistics, and system management. Initializes defaults and authorizes upgrades.
- SystemManagement: Owner-only parameter and address setters; no global invariants across percentages.
- Bidding/BiddingBase: ETH/CST bid flow, pricing, and refund rules; first bid must be ETH; optional swallow of tiny overpayments (uses `tx.gasprice`).
- MainPrize/MainPrizeBase: `claimMainPrize` flow; computes prize splits and interacts with `PrizesWallet`, staking wallets, charity, and NFT/Token mints; advances rounds.
- SecondaryPrizes: Computes ETH percentages for chrono-warrior, bidder raffles, and CS NFT staking pool.
- PrizesWallet: Custody of secondary ETH prizes and donated tokens/NFTs; per-round registration and timeouts; on-behalf withdrawals after timeout.
- CosmicSignatureToken: ERC20 (+Permit, +Votes); mint/burn restricted to Game.
- CosmicSignatureNft: ERC721Enumerable; game-only mint; per-token `seed` and optional `name`.
- RandomWalkNFT: Legacy external NFT (known issues and reentrancy patterns); used for discount bidding and staking.
- StakingWalletRandomWalkNft: Non-upgradeable staking wallet for RandomWalk NFTs.
- StakingWalletCosmicSignatureNft: Non-upgradeable staking wallet for CS NFTs; receives ETH deposits pro-rata and pays out on unstake.
- MarketingWallet: Treasurer distributes CST from the wallet via token `transferMany`.
- CharityWallet: Forwards held ETH to configured charity; callable by anyone.
- DonatedTokenHolder: Minimal ERC20 allowance holder for donated tokens; `PrizesWallet` is spender.
- Libraries: randomness (`RandomNumberHelpers`), Arbitrum precompile helpers, constants, errors/events, cryptographic hash helper, etc.

---

## Findings and recommendations

### Critical

1) `claimMainPrize` main ETH transfer can revert and permanently brick rounds
- Why: The main ETH prize transfer to the winner (lines 599-606) will revert if the transfer fails. This happens if the winner is a smart contract that reverts on ETH receipt, has no receive function, or consumes too much gas.
- **Impact**: Critical - A malicious or misconfigured winner contract can cause claim to revert until governance intervenes. Even accidental cases (e.g., account without proper receive fallback) will brick round closure.
- **Attack Vector**: Win round → Make contract revert → Protocol locked forever
```599:606:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
(bool isSuccess_, ) = _msgSender().call{value: mainEthPrizeAmount_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to bidding round main prize beneficiary failed.", _msgSender(), mainEthPrizeAmount_);
}
```
- **Required Fix**: Make transfer non-blocking. On failure, send to PrizesWallet or use pull pattern.

2) Missing global ETH percentage-sum invariant can brick `claimMainPrize`
- Why: The contract computes multiple ETH allocations from `address(this).balance` and transfers them in a sequence. If configured percentages cumulatively exceed 100%, later transfers revert and the round cannot be closed until parameters are changed — which is forbidden during active rounds.
- **UPDATE**: This issue becomes even more critical when combined with the CharityWallet lockup issue. If charity address is not set, the entire round closure fails.
```512:521:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
                        mainEthPrizeAmount_ = getMainEthPrizeAmount();
                        charityEthDonationAmount_ = getCharityEthDonationAmount();
                        cosmicSignatureNftStakingTotalEthRewardAmount_ = getCosmicSignatureNftStakingTotalEthRewardAmount();
                        uint256 timeoutTimeToWithdrawSecondaryPrizes_ =
                            prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, _msgSender(), ethDeposits_);
                        emit MainPrizeClaimed(
```
- Recommend:
  - Enforce in setters a cumulative invariant: `main + chrono + raffle + staking + charity ≤ 100` (with a small safety margin for rounding, e.g. ≤ 98–99).
  - Pre-flight check at start of `claimMainPrize` that would revert early with a clear error if violated.

### High

2) `PrizesWallet._registerRoundEnd` permits history rewrite
- Why: Round registration is not append-only; commented assertions do not enforce immutability. A faulty or malicious upgraded `Game` could rewrite past rounds’ beneficiary and timeout.
```126:142:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
function _registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) private returns (uint256) {
        // #enable_asserts assert(mainPrizeBeneficiaryAddresses[roundNum_] == address(0));
        // #enable_asserts assert(roundNum_ == 0 || mainPrizeBeneficiaryAddresses[roundNum_ - 1] != address(0));
        // #enable_asserts assert(roundTimeoutTimesToWithdrawPrizes[roundNum_] == 0);
        // #enable_asserts assert(roundNum_ == 0 || roundTimeoutTimesToWithdrawPrizes[roundNum_ - 1] != 0);
        // #enable_asserts assert(mainPrizeBeneficiaryAddress_ != address(0));
        mainPrizeBeneficiaryAddresses[roundNum_] = mainPrizeBeneficiaryAddress_;
        uint256 roundTimeoutTimeToWithdrawPrizes_ = block.timestamp + timeoutDurationToWithdrawPrizes;
        roundTimeoutTimesToWithdrawPrizes[roundNum_] = roundTimeoutTimeToWithdrawPrizes_;
        return roundTimeoutTimeToWithdrawPrizes_;
}
```
- Recommend: Replace comments with `require`s enforcing append-only registration and valid non-zero beneficiary.

### Medium

3) Randomness is pseudo-/producer-influenced and correlated per block
- Why: Seeds derive from `blockhash`, `basefee`, and optional Arbitrum precompiles; multiple draws in one tx derive from a single seed wrapper (good), but L2 producers and bots can bias/anticipate outcomes.
```47:57:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/libraries/RandomNumberHelpers.sol
        uint256 randomNumberSeed_ = uint256(blockhash(block.number - 1)) >> 1;
        randomNumberSeed_ ^= block.basefee << 64;
        // optional Arb precompiles xor
```
- Recommend: Consider commit-reveal for bids/raffles, or integrate VRF for high-value draws. Keep single-seed-per-tx and derive all draws from it.

4) MEV/front-running opportunities in bidding and main-prize claiming
- Why: Public price movements and claim timing allow sandwiching and sniping.
- Recommend: Optional commit-reveal for bids; private or protected submission for claims; consider TWAP/smoothing for auction steps.

5) Gas griefing via unbounded data growth
- Why: Unbounded arrays and mappings (e.g., `ethDonationWithInfoRecords`, donated NFTs) can grow indefinitely and make some operations expensive.
- Recommend: Add pagination to user-initiated bulk operations; dust limits for donations; caps per round where feasible.

6) Timestamp manipulation in pricing and eligibility
- Why: L2 sequencers can skew `block.timestamp` within bounds to influence Dutch auctions and eligibility windows.
- Recommend: Tolerances and slippage checks; use block-based periods where practical; document acceptable skew.

7) Overly large reserved storage gap can hinder future upgrades
- Why: `CosmicSignatureGameStorage` uses an extremely large fixed-size reserved array which complicates storage layout reasoning and can impede future variable additions.
```408:425:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGameStorage.sol
    // solhint-disable-next-line var-name-mixedcase
    uint256[1 << 255] private __gap_persistent;
    // ...
    // solhint-disable-next-line var-name-mixedcase
    uint256 private transient __gap_transient;
```
- Recommend: Replace with a conventional small gap (e.g., `uint256[50] __gap;`) at the end of each upgradeable storage-bearing contract; avoid experimental patterns unless formally validated.

8) CST burn authority centralized in `Game`
- Why: `CosmicSignatureToken` grants mint/burn only to `Game`; a compromised `Game` could arbitrarily affect balances.
- Recommend: Keep `Game` owner on multisig; add circuit breakers or bounded mint/burn flows; on-chain alerts for large mint/burns.

9) ETH refund swallow threshold depends on `tx.gasprice`
- Why: Heuristic may be surprising on L2; can lead to small overpayments retained by the contract.
```248:253:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
                uint256 ethBidRefundAmountToSwallowMaxLimit_ = ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice;
                if (uint256(overpaidEthPrice_) <= ethBidRefundAmountToSwallowMaxLimit_) {
                    overpaidEthPrice_ = int256(0);
                    paidEthPrice_ = msg.value;
```
- Recommend: Consider a fixed Wei threshold or always refund; make the threshold clearly configurable per-chain and emit an event when swallowing.

10) Chrono-warrior sentinel uses brittle `uint256(int256(-1))`
- Why: Sentinel casting to signed domain can be error-prone in refactors.
- Recommend: Prefer `type(uint256).max` with explicit boolean flags for initialization state.

11) Balance-manipulation edge cases
- Why: `address(this).balance` is used for percentage calculations; forced ETH can skew splits.
- Recommend: Track expected balances internally for split math; reconcile abnormal surpluses.

### Low / Info

12) Anyone can trigger `CharityWallet.send()`
- Why: Not harmful (owner controls the destination) but surprising operationally.
```28:36:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CharityWallet.sol
function send() external override nonReentrant /*onlyOwner*/ {
        uint256 amount_ = address(this).balance;
        _send(amount_);
}
```
- Recommend: Document the behavior or restrict to `onlyOwner`.

13) Auction halving math is safe from overflow in Solidity ≥0.8, but guardrails help
- Observation: Multiplication by 2 will revert on overflow (no wrap). Still, explicit upper bounds can improve clarity.
```103:110:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
        // Doubling this.
        // This can potentially overflow.
        // [/Comment-202508192]
        newEthDutchAuctionEndingBidPriceDivisor_ *= 2;
```
- Recommend: Add explicit input bounds for divisors and document acceptable ranges.

14) Events: consider more granular events for operational transparency (refund swallow, champion transitions, config snapshots at claim time).

---

## Upgradeability, access control, and reentrancy

- Upgradeability: The contract now relies on OpenZeppelin UUPS with `_authorizeUpgrade` only and inherits the safe upgrade path from OZ (includes proxiable checks and proxy-context guards). This resolves earlier concerns about direct `IMPLEMENTATION_SLOT` writes.
```146:164:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGame.sol
function _authorizeUpgrade(address newImplementationAddress_) internal view override
        onlyOwner
        _onlyRoundIsInactive {
}
```
- Access Control: Owner-only setters and upgrade authorization; recommend multisig owner and timelock for critical changes.
- Reentrancy: Extensive use of `ReentrancyGuardTransient(Upgradeable)` on external entrypoints and CEI ordering. ETH transfers use low-level `call` with state updates before effects.

---

## Test and monitoring recommendations

- Invariant tests: cumulative ETH percentages ≤ 100 and `claimMainPrize` succeeds under random configs.
- Fuzz: Dutch auction math boundaries; champions’ tracking throughout randomized timelines.
- Property tests: PrizesWallet registration immutability, on-behalf withdrawals post-timeout, staking deposit division-by-zero behavior.
- Monitoring: On-chain alerts for mint/burn anomalies, upgrade events, unusually large parameter shifts, and MEV-sensitive flows.

---

## Delta vs prior SECURITY_OVERVIEW.md (Dec 2024)

- Resolved: Prior Critical issue about custom `upgradeTo` writing `IMPLEMENTATION_SLOT` directly is no longer present. The game inherits OZ UUPS upgrade functions and only overrides `_authorizeUpgrade`.
- Clarified: The halving math overflow will revert in Solidity 0.8+; still advisable to bound configuration values.
- Reconfirmed: Percentage-sum invariant and `PrizesWallet` append-only enforcement remain the top fixes to prioritize.

---

## Quick fix checklist (priority)

1) **CRITICAL - IMMEDIATE**: Fix `claimMainPrize` main ETH transfer revert - this can permanently brick rounds! Options:
   - Make the transfer non-blocking (send to PrizesWallet on failure)
   - Use pull pattern where winner claims from PrizesWallet
   - Add emergency round closure mechanism
2) **CRITICAL**: Fix CharityWallet ETH lockup - either set charity address in constructor, add emergency withdrawal, or revert in `receive()` when address is zero.
3) **CRITICAL**: Handle ALL panics in staking wallet deposit, not just division by zero - other panics will brick `claimMainPrize`.
4) Enforce cumulative ETH percentage-sum invariant in setters and pre-flight check in `claimMainPrize`.
5) Make `PrizesWallet._registerRoundEnd` append-only with `require`s and zero-address checks.
6) Document prominently that NFTs can only be staked once in their lifetime - this is a major limitation users must understand.
7) Add bounds to pricing/divisor parameters; consider a fixed Wei threshold or always-refund policy for ETH overpayments; add event on swallow.
8) Replace chrono-warrior sentinel with explicit flags or `type(uint256).max`.
9) Implement internal balance tracking instead of using `address(this).balance` to prevent force-sent ETH from affecting calculations.
10) Override `renounceOwnership()` to prevent accidental ownership renunciation that would lock the system.
11) Add try-catch around token and NFT minting operations in `claimMainPrize` to prevent unexpected reverts.
12) Reduce reserved storage gap(s) to conventional sizes and remove experimental patterns not needed.
13) Document randomness limitations; consider commit-reveal/VRF for high-value scenarios; document timestamp tolerances.
14) Consider restricting `CharityWallet.send()` to owner or document its anyone-callable behavior.

---

## Final verdict

**CRITICAL ISSUES THAT ABSOLUTELY MUST BE FIXED**:

1. **claimMainPrize ETH transfer revert** - THE MOST CRITICAL ISSUE
   - Any smart contract winner can permanently brick a round by reverting on ETH receipt
   - This is an EXISTENTIAL THREAT that makes the protocol unusable
   - MUST implement non-blocking transfer or pull pattern

2. **CharityWallet ETH lockup** - Can permanently trap all charity donations if address not set

3. **Staking wallet panic handling** - Only catches division by zero; other panics brick claimMainPrize

4. **ETH percentage-sum invariant** - Can brick round closure if misconfigured

5. **PrizesWallet history rewriting** - Compromises custody integrity

**Bottom Line**: The ability for `claimMainPrize` to revert on ETH transfer is a critical vulnerability. A malicious actor could:
- Win a round with a smart contract
- Make that contract revert on ETH receipt
- Hold the entire protocol hostage indefinitely

This MUST be fixed before ANY production use. The recommended fix is straightforward:
- Make the main prize transfer non-blocking
- On failure, send funds to PrizesWallet for later claiming
- Never let a failed transfer brick the round

After implementing ALL critical fixes:
- Extensive testnet deployment with bug bounty program
- Consider formal verification for claimMainPrize
- Implement comprehensive monitoring for transfer failures
- Multi-sig ownership with timelock for critical operations
- Clear documentation of all edge cases and limitations

Current risk level: High — do not deploy to mainnet until critical fixes are implemented.
After critical fixes: Medium — suitable for a guarded launch with monitoring and limits.

---

## OpenZeppelin calls — potential revert conditions (full codebase sweep)

This section catalogs all usages of OpenZeppelin modules in the codebase and enumerates when those calls can revert, so operations and tests can be designed to anticipate and handle these cases.

### Access control and initialization

- onlyOwner modifiers (Ownable / OwnableUpgradeable)
  - All `onlyOwner`-gated setters in `SystemManagement`, `PrizesWallet`, `MarketingWallet`, `CharityWallet`, and upgrade authorization in `CosmicSignatureGame` can revert if the caller is not the owner.
  - In `CosmicSignatureGame.initialize`, `__Ownable_init(owner)` reverts if `owner` is zero or if initialization is attempted more than once (initializer guard).

- Initializable guards (all upgradeable modules)
  - `initialize` reverts if called again after the contract is initialized.
  - `__ReentrancyGuardTransient_init()` and `__UUPSUpgradeable_init()` are only callable during initialization; misordered calls outside init will revert.

### Upgrades (UUPSUpgradeable)

- Upgrade entrypoints (`upgradeTo`, `upgradeToAndCall`) inherited from OZ can revert when:
  - Not called through a proxy (onlyProxy guard).
  - Caller fails `_authorizeUpgrade` (we enforce `onlyOwner` and `_onlyRoundIsInactive`).
  - New implementation is not UUPS-proxiable (proxiableUUID mismatch) or is not a contract (empty code).

### Reentrancy guards (ReentrancyGuardTransient / Upgradeable)

- Any function marked `nonReentrant` will revert on re-entrancy into another `nonReentrant` function during the same top-level call.
  - Affects: bids, donations, prize claims, withdrawals, staking operations, and charity sends where annotated.

### ERC20 / ERC20Permit / ERC20Votes

- Minting and burning (`CosmicSignatureToken`)
  - `_mint(account, amount)` reverts if `account == address(0)`; with ERC20Votes, can also revert if vote/supply casting overflows OZ’s reduced-width types.
  - `_burn(account, amount)` reverts if `account == address(0)` or `balanceOf(account) < amount`.
  - Batch variants `mintMany`, `burnMany`, `mintAndBurnMany` propagate the same reverts per item.

- Transferring
  - `transfer(to, amount)` reverts if `to == address(0)` or sender’s balance is insufficient.
  - `transferMany(address[] tos, amount)` and `transferMany(MintSpec[])` loop `transfer`/`_transfer`; any single insufficient-balance or zero-address will revert the entire call.
  - In `MarketingWallet.payReward`/`payManyRewards`, calls revert if the wallet lacks CST balance.

- Permit (not directly used here)
  - If `permit` is invoked externally, OZ may revert on invalid signature, expired deadline, or non-matching nonce.

- Supply and votes width (ERC20Votes)
  - OZ tracks votes/supply using narrower types (e.g., 224-bit). Extremely large total supplies or balances that overflow those widths will revert via SafeCast checks. Code comments acknowledge this constraint.

### ERC721 / ERC721Enumerable

- Minting
  - `CosmicSignatureNft._mint(to, tokenId)` (via OZ) reverts if `to == address(0)` or `tokenId` already exists.
  - `RandomWalkNFT._safeMint(to, tokenId)` reverts if `to` is a contract that does not implement `IERC721Receiver`.

- Transfers (`transferFrom`)
  - `transferFrom(from, to, tokenId)` reverts if the caller is not owner/approved, if `to == address(0)`, or if `tokenId` does not exist.
  - Call sites that can revert:
    - `PrizesWallet.donateNft` and `claimDonatedNft` (moving donated NFTs between donor/holder/beneficiary).
    - `StakingWalletRandomWalkNft` stake/unstake.
    - `StakingWalletCosmicSignatureNft` stake/unstake.

- Authorization checks
  - `CosmicSignatureNft.setNftName` calls OZ’s `_checkAuthorized(_ownerOf(tokenId), caller, tokenId)` which reverts with standard ERC721 errors if not authorized.

### SafeERC20 (PrizesWallet, DonatedTokenHolder)

- `SafeERC20.safeTransferFrom(token, from, to, amount)`
  - Reverts if the token call fails or returns `false`, or if `from` has insufficient allowance/balance.
  - Used in `PrizesWallet.donateToken` and `PrizesWallet._claimDonatedToken`.

- `SafeERC20.forceApprove(token, spender, amount)`
  - Attempts approve; if token requires zero-reset first, it handles that pattern, but still reverts if the underlying calls revert or return `false`.
  - Used in `DonatedTokenHolder` constructor and `authorizeDeployerAsMyTokenSpender`.

### Math (OpenZeppelin Math)

- `Math.max(a, b)` is pure and does not revert.

### OpenZeppelin Panic helper

- `OpenZeppelinPanic.panic(code)` is used to bubble a panic as a revert in `MainPrize` catch block; calling it always reverts with the panic code.

### Typical scenarios to expect OZ reverts at runtime

- Owner-only admin methods called by non-owner.
- Re-entrancy attempts into guarded entrypoints.
- ERC20:
  - Attempted mint to the zero address; burn with insufficient balance; transfer or batch-transfer without sufficient balance or to zero address; hitting ERC20Votes width limits at extreme supply.
- ERC721:
  - Name set by unauthorized caller; transfers without approval; mint to non-receiver contract (safe mint path in `RandomWalkNFT`).
- SafeERC20:
  - Donations or claims without prior allowance; non-standard ERC20 behavior causing `safeTransferFrom`/`forceApprove` to fail.
- Upgrades:
  - Upgrade invoked directly on implementation (not via proxy), by non-owner, during an active round, to a non-UUPS implementation, or to a non-contract address.

No additional OZ functions in this codebase appear to have hidden revert paths beyond those listed. Unit/integration tests should explicitly exercise these failure modes to validate UX and error handling.

---

## Comprehensive revert map (project contracts)

This section lists all observable revert paths across our contracts, including custom errors, require conditions, panics (e.g., division by zero, over/underflow), low-level transfer failures, and dependency-induced reverts.

### AddressValidator

- `_providedAddressIsNonZero(address)` → reverts with `ZeroAddress` when `address(0)` is provided.
```13:17:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/AddressValidator.sol
function _checkProvidedAddressIsNonZero(address value_) internal pure {
    if (value_ == address(0)) {
        revert CosmicSignatureErrors.ZeroAddress("The provided address is zero.");
    }
}
```

### CosmicSignatureGame (upgradeable root)

- `initialize(owner)` (initializer) → reverts if already initialized or owner is invalid per OZ init guards.
- `_authorizeUpgrade(newImpl)` → `onlyOwner` and `_onlyRoundIsInactive` can revert (round active) when attempting to upgrade.
```152:164:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGame.sol
function _authorizeUpgrade(address newImplementationAddress_) internal view override
    onlyOwner
    _onlyRoundIsInactive {
}
```

### Bidding (ETH/CST) and BiddingBase

- Modifiers from `BiddingBase`:
  - `_onlyNonFirstRound` → `FirstRound` if `roundNum == 0`.
  - `_onlyRoundIsInactive` → `RoundIsActive` if current time ≥ `roundActivationTime`.
  - `_onlyRoundIsActive` → `RoundIsInactive` if current time < `roundActivationTime`.
  - `_onlyBeforeBidPlacedInRound` → `BidHasBeenPlacedInCurrentRound` if `lastBidderAddress != 0`.
```14:41:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/BiddingBase.sol
function _checkNonFirstRound() internal view {
    if ( ! (roundNum > 0) ) {
        revert CosmicSignatureErrors.FirstRound("This operation is invalid during the very first bidding round.");
    }
}
...
function _checkRoundIsInactive() internal view {
    uint256 roundActivationTimeCopy_ = roundActivationTime;
    if ( ! (block.timestamp < roundActivationTimeCopy_) ) {
        revert CosmicSignatureErrors.RoundIsActive("The current bidding round is already active.", roundActivationTimeCopy_, block.timestamp);
    }
}
...
function _checkRoundIsActive() internal view {
    uint256 roundActivationTimeCopy_ = roundActivationTime;
    if ( ! (block.timestamp >= roundActivationTimeCopy_) ) {
        revert CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", roundActivationTimeCopy_, block.timestamp);
    }
}
...
function _checkBeforeBidPlacedInRound() internal view {
    if ( ! (lastBidderAddress == address(0)) ) {
        revert CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.");
    }
}
```

- `receive()` and `bidWithEth` → `_bidWithEth`:
  - Reverts if `msg.value < current ETH bid price` with `InsufficientReceivedBidAmount`.
  - If bidding with RandomWalk NFT:
    - `UsedRandomWalkNft` if already used.
    - `CallerIsNotNftOwner` if `ownerOf(nftId)` is not caller (note OZ `ownerOf` itself reverts on non-existent token).
  - Message length: `TooLongBidMessage`.
  - First bid in round must be ETH: `WrongBidType` if `msg.value == 0` on first bid.
  - ETH refund path: low-level transfer failure → `FundTransferFailed`.
```266:270:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, msg.value);
```
```284:305:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
require(
    usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0,
    CosmicSignatureErrors.UsedRandomWalkNft(
        "This Random Walk NFT has already been used for bidding.",
        uint256(randomWalkNftId_)
    )
);
require(
    _msgSender() == randomWalkNft.ownerOf(uint256(randomWalkNftId_)),
    CosmicSignatureErrors.CallerIsNotNftOwner(
        "You are not the owner of this Random Walk NFT.",
        randomWalkNft,
        uint256(randomWalkNftId_),
        _msgSender()
    )
);
```
```668:684:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
require(
    bytes(message_).length <= bidMessageLengthMaxLimit,
    CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message_).length)
);
...
require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));
```
```352:359:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
(bool isSuccess_, ) = _msgSender().call{value: uint256(overpaidEthPrice_)}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", _msgSender(), uint256(overpaidEthPrice_));
}
```

- `bidWithCst` / `_bidWithCst`:
  - Reverts if computed CST price exceeds `priceMaxLimit_` with `InsufficientReceivedBidAmount`.
  - Burns bidder’s CST: `token.mintAndBurnMany` will revert if bidder lacks balance (OZ `_burn` underflow).
```519:522:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
require(
    paidPrice_ <= priceMaxLimit_,
    CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_)
);
```

- `halveEthDutchAuctionEndingBidPrice`:
  - Access: `onlyOwner`, `_onlyNonFirstRound`, `_onlyBeforeBidPlacedInRound` (see modifiers above).
  - State/time: `InvalidOperationInCurrentState("Too early.")` if auction hasn’t ended.
  - Arithmetic reverts (Solidity 0.8):
    - Overflow on `newEthDutchAuctionEndingBidPriceDivisor_ *= 2`.
    - Divide by zero in `_getEthDutchAuctionDuration()` if `ethDutchAuctionDurationDivisor == 0`.
    - Divide by zero in new duration calculation if denominator evaluates to 0 (edge-case config).
```89:107:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
if ( ! (ethDutchAuctionElapsedDuration_ > int256(ethDutchAuctionDuration_)) ) {
    revert CosmicSignatureErrors.InvalidOperationInCurrentState("Too early.");
}
...
newEthDutchAuctionEndingBidPriceDivisor_ *= 2;
```
```469:480:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
function _getEthDutchAuctionDuration() private view returns (uint256) {
    uint256 ethDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor;
    return ethDutchAuctionDuration_;
}
```
```622:629:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/Bidding.sol
function _getCstDutchAuctionDuration() private view returns (uint256) {
    uint256 cstDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor;
    return cstDutchAuctionDuration_;
}
```

### MainPrize and MainPrizeBase

- `claimMainPrize()`:
  - If caller is last bidder: requires `block.timestamp ≥ mainPrizeTime` → `MainPrizeEarlyClaim` otherwise.
  - If caller is not last bidder:
    - Requires that at least one bid exists → `NoBidsPlacedInCurrentRound` otherwise.
    - Requires timeout past `mainPrizeTime + timeoutDurationToClaimMainPrize` → `MainPrizeClaimDenied` otherwise.
```114:135:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
if (_msgSender() == lastBidderAddress) {
    require(
        block.timestamp >= mainPrizeTime,
        CosmicSignatureErrors.MainPrizeEarlyClaim("Not enough time has elapsed.", mainPrizeTime, block.timestamp)
    );
} else {
    require(
        lastBidderAddress != address(0),
        CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet.")
    );
    int256 durationUntilOperationIsPermitted_ = getDurationUntilMainPrizeRaw() + int256(timeoutDurationToClaimMainPrize);
    require(
        durationUntilOperationIsPermitted_ <= int256(0),
        CosmicSignatureErrors.MainPrizeClaimDenied(
            "Only the last bidder is permitted to claim the bidding round main prize before a timeout expires.",
            lastBidderAddress,
            _msgSender(),
            uint256(durationUntilOperationIsPermitted_)
        )
    );
}
```

- `_distributePrizes()`:
  - Minting CST to addresses (marketing wallet, endurance champion, last CST bidder) → `token.mintMany` reverts if any account is `address(0)`.
  - Minting CS NFTs to multiple addresses → `nft.mintMany` reverts if any recipient is `address(0)`.
  - Deposit to NFT staking wallet may revert with `panic` (e.g., division by zero). Non-division panics are bubbled (reverted) via `OpenZeppelinPanic.panic(errorCode_)`.
  - Final main prize ETH transfer to beneficiary → low-level call; reverts with `FundTransferFailed` on failure.
```535:549:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
try stakingWalletCosmicSignatureNft.deposit{value: cosmicSignatureNftStakingTotalEthRewardAmount_}(roundNum) {
    // ...
} catch Panic(uint256 errorCode_) {
    if(errorCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {
        OpenZeppelinPanic.panic(errorCode_);
    }
    charityEthDonationAmount_ += cosmicSignatureNftStakingTotalEthRewardAmount_;
}
```
```600:605:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrize.sol
(bool isSuccess_, ) = _msgSender().call{value: mainEthPrizeAmount_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to bidding round main prize beneficiary failed.", _msgSender(), mainEthPrizeAmount_);
}
```

- `MainPrizeBase.getInitialDurationUntilMainPrize()`:
  - Division by zero panic if `initialDurationUntilMainPrizeDivisor == 0` (configurable via `SystemManagement`).
```15:17:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MainPrizeBase.sol
uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
```

### SystemManagement (owner setters)

- All setters are `onlyOwner` and most are `_onlyRoundIsInactive` → revert while round is active.
- `setRoundActivationTime` → `_onlyBeforeBidPlacedInRound` can revert if a bid was already placed.
- Address setters (`setCosmicSignatureToken`, `setRandomWalkNft`, `setCosmicSignatureNft`, `setPrizesWallet`, `setStakingWalletRandomWalkNft`, `setStakingWalletCosmicSignatureNft`, `setMarketingWallet`, `setCharityAddress`) enforce non-zero addresses.
```27:37:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/SystemManagement.sol
function setRoundActivationTime(uint256 newValue_) external override onlyOwner /*_onlyRoundIsInactive*/ _onlyBeforeBidPlacedInRound {
    _setRoundActivationTime(newValue_);
}
```

### PrizesWallet (custody/timeouts)

- Access control: `_onlyGame` guards → `UnauthorizedCaller` if called by non-Game.
- `withdrawEth(address)` → requires timeout for on-behalf withdrawals; otherwise `EthWithdrawalDenied`.
- `_withdrawEth` → low-level ETH transfer; `FundTransferFailed` on failure.
- `donateToken`/`claimDonatedToken` → `SafeERC20.safeTransferFrom` can revert on insufficient allowance/balance or non-compliant token.
- `claimDonatedNft` → reverts on invalid index or already claimed; on timeout not reached; `transferFrom` can revert if NFT transfer fails.
```85:89:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
function _checkOnlyGame() private view {
    if (_msgSender() != game) {
        revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
    }
}
```
```209:223:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
require(
    block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
    CosmicSignatureErrors.EthWithdrawalDenied(
        "Only the ETH prize winner is permitted to withdraw their balance before a timeout expires.",
        prizeWinnerAddress_,
        _msgSender(),
        roundTimeoutTimeToWithdrawPrizes_,
        block.timestamp
    )
);
```
```236:241:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
(bool isSuccess_, ) = _msgSender().call{value: ethBalanceAmountCopy_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("ETH withdrawal failed.", _msgSender(), ethBalanceAmountCopy_);
}
```
```300:312:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
require(
    block.timestamp >= roundTimeoutTimeToWithdrawPrizes_ && roundTimeoutTimeToWithdrawPrizes_ > 0,
    CosmicSignatureErrors.DonatedTokenClaimDenied(
        "Only the bidding round main prize beneficiary is permitted to claim this ERC-20 token donation before a timeout expires.",
        roundNum_,
        _msgSender(),
        tokenAddress_,
        roundTimeoutTimeToWithdrawPrizes_,
        block.timestamp
    )
);
```
```407:411:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/PrizesWallet.sol
if (index_ >= nextDonatedNftIndex) {
    revert CosmicSignatureErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", _msgSender(), index_);
}
revert CosmicSignatureErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", _msgSender(), index_);
```

### StakingWalletRandomWalkNft

- Inherits `_stake` guard (`NftHasAlreadyBeenStaked`).
- `unstake(stakeActionId)`:
  - Reverts with `NftStakeActionInvalidId` if ID is invalid, or `NftStakeActionAccessDenied` if caller is not original staker.
  - NFT transfers (`transferFrom`) can revert on lack of approval or other ERC721 constraints.
```139:147:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletRandomWalkNft.sol
if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
    if (stakeActionCopy_.nftOwnerAddress == address(0)) {
        revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
    } else {
        revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
    }
}
```

### StakingWalletCosmicSignatureNft

- Inherits `_stake` guard (`NftHasAlreadyBeenStaked`).
- `unstake` and `unstakeMany`:
  - Same invalid/access checks as above.
  - `_payReward(amount)` uses low-level ETH transfer and reverts with `FundTransferFailed` if it fails (even for zero amount it is harmless).
- `deposit(roundNum)`:
  - Division by zero panic if called when `numStakedNfts == 0` (by design; upstream caller handles via try/catch in `MainPrize`).
- `tryPerformMaintenance`:
  - Reverts with `ThereAreStakedNfts` unless there are zero staked NFTs.
```210:217:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletCosmicSignatureNft.sol
if (_msgSender() != stakeActionCopy_.nftOwnerAddress) {
    if (stakeActionCopy_.nftOwnerAddress == address(0)) {
        revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
    } else {
        revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, _msgSender());
    }
}
```
```250:256:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletCosmicSignatureNft.sol
(bool isSuccess_, ) = _msgSender().call{value: rewardAmount_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("NFT staking ETH reward payment failed.", _msgSender(), rewardAmount_);
}
```
```271:289:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletCosmicSignatureNft.sol
uint256 rewardAmountPerStakedNftIncrement_ = msg.value / numStakedNftsCopy_;
...
emit EthDepositReceived(roundNum_, newActionCounter_, msg.value, newRewardAmountPerStakedNft_, numStakedNftsCopy_);
```
```309:313:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletCosmicSignatureNft.sol
require(numStakedNfts == 0, CosmicSignatureErrors.ThereAreStakedNfts("There are still staked NFTs."));
```

### StakingWalletNftBase

- `_stake(nftId)` → `NftHasAlreadyBeenStaked` if the NFT was used before for staking.
```65:70:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletNftBase.sol
require(
    usedNfts[nftId_] == 0,
    CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
);
```

### CharityWallet

- `_send(amount)`:
  - Requires non-zero `charityAddress` → `ZeroAddress` otherwise.
  - Low-level ETH transfer reverts with `FundTransferFailed` if failed.
```39:50:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CharityWallet.sol
address charityAddressCopy_ = charityAddress;
require(charityAddressCopy_ != address(0), CosmicSignatureErrors.ZeroAddress("Charity address not set."));
(bool isSuccess_, ) = charityAddressCopy_.call{value: amount_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to charity failed.", charityAddressCopy_, amount_);
}
```

### CosmicSignatureToken (ERC20 + Votes + Permit)

- Access control: `_onlyGame` guard on mint/burn variants → `UnauthorizedCaller` if caller is not `game`.
- ERC20 reverts:
  - `_mint(to, amount)` → `to == address(0)`.
  - `_burn(from, amount)` → insufficient balance.
  - `_transfer(from, to, amount)` → insufficient balance or `to == address(0)`.
- Batch transfers (`transferMany`) propagate single-call failures and revert entire batch.
```71:75:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureToken.sol
if (_msgSender() != game) {
    revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
}
```

### CosmicSignatureNft (ERC721Enumerable)

- Access control: `_onlyGame` for mint/mintMany → `UnauthorizedCaller` if caller is not `game`.
- `setNftName`:
  - Authorization: OZ `_checkAuthorized` reverts if caller not owner/approved.
  - Validation: `TooLongNftName` if name length exceeds limit.
```145:155:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureNft.sol
_checkAuthorized(_ownerOf(nftId_), _msgSender(), nftId_);
if (bytes(nftName_).length > CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_NFT_NAME_LENGTH_MAX_LIMIT) {
    revert CosmicSignatureErrors.TooLongNftName("NFT name is too long.", bytes(nftName_).length);
}
```

### EthDonations / NftDonations

- `donateEth` / `donateEthWithInfo` → guarded by `nonReentrant`; no internal `require`/`revert`. Reentrancy attempts revert.
- `NftDonations` is empty (no reverts).

### MarketingWallet

- Access control: `onlyOwner` for `setTreasurerAddress`; custom `_onlyTreasurer` for payments → `UnauthorizedCaller` if caller is not treasurer.
- `setTreasurerAddress` → `_providedAddressIsNonZero` reverts on zero.
- `payReward`/`payManyRewards` → token transfers can revert on insufficient CST balance or zero destination (batched call reverts whole batch).
```50:53:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/MarketingWallet.sol
if (_msgSender() != treasurerAddress) {
    revert CosmicSignatureErrors.UnauthorizedCaller("Only the tresurer is permitted to call this method.", _msgSender());
}
```

### DonatedTokenHolder

- Access control: `_onlyDeployer` → `UnauthorizedCaller` if caller is not deploying `PrizesWallet`.
- `forceApprove` via `SafeERC20` can revert on non-standard token behavior.
```23:27:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/DonatedTokenHolder.sol
if (msg.sender != _deployerAddress) {
    revert CosmicSignatureErrors.UnauthorizedCaller("Deployer only.", msg.sender);
}
```

### RandomWalkNFT (external legacy dependency)

- `withdraw()` → reverts unless caller is `lastMinter` and timeout elapsed; ETH transfer revert on failure.
- `mint()` → reverts if `msg.value < price` or sale not open; refund transfer revert on failure.
- `setTokenName()` → reverts on unauthorized or too-long name.
```125:131:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/RandomWalkNFT.sol
require(_msgSender() == lastMinter, "Only last minter can withdraw.");
require(timeUntilWithdrawal() == 0, "Not enough time has elapsed.");
```
```153:157:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/RandomWalkNFT.sol
require(msg.value >= newPrice, "The value submitted with this transaction is too low.");
require(block.timestamp >= saleTime, "The sale is not open yet.");
```

### Panic (Solidity runtime) scenarios across code

- Division by zero:
  - `MainPrizeBase.getInitialDurationUntilMainPrize()` if `initialDurationUntilMainPrizeDivisor == 0`.
  - `Bidding._getEthDutchAuctionDuration()` if `ethDutchAuctionDurationDivisor == 0`.
  - `Bidding._getCstDutchAuctionDuration()` if `cstDutchAuctionDurationDivisor == 0`.
  - `StakingWalletCosmicSignatureNft.deposit()` if `numStakedNfts == 0`.
  - Raffle calculations: Any percentage calculations in `SecondaryPrizes` could theoretically divide by zero if percentage configuration is mishandled.
- Arithmetic overflow/underflow (0.8 auto-reverts unless `unchecked`):
  - `halveEthDutchAuctionEndingBidPrice`: `* 2` may overflow if divisor near max; numerator/denominator multiplications can overflow with extreme config.
  - `_unstake` in `StakingWalletCosmicSignatureNft`: `rewardAmountPerStakedNft - initialRewardAmountPerStakedNft` would underflow only if reward ever decreases (not expected by design).
  - Price calculations: Multiple price calculations involving multiplication could overflow with extreme configuration values.
  - Note: SecondaryPrizes calculations use `unchecked` blocks, so overflow/underflow won't revert there but could produce incorrect results.
- Array out-of-bounds access:
  - All array accesses are bounds-checked by Solidity 0.8+, causing panic on invalid index.
  - Could occur in raffle winner selection if indices are miscalculated.
  - Could occur in batch operations if array lengths mismatch or are incorrectly handled.

---

### Governor (DAO) specific reverts

The `CosmicSignatureDao` contract inherits from OpenZeppelin's Governor contracts and can revert in the following scenarios:

- Constructor:
  - Reverts if `tokenAddress_ == address(0)` via `_providedAddressIsNonZero` modifier.
  - Reverts if quorum percentage is invalid (> 100) via `GovernorVotesQuorumFraction`.

- Proposal creation (`propose`):
  - Reverts if proposer lacks sufficient voting power (< `proposalThreshold()`).
  - Reverts if targets/values/calldatas arrays have mismatched lengths.
  - Reverts if proposal is empty (no targets).
  - Reverts if proposal already exists (duplicate proposal).

- Voting (`castVote`, `castVoteWithReason`, `castVoteBySig`):
  - Reverts if proposal doesn't exist.
  - Reverts if voting hasn't started yet (before voting delay).
  - Reverts if voting period has ended.
  - Reverts if voter has already voted.
  - Reverts if vote type is invalid (not 0=Against, 1=For, 2=Abstain).
  - For signature-based voting: reverts on invalid signature, expired deadline, or nonce mismatch.

- Proposal execution (`execute`):
  - Reverts if proposal hasn't succeeded (didn't reach quorum or majority).
  - Reverts if proposal is not ready for execution (timelock not expired).
  - Reverts if any of the proposal's calls revert.
  - Reverts if proposal was already executed.

- Proposal cancellation (`cancel`):
  - Reverts if proposal is already executed.
  - Reverts if caller is not the proposer (for proposals above threshold).

- State queries:
  - Won't revert but may return unexpected values if queried for non-existent proposals.

---

### Additional library-specific considerations

- `RandomNumberHelpers`:
  - No explicit reverts, but Arbitrum precompile calls are wrapped in try-catch pattern via low-level calls in `ArbitrumHelpers`.
  - If precompiles fail, events are emitted but execution continues with degraded randomness.

- `ArbitrumHelpers`:
  - Uses low-level calls to Arbitrum precompiles that won't revert but will return `isSuccess_ = false`.
  - Emits `ArbitrumError` events when precompile calls fail.

- `CryptographyHelpers`:
  - No reverts; uses inline assembly for efficient hashing.

- `CosmicSignatureEvents` and `CosmicSignatureConstants`:
  - Library of events and constants; no executable code that can revert.

---

### Cross-contract interaction reverts

- External calls between contracts:
  - Any external call to a contract that doesn't exist or has no code will revert.
  - Calls to contracts with insufficient gas will revert with out-of-gas.
  - Delegate calls (not used in this codebase) would have additional revert scenarios.

- Token/NFT interactions:
  - Calls to malicious or non-compliant ERC20/ERC721 tokens could revert unexpectedly.
  - This is partially mitigated by using SafeERC20 for token operations.

---

### Gas-related reverts

- Out-of-gas:
  - Unbounded loops in batch operations could consume all gas.
  - Deep call stacks during complex operations could exceed gas limits.
  - Large data operations (e.g., returning huge arrays) could exceed gas limits.

- Block gas limit:
  - Transactions requiring more gas than block limit will revert before execution.

---

### Important non-reverting edge cases (silent failures)

While this document focuses on reverts, it's important to note scenarios where the code WON'T revert but may behave unexpectedly:

- `unchecked` blocks in `SecondaryPrizes`:
  - Percentage calculations use `unchecked` blocks, so arithmetic overflow/underflow won't revert.
  - Could silently produce incorrect prize amounts if percentages are misconfigured.
  - Located in `getChronoWarriorEthPrizeAmount()`, `getRaffleTotalEthPrizeAmountForBidders()`, and `getCosmicSignatureNftStakingTotalEthRewardAmount()`.

- Randomness degradation:
  - If Arbitrum precompiles fail, `RandomNumberHelpers` continues with degraded randomness rather than reverting.
  - This is by design but could impact fairness in edge cases.

- ETH refund swallowing:
  - Small ETH overpayments below the configured threshold are kept rather than refunded.
  - Not a revert, but could surprise users.

- Zero-amount operations:
  - Many functions allow zero-amount transfers/operations that succeed without effect.
  - Could mask logic errors in calling code.

---

### Custom error definitions summary

All custom errors are defined in `CosmicSignatureErrors` library:

**Bidding errors:**
- `FirstRound` - Action invalid during first round
- `RoundIsInactive` / `RoundIsActive` - Round state mismatch
- `NoBidsPlacedInCurrentRound` / `BidHasBeenPlacedInCurrentRound` - Bid state requirements
- `WrongBidType` - Invalid bid type for current state
- `InsufficientReceivedBidAmount` - Bid amount too low
- `TooLongBidMessage` - Message exceeds length limit
- `UsedRandomWalkNft` - NFT already used for bidding
- `CallerIsNotNftOwner` - Unauthorized NFT usage

**Prize errors:**
- `MainPrizeEarlyClaim` - Claiming before allowed time
- `MainPrizeClaimDenied` - Unauthorized claim attempt
- `TooLongNftName` - NFT name exceeds limit

**Wallet errors:**
- `EthWithdrawalDenied` - Unauthorized withdrawal
- `DonatedTokenClaimDenied` / `DonatedNftClaimDenied` - Unauthorized donation claim
- `InvalidDonatedNftIndex` / `DonatedNftAlreadyClaimed` - Invalid donation state

**Staking errors:**
- `ThereAreStakedNfts` - Operation blocked by staked NFTs
- `NftHasAlreadyBeenStaked` - Duplicate staking attempt
- `NftStakeActionInvalidId` / `NftStakeActionAccessDenied` - Invalid staking operation

**General errors:**
- `UnauthorizedCaller` - Caller lacks required permissions
- `FundTransferFailed` - ETH transfer failure
- `ZeroAddress` - Invalid zero address provided
- `InvalidOperationInCurrentState` - Operation not allowed in current state

---

## CRITICAL ANALYSIS: Can claimMainPrize Revert?

Verification result: claimMainPrize CAN revert. Below are all concrete revert vectors, their exact triggers, and how to eliminate them.

This comprehensive analysis traces every code path in `claimMainPrize` to identify ALL possible revert conditions. This is the most critical function in the system - if it reverts, the round cannot be closed and funds become locked.

### Summary of Revert Scenarios (in order of severity)

1. CRITICAL: Final main ETH transfer to winner reverts (recipient rejects ETH or gas grief) — lines 600–605
2. HIGH: Minting to zero address (e.g., `marketingWallet` unset) during CST mints — line 416
3. HIGH: Insufficient ETH due to misconfigured percentages causes subsequent value-transfers to fail
   - Staking wallet deposit with value can revert; current try/catch only handles division-by-zero
4. MEDIUM: Entry condition checks (time/timeout) — lines 110–135
5. LOW: Rare OZ internal failures (e.g., ERC20Votes supply width limits) or arithmetic panics in boundary configs

### Detailed Analysis of Each Code Path

#### 1. Entry Conditions (Lines 110-135)
**Can Revert: YES**

The function starts with access control checks that can revert:

a) **If caller is the last bidder:**
```solidity
require(
    block.timestamp >= mainPrizeTime,
    CosmicSignatureErrors.MainPrizeEarlyClaim("Not enough time has elapsed.", mainPrizeTime, block.timestamp)
);
```
- **Reverts if:** Called before `mainPrizeTime` is reached
- **Impact:** Temporary - just wait until time passes

b) **If caller is NOT the last bidder:**
```solidity
require(
    lastBidderAddress != address(0),
    CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet.")
);
```
- **Reverts if:** No bids have been placed in the round
- **Impact:** Cannot claim until at least one bid is placed

```solidity
require(
    durationUntilOperationIsPermitted_ <= int256(0),
    CosmicSignatureErrors.MainPrizeClaimDenied(...)
);
```
- **Reverts if:** Timeout period hasn't expired for non-last-bidder claims
- **Impact:** Temporary - wait for timeout

#### 2. Champion Update Functions (Lines 143-144)
**Can Revert: NO**

`_updateChampionsIfNeeded()` and `_updateChronoWarriorIfNeeded()`:
- Pure computation and state updates
- No external calls
- No require statements
- Uses some unchecked arithmetic but won't overflow/underflow in practice
- **Verdict: SAFE**

#### 3. Prize Distribution (`_distributePrizes`) - Lines 156-609

##### 3a. Random Walk NFT Staker Selection (Line 224)
**Can Revert: NO**
```solidity
address[] memory luckyStakerAddresses_ = 
    stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(...)
```
- This is a `view` function
- Returns empty array if no stakers
- No state changes, no reverts
- **Verdict: SAFE**

##### 3b. Cosmic Signature NFT Minting (Line 307)
**Can Revert: YES (unlikely)**
```solidity
firstCosmicSignatureNftId_ = nft.mintMany(roundNum, cosmicSignatureNftOwnerAddresses_, randomNumberSeed_);
```
- **Could revert if:**
  - Any recipient address is `address(0)` - but all addresses are validated non-zero
  - ERC721 token ID collision (extremely unlikely with sequential IDs)
  - ERC721Enumerable internal overflow (would require 2^256 NFTs)
- **Mitigation:** All recipient addresses are guaranteed non-zero at this point
- **Risk: LOW**

##### 3c. Cosmic Signature Token Minting (Line 416)
**Can Revert: YES (unlikely)**
```solidity
token.mintMany(cosmicSignatureTokenMintSpecs_);
```
- **Could revert if:**
  - Minting to `address(0)` — notably if `marketingWallet` was never set
  - ERC20Votes supply overflow (limited to 208 bits in OpenZeppelin)
  - Would require total supply > 2^208 tokens
- **Mitigation:** Ensure `marketingWallet` is set to a non-zero address before first claim; endurance champion and last CST bidder are non-zero when present
- **Risk: LOW**

##### 3d. PrizesWallet ETH Deposits (Line 519)
**Can Revert: YES (unlikely)**
```solidity
prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, _msgSender(), ethDeposits_);
```
- **Could revert if:**
  - `_onlyGame` modifier fails (impossible - Game is calling)
  - Reentrancy detected (protected by nonReentrant)
  - ETH value mismatch (calculated correctly in same function)
- **Risk: VERY LOW**

##### 3e. Staking Wallet Deposit (Lines 535-553)
**Can Revert: PARTIALLY HANDLED**
```solidity
try stakingWalletCosmicSignatureNft.deposit{value: cosmicSignatureNftStakingTotalEthRewardAmount_}(roundNum) {
    // success
} catch Panic(uint256 errorCode_) {
    if(errorCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {
        OpenZeppelinPanic.panic(errorCode_);  // RE-THROWS OTHER PANICS!
    }
    charityEthDonationAmount_ += cosmicSignatureNftStakingTotalEthRewardAmount_;
}
```
- **Handles:** Division by zero (when no NFTs staked)
- **DOES NOT HANDLE:** Other panics (overflow, underflow, array out-of-bounds) or value-transfer failures due to insufficient ETH
- **Will revert if:** Any panic other than division by zero occurs, or the call cannot be funded (insufficient balance)
- **Risk: MEDIUM**

##### 3f. Charity ETH Transfer (Lines 566-579)
**Can Revert: NO**
```solidity
(bool isSuccess_, ) = charityAddress.call{value: charityEthDonationAmount_}("");
if (isSuccess_) {
    emit CosmicSignatureEvents.FundsTransferredToCharity(...);
} else {
    emit CosmicSignatureEvents.FundTransferFailed(...);
}
```
- Transfer failure is handled gracefully
- Only emits different events based on success
- **Verdict: SAFE**

##### 3g. ⚠️ **CRITICAL: Main Prize ETH Transfer (Lines 599-606)**
**Can Revert: YES - THIS IS THE BIGGEST RISK**
```solidity
(bool isSuccess_, ) = _msgSender().call{value: mainEthPrizeAmount_}("");
if ( ! isSuccess_ ) {
    revert CosmicSignatureErrors.FundTransferFailed(
        "ETH transfer to bidding round main prize beneficiary failed.", 
        _msgSender(), 
        mainEthPrizeAmount_
    );
}
```

**THIS WILL DEFINITELY REVERT IF:**
1. **Winner is a contract that reverts in its receive/fallback function**
2. **Winner is a contract with no payable receive/fallback** or otherwise rejects ETH
3. **Winner's receive function consumes > 63/64 of available gas** (or intentionally reverts)
4. **Winner is a contract that's been destroyed**

**Impact: CATASTROPHIC** - The round cannot be closed until this succeeds

#### 4. Prepare Next Round (Line 146)
**Can Revert: NO**

`_prepareNextRound()`:
- Only state variable updates
- Simple arithmetic (increment round number)
- No external calls
- **Verdict: SAFE**

### Critical Finding: Main Prize Transfer Can Brick Rounds

The most severe issue is that **the main ETH prize transfer to the winner is the LAST operation and WILL REVERT if it fails**. This creates multiple attack vectors:

1. **Malicious Winner Attack**: A winner could intentionally make their address revert to hold the round hostage
2. **Accidental Lockup**: A winner using a smart contract wallet that doesn't accept ETH would brick the round
3. **Gas Griefing**: A contract could consume excessive gas to cause the transfer to fail

### Recommendations to Fix This Critical Issue

#### Priority 1: Make Main Prize Transfer Non-Blocking
```solidity
// Option A: Send to PrizesWallet on failure
(bool isSuccess_, ) = _msgSender().call{value: mainEthPrizeAmount_}("");
if (!isSuccess_) {
    // Don't revert - send to PrizesWallet instead
    prizesWallet.depositEth{value: mainEthPrizeAmount_}(roundNum, _msgSender());
    emit MainPrizeTransferFailed(_msgSender(), mainEthPrizeAmount_);
}

// Option B: Use pull pattern - winner must claim from PrizesWallet
// Never transfer directly in claimMainPrize
```

#### Priority 2: Add Emergency Round Closure
- Add an emergency function that can close a round without transferring the main prize
- Require governance/timelock for this function
- Move failed prizes to PrizesWallet for later claiming

#### Priority 3: Fix Other Revert Scenarios
1. Handle ALL panics in staking wallet deposit, not just division by zero
2. Add try-catch around NFT and token minting operations
3. Consider making all prize distributions non-blocking

### Main Prize Claim Revert Matrix (step-by-step)

- Preconditions (lines 110–135):
  - Fails if called too early by last bidder (MainPrizeEarlyClaim)
  - Fails if called by non-last-bidder before timeout (MainPrizeClaimDenied)
  - Fails if no bids in round (NoBidsPlacedInCurrentRound)

- Prize accounting and registration:
  - PrizesWallet registration and ETH deposits: generally safe; will revert if `_onlyGame` violated (not possible here) or if value accounting is incorrect (not observed)

- CST mints (line 416):
  - Reverts if any recipient is zero (notably `marketingWallet` unset) or in extreme supply-width overflow

- NFT mints (line 307):
  - Reverts on zero recipient (not expected in current flow) or ERC721 invariant violation (very unlikely)

- Staking ETH deposit (lines 535–553):
  - Division-by-zero handled; other panics or insufficient value cause revert (not caught)

- Charity ETH transfer (lines 566–579):
  - Non-blocking; never reverts claim

- Final main prize ETH transfer (lines 600–605):
  - Reverts if recipient rejects ETH or gas griefs; this is the most critical blocker

### Severity Assessment

**Current State: UNACCEPTABLE RISK**
- Any smart contract winner can permanently brick a round
- This is an existential threat to the protocol

**With Recommended Fixes: ACCEPTABLE**
- Making the main prize transfer non-blocking eliminates the critical risk
- Other reverts are unlikely and have workarounds

---

## Comprehensive Asset Lockup Analysis

This section identifies ALL scenarios where ETH, tokens, or NFTs could become permanently stuck or temporarily inaccessible in the Cosmic Signature contracts.

### Critical Lockup Findings

#### 1. CharityWallet ETH Lockup (CRITICAL)
**Severity: Critical**
- **Scenario**: If `charityAddress` is not set (remains `address(0)`), ALL ETH sent to CharityWallet becomes permanently locked.
- **Impact**: The contract can receive ETH via `receive()` function but `send()` will always revert if charity address is zero.
- **Code Location**: 
```39:41:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CharityWallet.sol
address charityAddressCopy_ = charityAddress;
require(charityAddressCopy_ != address(0), CosmicSignatureErrors.ZeroAddress("Charity address not set."));
```
- **Recommendation**: Either:
  1. Set charity address in constructor and prevent it from being set to zero
  2. Add emergency withdrawal function for owner when charity address is zero
  3. Revert in `receive()` if charity address is not set

#### 2. NFT Permanent Staking Lockup (HIGH)
**Severity: High**
- **Scenario**: Each NFT can only be staked ONCE across its entire lifetime. After unstaking, the NFT can never be staked again.
- **Impact**: Reduces NFT utility and could trap value if users don't understand this limitation.
- **Code Location**:
```65:69:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/StakingWalletNftBase.sol
require(
    usedNfts[nftId_] == 0,
    CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
);
usedNfts[nftId_] = 1;
```
- **Recommendation**: Document this limitation prominently in user interfaces and consider allowing re-staking.

### High-Risk Lockup Scenarios

#### 3. PrizesWallet Donated Token Holder Pattern (MEDIUM-HIGH)
**Severity: Medium-High**
- **Scenario**: Donated ERC20 tokens are held in per-round `DonatedTokenHolder` contracts. If the holder contract creation fails or the token doesn't properly support transferFrom, tokens could be locked.
- **Impact**: Donated tokens might become irretrievable.
- **Mitigation in place**: Uses SafeERC20 for transfers, but holder pattern adds complexity.
- **Recommendation**: Consider holding all donated tokens directly in PrizesWallet with proper accounting.

#### 4. CosmicSignatureGame ETH Balance Dependency (MEDIUM)
**Severity: Medium**
- **Scenario**: The game uses `address(this).balance` for percentage calculations. If ETH is force-sent to the contract (via SELFDESTRUCT or block rewards), it affects all percentage-based distributions.
- **Impact**: Could skew prize distributions or cause unexpected behavior.
- **Code Locations**: All percentage calculations in `SecondaryPrizes` and `MainPrize`.
- **Recommendation**: Track expected balance internally rather than relying on `address(this).balance`.

### Medium-Risk Lockup Scenarios

#### 5. Ownership Renunciation Risk (MEDIUM)
**Severity: Medium**
- **Scenario**: If owner calls `renounceOwnership()` (inherited from OpenZeppelin Ownable):
  - System parameters cannot be updated
  - Contract cannot be upgraded
  - CharityWallet charity address cannot be changed
  - MarketingWallet treasurer cannot be changed
- **Impact**: System becomes immutable and cannot adapt to issues or changes.
- **Recommendation**: Override `renounceOwnership()` to prevent accidental renunciation or implement 2-step ownership transfer.

#### 6. Failed ETH Transfer Lockup (MEDIUM)
**Severity: Medium**
- **Scenario**: If a winner's address is a contract that reverts on ETH receipt, their prizes remain locked until timeout.
- **Affected Locations**:
  - MainPrize claiming
  - PrizesWallet withdrawals
  - Staking reward payments
- **Mitigation in place**: Timeout mechanism allows anyone to claim after timeout period.
- **Recommendation**: Consider pull-payment pattern or wrapped ETH option for contract recipients.

#### 7. Upgrade During Active Round Prevention (LOW-MEDIUM)
**Severity: Low-Medium**
- **Scenario**: Contract cannot be upgraded during active rounds. If a critical bug is discovered mid-round, it cannot be fixed until round ends.
- **Code Location**:
```152:161:/Users/tarasbobrovytsky/Dev/CosmicAug29/Cosmic-Signature/contracts/production/CosmicSignatureGame.sol
function _authorizeUpgrade(address newImplementationAddress_) internal view override
    onlyOwner
    _onlyRoundIsInactive {
}
```
- **Trade-off**: This ensures trustlessness but could trap funds if a critical bug prevents round closure.
- **Recommendation**: Consider emergency pause mechanism with strict governance.

### Low-Risk Lockup Scenarios

#### 8. Marketing Wallet CST Distribution (LOW)
**Severity: Low**
- **Scenario**: CST tokens sent to MarketingWallet can only be distributed by treasurer. If treasurer key is lost, tokens are locked.
- **Mitigation**: Owner can change treasurer address.
- **Recommendation**: Implement multi-sig or time-locked recovery mechanism.

#### 9. RandomWalk NFT Withdrawal Restrictions (LOW)
**Severity: Low**
- **Scenario**: Only last minter can withdraw ETH from RandomWalkNFT contract after timeout.
- **Impact**: Limited to external contract, not core system funds.
- **Note**: This is external legacy code and cannot be modified.

#### 10. Unclaimed Donations After Timeout (LOW)
**Severity: Low**
- **Scenario**: Donated NFTs and tokens have no recovery mechanism if unclaimed after extended periods.
- **Impact**: Donations remain in contract but are effectively lost if never claimed.
- **Recommendation**: Add admin recovery after extended timeout (e.g., 1 year).

### Additional Observations

#### Safe Patterns Identified:
1. **No ETH lockup in main game**: CosmicSignatureGame distributes all ETH in `claimMainPrize()`
2. **Timeout mechanisms**: PrizesWallet implements timeout for claiming by anyone
3. **SafeERC20 usage**: Prevents common token transfer issues
4. **Reentrancy guards**: Comprehensive protection against reentrancy attacks

#### Potential Dust Accumulation:
1. **Rounding dust**: Division operations in reward calculations may leave dust amounts
2. **Swallowed refunds**: Small ETH overpayments below threshold are kept
3. **Gas optimization**: Some operations may leave minimal amounts to save gas

### Testing Recommendations for Lockup Scenarios:

1. **CharityWallet**: Test sending ETH when charity address is zero
2. **Force-sent ETH**: Test behavior when ETH is force-sent via SELFDESTRUCT
3. **Reverting recipients**: Test prize claims with contracts that revert
4. **Token compatibility**: Test with various ERC20/721 implementations
5. **Ownership scenarios**: Test system behavior after ownership changes
6. **Timeout paths**: Verify all timeout-based recovery mechanisms

### Priority Fixes for Lockup Issues:

1. **CRITICAL**: Fix CharityWallet zero-address lockup
2. **HIGH**: Document NFT one-time staking limitation prominently
3. **MEDIUM**: Implement internal balance tracking instead of using `address(this).balance`
4. **LOW**: Add long-term recovery mechanisms for unclaimed donations

---

Actionable tests: Add negative-path test cases for every revert branch above to guarantee clear, user-friendly failures and prevent round-bricking via parameter misuse (especially divisors and percentage sums).


