# Rotate the Arbitrum One owner after the V3 upgrade

Use `scripts/rotate-arbitrum-one-owner.cjs` from the repository root. It targets the existing Arbitrum One deployment and old owner `0x14c82Ce4E5713E88C9462680E9c02BF4a3089871`. It does not deploy, upgrade, or initialize contracts. No Etherscan API key, Hardhat credentials, compilation, or deployment manifest is needed.

The default command is read-only. Sending transactions requires `--execute`, both private keys entered at hidden local prompts, and a typed public-address confirmation. The new key is used only to verify that you control the exact destination; only the old key signs transactions. Neither key is written to a file, placed in an environment variable, or included in the transaction report. Never paste a private key or recovery phrase into chat or a command line.

## What changes

The script sends these seven separate transactions, in order:

| Contract | Change | Address |
| --- | --- | --- |
| Game proxy | Transfer owner | `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` |
| MarketingWallet | Change treasurer | `0xa3802c799f5e3D3D3562A9B513a41C6aAF92e25e` |
| MarketingWallet | Transfer owner | Same address |
| CharityWallet | Transfer owner | `0x96bB0ADB414d5350f435E52f94946B6C7A0760a9` |
| CosmicSignatureNft | Transfer owner | `0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25` |
| PrizesWallet | Transfer owner | `0xE1b619e9B39ea4109D2F429Ea5eAA307759b0011` |
| StakingWalletCosmicSignatureNft | Transfer owner | `0x6308A405B4FF1eA890870Efe2a6D036750B81F7C` |

All seven roles go to the same new address. The marketing treasurer must change as well as the owner: otherwise the old key can still distribute that wallet's CST. The script changes the treasurer before handing over MarketingWallet ownership.

These contracts use immediate, one-step ownership transfers. There is no `acceptOwnership()` call and no grace period. A transfer to the wrong account can permanently lose administrative control. See [OpenZeppelin's ownership documentation](https://docs.openzeppelin.com/contracts/5.x/access-control).

The following are intentionally outside this rotation:

- The CST token, Random Walk staking wallet, and DAO have no single `owner()` role to transfer. Their game links and governance remain unchanged.
- Random Walk NFT is owned by a different account, `0xad65de4D008311Bb97e8b2376b4172ea55f4d8Ae`, as checked on October 21, 2026. The old game-owner key cannot transfer it. If that separate account also needs rotation, its owner must authorize a separate transaction.
- Implementation contracts are not ownership targets. Game administration belongs to the existing proxy.
- The CharityWallet beneficiary remains `0xdddd576bAF106bAAe54bDE40BCac602bB4a7cf79`.

This changes administrative authority. It does not move game ETH, contract tokens, player balances, NFTs, or existing claims and staked positions. Assets and positions belonging personally to the old wallet require separate handling; do not assume this script migrates them. No pause or `reinitialize()` is needed for these ownership transfers.

## 1. Prepare the new wallet

1. Create a fresh wallet with a new recovery phrase on a trusted device. Do not merely add an account under the old phrase. Keep its recovery material in your secure backup.
2. Copy its public `0x...` address from MetaMask or Rainbow and verify the entire address against the selected account. The script supports ordinary externally owned accounts; it stops for a Safe, a deployed smart account, or an account with delegated code. Do not disable that check to force a smart account through.
3. Have both the old and new account private keys available in your secure backup. The script checks that each key derives the expected public address. A recovery phrase is not a private key; never enter the phrase at these prompts.
4. Keep enough ETH in the old wallet on **Arbitrum One** for all seven transactions. The preflight estimates a fee budget and refuses to proceed with insufficient funds. The new account does not need ETH to receive ownership, but it will need Arbitrum ETH for future administrative transactions.
5. Stop other transactions and automation using the old account. Run only one copy of this script. Leave the terminal open until it finishes.

Only enter keys in an ordinary trusted terminal's hidden prompts. Do not use a terminal-recording tool or enable debugging/tracing. Hidden input avoids history and normal terminal output; it cannot protect keys from malware, a debugger, or privileged access to process memory. Exit the script after use and clear any clipboard containing a key.

## 2. Open the repository and enter the public address

These commands work in the macOS default zsh shell and in Bash:

```sh
cd /Users/tarasbobrovytsky/Dev/Cosmic-Signature
node --version
node --test tasks/tests/ownership-rotation.test.cjs tasks/tests/credential-handling.test.cjs
printf 'Paste the NEW owner PUBLIC address, then press Enter: '
read -r new_owner
```

Enter the public address only at this step. Keep using the same terminal. If you reopen it, repeat this section; the `new_owner` variable is not saved.

The installed repository dependencies include ethers. If Node reports a missing dependency, stop and repair the installation before handling any keys. This workflow does not need `hardhat vars set` or `.env` files.

## 3. Run the read-only preflight

```sh
node scripts/rotate-arbitrum-one-owner.cjs --new-owner "${new_owner:?Enter the new public address first}"
```

Check the output:

- `chainId` must be `42161`.
- `oldOwner` must be `0x14c82Ce4E5713E88C9462680E9c02BF4a3089871`.
- `newOwner` must be exactly the new wallet you control.
- The initial run should show seven remaining transactions and end with `Read-only preflight passed.`

The script checks the V3 implementation, the game's contract links, the charity beneficiary, all six owners, and the marketing treasurer. It simulates every remaining call, checks that the old account has no pending transaction, and checks its gas funds. It requests no private keys and sends no transaction in this mode.

An unexpected owner, implementation, recipient, or other check failure is a reason to investigate. Do not edit the checks to bypass a failure.

## 4. Execute the rotation

Only continue after reviewing the successful preflight:

```sh
node scripts/rotate-arbitrum-one-owner.cjs --new-owner "${new_owner:?Enter the new public address first}" --execute
```

The script repeats the preflight, then asks for:

1. **NEW owner's private key.** Paste it into the hidden prompt and press Enter. Nothing should be echoed. It must match the new public address; the script never signs a transaction with this key.
2. **OLD owner's private key.** Paste it into the next hidden prompt and press Enter. It must match `0x14c82Ce4E5713E88C9462680E9c02BF4a3089871`.
3. **Public confirmation.** Type the exact `TRANSFER 0x...` text displayed, using the checksummed destination from the prompt, and press Enter.

No transaction is sent until all three checks pass. After confirmation, the script sends the remaining transactions automatically, waits for each receipt, and checks the changed role. It prints each public transaction hash as it is submitted.

The fee shown is the current maximum budget calculated from gas estimates with headroom, not a promise that network conditions will stay fixed. A changed fee or state can stop the run. Transfers are separate, not atomic: if the process stops, already confirmed transfers remain effective. The old key retains each role until that role's transfer confirms, and this workflow cannot prevent a person holding the old key from racing it.

## 5. Verify completion and preserve the public report

Successful execution ends with:

```text
Rotation complete and all seven roles verified on Arbitrum One.
```

Independently rerun the read-only command:

```sh
node scripts/rotate-arbitrum-one-owner.cjs --new-owner "${new_owner:?Enter the new public address first}"
```

It must report zero remaining transactions and:

```text
Verified: all six owners and the marketing treasurer are the new address.
```

The script prints the path to a new `tasks/output/ownership-rotation-arbitrumOne-<timestamp>.jsonl` report. It contains public addresses, transaction hashes, blocks and status, not keys. Preserve it with your deployment records. Updating a report alone never changes on-chain ownership.

After successful verification, use the new account for future administration. Keep enough old-account ETH for any separate personal-asset recovery; ownership rotation does not sweep its balance. Remove obsolete automation credentials separately. Never call `renounceOwnership()` as part of this procedure.

## If execution is interrupted or fails

1. Do not immediately launch a second execution. Inspect the last `submitted` transaction on Arbiscan and establish whether it confirmed, reverted, or is still pending.
2. Run the read-only preflight with the **same destination address**. A pending old-account transaction causes a stop; resolve it before retrying.
3. When every submitted transaction has a known outcome and preflight passes, rerun `--execute` with the same destination. Already transferred roles are skipped using current on-chain state, not a local progress file. Never switch the destination partway through.
4. If MarketingWallet ownership was transferred manually before its treasurer, the script stops. Only the new MarketingWallet owner can fix that treasurer role; do not assume the old key can finish it.

Third-party error details are deliberately suppressed because error objects can embed sensitive input. Use the public transaction hashes and the read-only checks to diagnose failure; do not add logging of signer objects, private keys, or environment variables.
