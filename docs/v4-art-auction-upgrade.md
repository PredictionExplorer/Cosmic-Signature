# V4 artwork issuance and immutable auctions

V4 keeps the existing NFT collection and V3 participation/allocation rules. Each successful V4 cycle finalization creates a separate batch of exactly eight additional Cosmic Signature NFTs for the immutable art auction. It creates no extra CST. The same transaction registers the eight NFTs with fixed auction terms, including eligibility seven days after that transaction's timestamp. Registration failure reverts finalization, including all existing allocations and NFT/CST minting.

This branch implements and tests the change. It does not authorize a production deployment or an upgrade transaction.

## Contract integration

`MainPrizeV3._distributePrizes` is made `virtual`, with no change to its implementation. `MainPrizeV4` calls that existing implementation first, then makes one separate `nft.mintMany` call with eight auction-owned recipients. Existing recipient arrays, token ordering, counts, seed derivation, CST distribution and allocation events remain intact. The additional seed stream is domain-separated from the existing allocation stream.

Immediately after the extra mint, the game calls `ICosmicSignatureArtAuction.registerAuctionBatch(roundNum, firstNftId)`. There is no renderer call, no bidder callback, and no settling of previous auctions in finalization. The game does not catch a registration failure. The immutable auction verifies its caller and the latest eight NFT IDs in its custody, records the timestamp itself, and fixes the waiting lots' terms. Future cycles do not wait for earlier works to sell.

`artAuction()` identifies the deployment used for future batches. There is no pointer setter in V4. A later game upgrade may select a different auction deployment for subsequent batches; already registered lots, NFT custody, refunds and proceeds obligations remain in their original immutable auction. The game and NFT contracts retain their existing upgrade and metadata trust boundaries.

## Storage and initialization

V4 adds only `ICosmicSignatureArtAuction artAuction`, at slot 314, consuming the first slot of V3's final persistent gap. The new gap begins at 315 and has the same end. It does not inherit the concrete `CosmicSignatureGameV3` leaf and append storage after that gap. Existing persistent variables and OpenZeppelin namespaces keep their positions.

The initializer is `initializeV4(address artAuction)`. It:

- Requires the owner and an inactive cycle.
- Requires the previous initialized version to be exactly 3.
- Uses OpenZeppelin `reinitializer(4)`.
- Requires a deployed auction whose immutable `game()` is the current proxy and whose `nft()` is the game's existing NFT contract.
- Writes only the new auction address and initializer version, and emits `ArtAuctionConfigured`.

It does not reset any existing configured percentages, clocks, balances, NFT counts, or token/periphery addresses. The inherited no-argument `reinitialize()` deliberately reverts; it must not accidentally replay V3 parameter initialization or leave an unconfigured auction pointer.

Always call `upgradeToAndCall(newImplementation, encodeCall(initializeV4, auction))` atomically. A bare upgrade is unsupported: the owner alone could initialize it during the inactive interval, but if participation starts first, the inactive-cycle guard prevents initialization and finalization fails closed. Do not create that state. The legacy `upgrade-cosmic-signature-game` task rejects `CosmicSignatureGameV4` before resolving credentials or deploying, because its no-argument initializer configuration cannot express the required operation.

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

The rehearsal script is also read-only unless explicitly enabled. It refuses every network except the in-process `hardhat` network. An enabled rehearsal forks the recorded block, verifies its hash/runtime, impersonates only local-fork accounts, completes an active V3 cycle if necessary, validates storage, deploys the auction and V4 only on the fork, upgrades atomically, verifies preserved state, finalizes a V4 cycle, and follows one lot through bidding, settlement, contribution and delivery:

```sh
ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile
RUN_V4_FORK_REHEARSAL=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat --config hardhat.art-auction-fork.config.js run --no-compile --network hardhat tasks/src/rehearse-v4-art-auction-upgrade.js
```

The dedicated configuration creates the fork before provider initialization, avoiding EDR versions' unsupported storage overrides during `hardhat_reset`. It mines one empty local block before executing contract calls, pins local Osaka semantics, and uses its 16,777,216 transaction gas cap instead of the ordinary stress tests' deliberately huge gas limit. The public RPC may rate-limit or lack historical data; an archive-capable endpoint is required.

EDR does not implement native Arbitrum precompiles. The recorded `0xfe` marker code at ArbSys (`0x64`) and ArbGasInfo (`0x6c`) would execute as INVALID and consume forwarded gas. The script verifies those markers and replaces them only on the local fork with the repository's `FakeArbSys` and `FakeArbGasInfo` test shims. Game/NFT/periphery state and deployed V3 runtime remain forked from the actual chain, but this is not a reproduction of native entropy or precompile gas. Gas figures also exclude Arbitrum L1 data fees and are not bounds for arbitrary owner-configured allocation counts.

The completed rehearsal at block 517222845 used `ART_AUCTION_RPC_URL=https://arbitrum-one.public.blastapi.io`, because the default endpoint lacked historical storage. It completed V3 cycle 3, upgraded atomically, finalized V4 cycle 4 with eight auction NFTs (IDs 123-130), then bid, settled, forwarded the winning payment without a game bid, and delivered one NFT. Execution gas was 79,097 for the upgrade, 4,560,123 for the prior V3 finalization, 5,954,260 for V4 finalization, and 54,950 for forwarding. These were different cycles, so their gas difference is not an isolated measurement of the added feature. Source hashes, runtime sizes and the completed result are recorded in `docs/v4-art-auction-verification.json`.

## Funding behavior

Winning proceeds go to the existing shared game reserve through `donateEth()`. The game receives only a finalized winning payment, not losing-bid refunds. Sending ETH with empty calldata would invoke the game's bid receiver and is incorrect. Contributions preserve bidder records and cycle timing, and then participate in the existing configured reserve split. They are not restricted to one prize or a particular cycle. Auction source-cycle attribution and the receiving game's current cycle may differ.

## Verification coverage and release limits

The V4 suites check the recorded deployed layout and actual runtime, every preexisting scalar slot, historical participation/contribution data, customized economics, token ownership and supply, initializer access/version/identity checks, active-cycle rejection, and no retroactive issuance. Issuance cases combine optional CST participation, optional Random Walk anchoring and main allocations of one, three and five NFTs; they reconcile original recipient events, exact extra custody, seeds and CST totals. Further scenarios cover full rollback on failed registration, consecutive cycles with unbid inventory, and funding/delivery without game-bid side effects. The immutable auction has its own accounting and adversarial suites.

The focused V4 suites passed 21 tests in production mode. The complete quick regression passed 199 tests in each of its four compiler/preprocessor modes (796 test executions), and the credential/legacy-task suite passed 29 tests, including rejection of both short and fully qualified V4 contract names before credentials are read and RPC credential redaction across nine failure scenarios. On this macOS host, `npm run hardhat-test-quick` could not invoke its `/usr/bin/bash` shebang; the unchanged runner was successfully executed from `test/runners` with `LONG_TEST_MODE_CODE=1 bash ./test.bash -b`. See the verification JSON for the modes, source hashes and rehearsal evidence. Diagnostic-only CLI hardening was tested after the completed fork run; that run's original tool hashes are retained separately.

Before release, review the intended deployment addresses and pinned source, obtain the required independent security review, rehearse against the then-current deployed state, and measure finalization under the actual configured counts and supported operational limits. Nothing in this document supplies a production deployment command, signing key, launch cycle, or deployment authorization.

## Additional EVM fuzzing and invariant checks

`npm run test:auction:fuzz` uses pinned Foundry 1.7.1 tooling with Solidity 0.8.34, Osaka semantics and isolated cache/output paths under `cache/`. Three properties run 1,024 cases each: exact percentage rounding/self-raise conservation, late-bid timing and rollback of underfunded bids. A separate stateful handler runs 128 sequences of depth 128, interleaving bids, time, settlement, refunds, delivery, failed/successful proceeds and forced ETH. It reconciles individual liabilities, custody and cash movements after every handler call. Calls that do not meet a workflow's preconditions are deliberate no-ops; 16,384 calls does not mean 16,384 accepted bids.

All tests passed. Foundry coverage had source-map anchor warnings in both compiler modes, so its percentages are not treated as reliable coverage evidence. The existing Hardhat adversarial, callback and deployed-runtime upgrade suites remain separate evidence. Cross-review identified and fixed the fully qualified artifact-name bypass in the legacy upgrade task; no unresolved actionable cross-review finding remains. This is not an independent external audit.
