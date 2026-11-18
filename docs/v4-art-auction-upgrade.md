# V4 artwork issuance and immutable auctions

V4 keeps the existing NFT collection and V3 participation/allocation rules. Each successful V4 cycle finalization creates a separate batch of exactly eight additional Cosmic Signature NFTs for the immutable art auction. The artwork batch has no paired CST. A separate V4 cycle grant transfers 8,000 CST to Chaos Zero. The same transaction registers the eight NFTs with fixed auction terms, including eligibility seven days after that transaction's timestamp. Registration failure reverts finalization, including all existing allocations and NFT/CST minting.

This branch implements and tests the change. The current undeployed candidate uses Solidity 0.8.38, as explicitly approved during the follow-up review. The deployed V3 fixture and branch remain pinned to their original 0.8.34 build. No production deployment or upgrade transaction is authorized.

## Contract integration

`MainPrizeV3._distributePrizes` is made `virtual`, with no change to its implementation. `MainPrizeV4` calls that existing implementation first, then makes one separate `nft.mintMany` call with eight auction-owned recipients. Existing recipient arrays, token ordering, counts, seed derivation, CST distribution and allocation events remain intact. The additional seed stream is domain-separated from the existing allocation stream.

Immediately after the extra mint, the game calls `ICosmicSignatureArtAuction.registerAuctionBatch(roundNum, firstNftId, artAuctionOpeningBid)`. There is no renderer call, no bidder callback, and no settling of previous auctions in finalization. The game does not catch a registration failure. The immutable auction verifies its caller and the latest eight NFT IDs in its custody, records the timestamp itself, and fixes the waiting lots' terms. Future cycles do not wait for earlier works to sell.

`artAuction()` identifies the deployment used for future batches. There is no pointer setter in V4. A later game upgrade may select a different auction deployment for subsequent batches; already registered lots, NFT custody, refunds and proceeds obligations remain in their original immutable auction. The game and NFT contracts retain their existing upgrade and metadata trust boundaries.

## Axiom Zero auction terms

The V4 initializer sets the opening bid to 0.001 ETH. During an inactive cycle, the existing game owner can call `setArtAuctionOpeningBid(priceInWei)` with a positive price. The game emits `ArtAuctionOpeningBidChanged` on initialization and updates. At each cycle close the auction stores the current price once for the whole eight-work batch. `AuctionBatchRegistered` includes this opening price, and `openingBidByRound(cycle)` provides the permanent value for that batch. A future configuration change cannot reprice a preview, an unbid lot or a live lot.

Axiom Zero reads `getAuction(tokenId)` and `minimumNextBid(tokenId)` before each transaction. Each individual lot becomes eligible seven days after registration. Its first funded bid starts a 48-hour clock. A new bid must raise the high bid by at least 10%, with the increase rounded up to the next whole wei. Late bids restore ten minutes to respond. A new leader escrows the full bid amount and the current leader funds only the difference on a self-raise. An outbid wallet can retrieve its credit. Anyone can settle an ended lot or forward its full settled price to the game reserve, and the winner chooses the delivery address.

The combined fork rehearsal registered cycle 4 at 0.001 ETH, set the next opening price to 0.002 ETH and registered cycle 5 at the new price. All 16 lots kept their batch price. The same rehearsal carried first-batch works through bidding, soft-close extensions, refund retrieval, NFT delivery and 133.101 ETH in total reserve payments. Reproduction details and the current source and bytecode hashes are under `axiomAuctionOpeningPrice` in [the verification record](v4-art-auction-verification.json).

## Storage and initialization

V4 consumes five slots from the final V3 persistent gap. Slot 314 holds the auction, 315 the Chaos Zero market, 316 the funding record mapping by market and cycle, 317 cumulative issuance by market, and 318 the opening bid for future auction batches. The resized gap starts at 319 and ends at its original boundary. It does not inherit the concrete `CosmicSignatureGameV3` leaf and append storage after that gap. Existing persistent variables and OpenZeppelin namespaces keep their positions.

The initializer is `initializeV4(address artAuction, address chaosZeroMarket)`. It:

- Requires the owner and an inactive cycle.
- Requires the previous initialized version to be exactly 3.
- Uses OpenZeppelin `reinitializer(4)`.
- Requires a deployed auction whose immutable `game()` is the current proxy and whose `nft()` is the game's existing NFT contract.
- Checks the market and its outcome source against this proxy and its CST. The V4 token setter prevents the collateral from diverging from the bound token.
- Records both companions and seeds the current inactive cycle. The mint, transfer and cycle record commit together. It emits `ArtAuctionConfigured` and `ChaosZeroCycleFunded`.

It does not reset any existing configured percentages, clocks, balances, NFT counts, or token/periphery addresses. The inherited no-argument `reinitialize()` deliberately reverts; it must not accidentally replay V3 parameter initialization or leave an unconfigured auction pointer.

Always call `upgradeToAndCall(newImplementation, encodeCall(initializeV4, (auction, chaosZeroMarket)))` atomically. A bare upgrade is unsupported: the owner alone could initialize it during the inactive interval, but if participation starts first, the inactive-cycle guard prevents initialization and finalization fails closed. Do not create that state. The legacy `upgrade-cosmic-signature-game` task rejects `CosmicSignatureGameV4` before resolving credentials or deploying, because its no-argument initializer configuration cannot express the required operation.

## Chaos Zero cycle funding

Each new cycle receives exactly 8,000 newly issued CST. The game mints to the proxy and transfers CST to the selected market in the same transaction as its funding record. Initialization covers the first V4 cycle. Subsequent closes advance the cycle number before issuing the grant. A clock change or gesture cannot issue a grant. The game receives no position, fees or repayment.

The successor market is constructor-deployed against the existing outcome source. It checks the game ledger and consumes the cumulative amount once, before a trade or split or on permissionless synchronization. Each of the eight questions receives 1,000 fresh CST. The market reserves old claims before carrying forward surplus, including unused grants from quiet cycles. An unrelated CST transfer never enters the pool or the grant ledger. Market settlement runs outside game finalization. The existing eight-question market and its claim vault remain at their original addresses.

Prepare the successor with the Chaos Zero repository's unsigned deployment tooling. Validate the reviewed creation bytecode, the fixed source and game identities, and the vault before preparing an atomic owner transaction in an inactive interval. The game never calls the market during normal rollover.

## Actual deployed V3 baseline

The fixture `test/data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV3.json` was captured before V4 source edits:

| Item | Recorded value |
| --- | --- |
| Source commit | `37fdc5e01fee9b4a1ef59fff35726d96775b3680` |
| Chain | Arbitrum One, 42161 |
| Observation block | 517222845 |
| Block hash | `0x29d83a6a14c4e5c9ca00ecb99c5ca727f9984f7fe093437e52cb124c8fb68982` |
| Proxy | `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` |
| V3 implementation | `0xc1b97E1b0baC86248653B18706dbC5c8898c5c06` |
| Runtime keccak256 | `0x09ed86da05e3ab5d01af13903804f63551c586bdb3379b2b3d039324f8fc1eee` |

Every project source in the original production build input matched the pinned commit. The compiled V3 runtime, including metadata, matched the RPC-returned runtime byte for byte after substituting the implementation address at the compiler's two UUPS immutable references. The fixture records that runtime and the build's OpenZeppelin storage layout. It is independent of subsequently recompiling current V3 source. This is source/runtime and storage evidence, not an independent security audit.

At the observation block cycle 3 was already active and had a participant. A real upgrade was therefore not permitted then. The live owner must wait until a completed cycle's inactive interval. If activation has passed without any participation, the existing owner-controlled activation setter can postpone it. Re-read state immediately before any separately authorized release.

## Read-only inspection and local fork rehearsal

Inspect the current implementation and relevant live configuration without a signer or transaction:

```sh
node tasks/src/inspect-v4-art-auction-upgrade.js
```

`ART_AUCTION_RPC_URL` may select an archive-capable RPC endpoint. It defaults to the public Arbitrum endpoint. The report pins all reads to one block and states whether the implementation and runtime still match the recorded V3 baseline. Do not infer current settings from old defaults.

CLI failures print static headings and controlled diagnostic categories or locally assigned rehearsal stages. They do not copy provider error messages, stack traces, or revert data, because those can contain credentials embedded in the RPC URL. Malformed fork URLs are rejected with a static configuration hint.

The rehearsal script is also read-only unless explicitly enabled. It refuses every network except the in-process `hardhat` network. An enabled rehearsal forks the recorded block, verifies its hash/runtime, impersonates only local-fork accounts, completes an active V3 cycle if necessary, validates storage, deploys the auction and V4 only on the fork, upgrades atomically, verifies preserved state, finalizes a V4 cycle, and follows two V4-issued lots through opening bids, self-raises, repeated late-bid extensions, refunds, settlement, contribution and delivery:

```sh
(cd ../ChaosZero && forge build src/GameFundedOutcomeMarket.sol)
ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile
RUN_V4_FORK_REHEARSAL=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat --config hardhat.art-auction-fork.config.js run --no-compile --network hardhat tasks/src/rehearse-v4-art-auction-upgrade.js
```

The rehearsal loads the production Foundry artifact from the sibling `ChaosZero` checkout (or `CHAOS_ZERO_ROOT`). It tests the real CST transfer, all eight market positions, previous-market settlement, and the second grant, in addition to the artwork lifecycle.

The dedicated configuration creates the fork before provider initialization, avoiding EDR versions' unsupported storage overrides during `hardhat_reset`. It mines one empty local block before executing contract calls, pins local Osaka semantics, and uses its 16,777,216 transaction gas cap instead of the ordinary stress tests' deliberately huge gas limit. The public RPC may rate-limit or lack historical data; an archive-capable endpoint is required.

EDR does not implement native Arbitrum precompiles. The recorded `0xfe` marker code at ArbSys (`0x64`) and ArbGasInfo (`0x6c`) would execute as INVALID and consume forwarded gas. The script verifies those markers and replaces them only on the local fork with the repository's `FakeArbSys` and `FakeArbGasInfo` test shims. Game/NFT/periphery state and deployed V3 runtime remain forked from the actual chain, but this is not a reproduction of native entropy or precompile gas. Gas figures also exclude Arbitrum L1 data fees and are not bounds for arbitrary owner-configured allocation counts.

The completed rehearsal at block 517222845 used `ART_AUCTION_RPC_URL=https://arbitrum-one.public.blastapi.io`, because the default endpoint lacked historical storage. It completed V3 cycle 3, upgraded atomically, finalized V4 cycle 4 with eight auction NFTs (IDs 123-130), then bid, settled, forwarded the winning payment without a game bid, and delivered one NFT. Execution gas was 79,097 for the upgrade, 4,560,123 for the prior V3 finalization, 5,954,260 for V4 finalization, and 54,950 for forwarding. These were different cycles, so their gas difference is not an isolated measurement of the added feature. Source hashes, runtime sizes and the completed result are recorded in `docs/v4-art-auction-verification.json`.

## Funding behavior

Winning proceeds go to the existing shared game reserve through `donateEth()`. The game receives only a finalized winning payment, not losing-bid refunds. Sending ETH with empty calldata would invoke the game's bid receiver and is incorrect. Contributions preserve bidder records and cycle timing, and then participate in the existing configured reserve split. They are not restricted to one prize or a particular cycle. Auction source-cycle attribution and the receiving game's current cycle may differ.

## Verification coverage and release limits

The V4 suites check the recorded deployed layout and actual runtime, every preexisting scalar slot, historical participation/contribution data, customized economics, token ownership and supply, initializer access/version/identity checks, active-cycle rejection, and no retroactive issuance. Issuance cases combine optional CST participation, optional Random Walk anchoring and main allocations of one, three and five NFTs; they reconcile original recipient events, exact extra custody, seeds and CST totals. Further scenarios cover full rollback on failed registration, consecutive cycles with unbid inventory, and funding/delivery without game-bid side effects. The immutable auction has its own accounting and adversarial suites.

For the original 0.8.34 candidate, the focused V4 suites passed 21 tests in production mode. The original complete quick regression passed 199 tests in each of its four compiler/preprocessor modes (796 test executions), and the credential/legacy-task suite passed 29 tests, including rejection of both short and fully qualified V4 contract names before credentials are read and RPC credential redaction across nine failure scenarios. On this macOS host, `npm run hardhat-test-quick` could not invoke its `/usr/bin/bash` shebang; the unchanged runner was successfully executed from `test/runners` with `LONG_TEST_MODE_CODE=1 bash ./test.bash -b`. See the verification JSON for the modes, source hashes and rehearsal evidence. Diagnostic-only CLI hardening was tested after the completed fork run; that run's original tool hashes are retained separately.

Before release, review the intended deployment addresses and pinned source, obtain the required independent security review, rehearse against the then-current deployed state, and measure finalization under the actual configured counts and supported operational limits. Nothing in this document supplies a production deployment command, signing key, launch cycle, or deployment authorization.

## Additional EVM fuzzing and invariant checks

`npm run test:auction:fuzz` uses pinned Foundry 1.7.1 tooling with Solidity 0.8.38, Osaka semantics and isolated cache/output paths under `cache/`. Three properties run 1,024 cases each: exact percentage rounding/self-raise conservation, late-bid timing and rollback of underfunded bids. A separate stateful handler runs 128 sequences of depth 128, interleaving bids, time, settlement, refunds, delivery, failed/successful proceeds and forced ETH. It reconciles individual liabilities, custody and cash movements after every handler call. Calls that do not meet a workflow's preconditions are deliberate no-ops; 16,384 calls does not mean 16,384 accepted bids.

The original tests passed. Foundry coverage had source-map anchor warnings in both compiler modes, so its percentages are not treated as reliable coverage evidence. The existing Hardhat adversarial, callback and deployed-runtime upgrade suites remain separate evidence. Cross-review identified and fixed the fully qualified artifact-name bypass in the legacy upgrade task; no unresolved actionable cross-review finding remains. This is not an independent external audit.

## Follow-up security and quality review, October 22, 2026

The follow-up review found a reproducibility defect in the new CI workflow: Hardhat explicitly uses a native Solidity compiler, but the workflow installed only npm dependencies. A clean runner would not have that compiler. The workflow now downloads the exact approved Linux 0.8.38 build and checks its pinned SHA-256 before executing it. The checksum was checked against the [official binary manifest](https://binaries.soliditylang.org/linux-amd64/list.json) and the downloaded binary. YAML and shell syntax were validated locally; the GitHub-hosted workflow was not run or pushed during this review.

Additional regression coverage verifies that an auction purchaser can name the NFT, use its ordinary once-only anchoring entitlement in the existing wallet, receive a later V4 distribution and retrieve the NFT. A separate production-artifact check enforces runtime and creation-code deployment limits, because the shared test network deliberately permits oversized stress-test contracts. That check is intentionally skipped in assertion/preprocessor builds and runs in production mode. No auction or game business logic was changed by this review; the separately approved compiler migration changes the candidate build.

The compiler review identified a defect in the previous candidate compiler that passing application tests could not resolve. The [official Solidity bug registry](https://raw.githubusercontent.com/argotorg/solidity/develop/docs/bugs.json) lists `SOL-2026-7` (`YulOptimizerKnowledgeBaseStaleBookkeeping`), introduced in 0.8.19 and fixed in 0.8.38. The previous 0.8.34 optimized IR settings satisfied its conditions. The compiler can retain stale knowledge about locations derived from a variable whose value changes, if those locations later coincide. The [upstream storage-alias reproducer](https://github.com/argotorg/solidity/blob/dc81cfc2803c78a5ba0e88e5ff961b75ea700e69/test/libsolidity/semanticTests/optimizer/reassigned_reference_storage_alias.sol) was reproduced locally with 0.8.34, optimized IR, 400 runs and Osaka: `g(0, 2, 0xaaaa, 0xbbbb)` returned `0xaaaa` instead of `0xbbbb`.

This demonstrates the upstream compiler defect, not an identified miscompilation or exploit in Cosmic Signature. The auction's fixed record accesses and tested accounting did not reveal the reproducer's mutable-base alias pattern, but inspection and tests do not prove that all generated IR is unaffected. The user explicitly approved migration of the undeployed V4 build to 0.8.38 while leaving deployed contracts untouched. The approved migration and renewed evidence are described below; the historical V3 fixture is not rewritten.

An isolated 0.8.38 feasibility trial used a checksum-verified native compiler and copied production standard-JSON inputs, changing exact pragmas only in temporary inputs. It compiled without errors, with V4 runtime 21,951 bytes and auction runtime 4,748 bytes. The upstream reproducer returned the correct result. The temporary build passed all 3,072 Foundry fuzz cases and 16,384 invariant-handler calls. A local synthetic-state upgrade from the recorded deployed V3 runtime preserved existing scalar storage and exercised issuance, bidding, refunds, settlement, reserve forwarding and NFT delivery. The trial preceded the explicit approval and was kept separate from repository artifacts. The subsequent approved migration updates 126 contract pragmas, one Foundry test pragma, compiler configuration and CI, and renews production evidence. The historical deployed V3 fixture remains unchanged. The feasibility trial itself was not a live-state fork rehearsal or independent audit.

## Approved candidate compiler migration

The current candidate uses exact Solidity `0.8.38+commit.1835d247`, optimized IR, 400 optimizer runs and the existing Osaka target. Native 0.8.38 was installed alongside 0.8.34 without switching the global active compiler. Hardhat's explicit version path, Foundry and CI all select the new version. CI verifies the official Linux binary SHA-256 `65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243`; the local macOS binary has SHA-256 `b18ac1d1f48394c71ca9aefbf0fb94fef24c87b358f48578de5941e234e0a2a9`.

The deployed V3 branch remains at `37fdc5e01fee9b4a1ef59fff35726d96775b3680`. Its recorded fixture remains byte-for-byte identical, with SHA-256 `38c82cac599857929fec66ca9125ad46d2a2b9ab898d895d3b28a08a9dc8b204`. Existing deployed contracts are not recompiled or changed on-chain. Historical compiler and runtime evidence remains in the verification JSON; `approvedCompilerMigration` identifies the new candidate and its checks.

The compiler regression in `test/foundry/ArtAuctionFuzz.t.sol` writes through an index whose value changes, then reads an earlier index that can alias it. The new test was confirmed to fail on 0.8.34 (stale 17 instead of 29) and pass on 0.8.38. This is a guard against reintroducing the compiler defect, not a claim that this probe occurs in the auction's business logic.

The approved build compiled all 196 source units and passed the four-mode quick regression: 200, 200, 200 and 201 tests (801 executions). Each debug mode intentionally skips the production-only size check. Foundry passed five tests: the compiler regression, three properties with 1,024 cases each, and 128 invariant sequences of depth 128 (16,384 handler calls, zero reverts). All 29 credential tests and scoped ESLint checks also passed. Production runtime sizes are 21,951 bytes for V4 and 4,748 bytes for the auction, within the deployment limits. The verification JSON records source hashes, compiler/build-input provenance, runtime hashes and commands.

A fresh pinned live-state fork rehearsal completed under 0.8.38 at Arbitrum block 517222845. It verified the original deployed V3 runtime and block hash, completed V3 cycle 3 locally, validated and upgraded to V4 atomically, preserved existing scalar state, finalized cycle 4 with eight auction NFTs (123-130), and completed bidding, settlement, reserve forwarding and delivery. Execution gas was 79,085 for the upgrade, 5,971,336 for V4 finalization and 54,944 for forwarding. As before, this uses disclosed local Arbitrum precompile shims, excludes L1 data fees, is not a worst-case bound, and sends no transaction to Arbitrum. Independent review and separate production authorization remain required before release.


## Complete local auction lifecycle (2026-10-24)

The existing fork rehearsal and the V4 main-prize regression now share `exerciseV4AuctionLifecycle` in `test/src/ArtAuctionTestHelpers.js`. The regression starts with the production game and its periphery, upgrades through V4, and finalizes a real game cycle to create the eight auction NFTs. The fork additionally verifies the recorded deployed V3 runtime, the exact Arbitrum block hash, storage compatibility and atomic upgrade before exercising those NFTs. Neither path registers synthetic inventory through a receiver double.

The lifecycle verifies the seven-day eligibility gate and first-bid 48-hour duration, an ordinary outbid without extension, a 100 ETH self-raise funded only by its difference, a bid exactly ten minutes before closing without extension, and two later bids each restoring ten minutes. It retrieves refund credits both before and after settlement, including an earlier credit held by the eventual winner, without applying those credits automatically to later bids. Each step reconciles escrow, refund credits, pending proceeds and the auction's ETH balance.

A third party settles the first lot without delivering its NFT or forwarding its payment. A reverted NFT delivery transaction preserves the winner's right, then the winner delivers successfully to another address before proceeds are forwarded. A second lot receives its first bid seven days later while the first lot still awaits forwarding, proving that its own 48-hour clock and custody are independent. That second lot is forwarded before NFT delivery, exercising both valid orders. Both final prices reach the actual V4 game's reserve through `EthDonated`, with no `BidPlaced` event and no change to the captured preexisting scalar game storage. Six unbid NFTs remain in auction custody with no closing timestamp.

The pinned fork completed at block 517222845 with NFTs 123 and 124 delivered from the batch 123-130. It recorded 16 successful lifecycle transactions and one reverted delivery, a final first-lot price of 133.1 ETH, and a total reserve increase of 133.10001 ETH. All auction liabilities and its ETH balance ended at zero. The updated result, source hashes, commands and regression counts are in `docs/v4-art-auction-verification.json` under `completeAuctionLifecycle`.

This evidence uses the unchanged Solidity 0.8.38 candidate and the previously disclosed local Arbitrum precompile shims. It does not deploy or change public contracts, reproduce native Arbitrum precompile execution, establish worst-case gas bounds, or replace independent security review. The browser rehearsal's local game deployment is separate from this pinned-state upgrade rehearsal.
