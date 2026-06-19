"use strict";

// #region Imports

const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./GameModel.js");

// #endregion
// #region `ShadowState`

/**
Event-driven shadow ledgers for everything the fuzz campaign can touch:
- exact expected ETH balance per tracked address (with gas accounting);
- CST balances per address (rebuilt from `Transfer` events);
- Cosmic Signature NFT and Random Walk NFT ownership (rebuilt from `Transfer` events);
- mock/donation ERC-20 and ERC-721 ledgers;
- staking wallet stake actions, `rewardAmountPerStakedNft`, counters;
- PrizesWallet per-round/per-winner ETH balances, donated tokens/NFTs, round registrations;
- RandomWalkNFT mint price ladder / last minter.

Receipt logs are applied via `applyReceipt`, which dispatches on emitting contract address.
ETH movements are applied explicitly by actions via `addEth` (plus automatic gas accounting
from the engine), then verified exactly against the chain.
*/
class ShadowState {
	// #region Construction

	/**
	@param {import("hardhat")} hre_
	*/
	constructor(hre_) {
		this.hre = hre_;
		/** @type {Map<string, bigint>} Expected ETH balance per tracked lowercase address. */
		this.eth = new Map();
		/** @type {Map<string, string>} Lowercase address → human-readable label (diagnostics). */
		this.labels = new Map();
		/** @type {Set<string>} Addresses whose expected ETH balance changed since the last verification. */
		this.dirtyEth = new Set();
		/** Cumulative refill amount injected via `hardhat_setBalance` (diagnostics). */
		this.totalRefilled = 0n;
		/** Cumulative gas burned by tracked senders (diagnostics). */
		this.totalGasBurned = 0n;
		/**
		Sum of the pre-existing balances captured when addresses were first `trackEth`-ed: the ETH that
		entered the accounted universe other than via `recordRefill`. Together these uphold the global
		conservation identity `sum(tracked balances) + totalGasBurned == totalRefilled + conservationOffset`.
		*/
		this.conservationOffset = 0n;

		/** @type {Map<string, bigint>} CST balance per lowercase address. */
		this.cst = new Map();
		this.cstTotalSupply = 0n;
		/** Independent running tallies of all CST minted / burned (mint == from zero, burn == to zero). */
		this.cstTotalMinted = 0n;
		this.cstTotalBurned = 0n;

		/** @type {Map<string, string>} CS NFT id (decimal string) → lowercase owner. */
		this.csNftOwners = new Map();
		/** @type {Map<string, string>} RW NFT id → lowercase owner. */
		this.rwNftOwners = new Map();
		/** @type {Map<string, string>} Mock donation ERC-721 id → lowercase owner. */
		this.mockNftOwners = new Map();
		/** @type {Map<string, bigint>} Mock donation ERC-20 balances. */
		this.mockErc20 = new Map();
		this.mockErc20TotalSupply = 0n;

		// Staking wallets.
		this.csStaking = {
			numStakedNfts: 0n,
			actionCounter: 0n,
			rewardAmountPerStakedNft: 0n,
			/** @type {Map<string, {nftId: bigint, ownerAddress: string, initialRewardAmountPerStakedNft: bigint}>} */
			stakeActions: new Map(),
			/** @type {Set<string>} */
			usedNfts: new Set(),
		};
		this.rwStaking = {
			numStakedNfts: 0n,
			actionCounter: 0n,
			/** @type {Map<string, {nftId: bigint, ownerAddress: string}>} */
			stakeActions: new Map(),
			/** @type {Set<string>} */
			usedNfts: new Set(),
		};

		// PrizesWallet.
		this.prizesWallet = {
			/** @type {Map<string, bigint>} key `${roundNum}|${winnerLowercase}` → ETH amount. */
			ethBalances: new Map(),
			/** @type {Map<string, string>} roundNum → main prize beneficiary (lowercase). */
			mainPrizeBeneficiaries: new Map(),
			/** @type {Map<string, bigint>} roundNum → withdrawal timeout time. */
			roundTimeouts: new Map(),
			timeoutDurationToWithdrawPrizes: 0n,
			/** @type {Map<string, {roundNum: bigint, nftAddress: string, nftId: bigint, claimed: boolean}>} donated NFT index → record. */
			donatedNfts: new Map(),
			nextDonatedNftIndex: 0n,
			/** @type {Map<string, bigint>} roundNum → donated mock-ERC-20 amount currently held. */
			donatedMockErc20: new Map(),
			/** @type {Map<string, string>} roundNum → `DonatedTokenHolder` address (lowercase). */
			donatedTokenHolders: new Map(),
		};

		// RandomWalkNFT economic state.
		this.randomWalkNft = {
			price: 10n ** 15n, // 0.001 ether
			lastMinter: ZERO_ADDRESS,
			lastMintTime: 0n,
			nextTokenId: 0n,
			numWithdrawals: 0n,
		};

		this.ethDonationWithInfoRecordCount = 0n;

		/** Per-contract interface registry for receipt application. @type {Map<string, {name: string, iface: import("ethers").Interface}>} */
		this.contractsByAddress = new Map();
		this.addresses = {};
	}

	/**
	Registers deployment addresses + interfaces so `applyReceipt` can dispatch logs.
	@param {object} addresses_ Lowercase address strings: game, token, csNft, rwNft, prizesWallet,
	  stakingCs, stakingRw, charityWallet, marketingWallet, dao, mockErc20, mockErc721.
	@param {Map<string, {name: string, iface: import("ethers").Interface}>} contractsByAddress_
	*/
	registerContracts(addresses_, contractsByAddress_) {
		this.addresses = addresses_;
		this.contractsByAddress = contractsByAddress_;
	}

	// #endregion
	// #region ETH ledger

	label(address_, label_) {
		this.labels.set(address_.toLowerCase(), label_);
	}

	labelOf(address_) {
		return this.labels.get(address_.toLowerCase()) ?? address_;
	}

	/** Begins tracking `address_` with its current actual balance. */
	async trackEth(address_, label_) {
		const key_ = address_.toLowerCase();
		const balance_ = await this.hre.ethers.provider.getBalance(key_);
		// The pre-existing balance enters the accounted universe here (not via `recordRefill`); record it
		// in `conservationOffset` so the global conservation identity stays exact.
		this.conservationOffset += balance_ - (this.eth.get(key_) ?? 0n);
		this.eth.set(key_, balance_);
		if (label_ !== undefined) {
			this.label(key_, label_);
		}
	}

	isTracked(address_) {
		return this.eth.has(address_.toLowerCase());
	}

	expectedEth(address_) {
		const value_ = this.eth.get(address_.toLowerCase());
		expect(value_ !== undefined, `ShadowState: address not ETH-tracked: ${address_}`).to.equal(true);
		return value_;
	}

	/** Applies an expected ETH delta to a tracked address. */
	addEth(address_, delta_) {
		const key_ = address_.toLowerCase();
		const previous_ = this.eth.get(key_);
		expect(previous_ !== undefined, `ShadowState.addEth: address not tracked: ${address_}`).to.equal(true);
		const next_ = previous_ + delta_;
		expect(next_ >= 0n, `ShadowState.addEth: negative expected balance for ${this.labelOf(key_)}`).to.equal(true);
		this.eth.set(key_, next_);
		this.dirtyEth.add(key_);
	}

	/** Applies a gas cost to a tracked sender. */
	applyGas(senderAddress_, gasCost_) {
		this.totalGasBurned += gasCost_;
		this.addEth(senderAddress_, -gasCost_);
	}

	/**
	Re-syncs a tracked address's expected ETH balance to its actual on-chain value.
	Used after out-of-band infrastructure transactions (e.g. the OpenZeppelin upgrade plugin
	deploys the new implementation and sends `upgradeToAndCall` from the owner, consuming untracked gas).
	*/
	async resyncEth(address_) {
		const key_ = address_.toLowerCase();
		const actual_ = await this.hre.ethers.provider.getBalance(key_);
		const previous_ = this.eth.get(key_) ?? 0n;
		// Absorb the out-of-band change (e.g. the upgrade plugin's untracked owner gas) as a net injection
		// so the global conservation identity `sum(balances) + totalGasBurned == totalRefilled` is preserved.
		this.totalRefilled += actual_ - previous_;
		this.eth.set(key_, actual_);
		this.dirtyEth.delete(key_);
	}

	/** Records a `hardhat_setBalance` refill. */
	recordRefill(address_, newBalance_) {
		const key_ = address_.toLowerCase();
		const previous_ = this.eth.get(key_) ?? 0n;
		this.totalRefilled += newBalance_ - previous_;
		this.eth.set(key_, newBalance_);
		this.dirtyEth.add(key_);
	}

	/** Verifies and clears the dirty set; exact equality per address. */
	async verifyDirtyEth() {
		for (const address_ of this.dirtyEth) {
			const actual_ = await this.hre.ethers.provider.getBalance(address_);
			expect(actual_, `ETH balance mismatch for ${this.labelOf(address_)}`).to.equal(this.eth.get(address_));
		}
		this.dirtyEth.clear();
	}

	/** Verifies every tracked address (full sweep). */
	async verifyAllEth() {
		for (const [address_, expected_] of this.eth) {
			const actual_ = await this.hre.ethers.provider.getBalance(address_);
			expect(actual_, `ETH balance mismatch (sweep) for ${this.labelOf(address_)}`).to.equal(expected_);
		}
		this.dirtyEth.clear();
	}

	// #endregion
	// #region CST / NFT / mock ledgers

	cstBalanceOf(address_) {
		return this.cst.get(address_.toLowerCase()) ?? 0n;
	}

	_cstApplyTransfer(from_, to_, value_) {
		const fromKey_ = from_.toLowerCase();
		const toKey_ = to_.toLowerCase();
		if (fromKey_ === ZERO_ADDRESS) {
			this.cstTotalSupply += value_;
			this.cstTotalMinted += value_;
		} else {
			const next_ = this.cstBalanceOf(fromKey_) - value_;
			expect(next_ >= 0n, `CST ledger: negative balance for ${this.labelOf(fromKey_)}`).to.equal(true);
			this.cst.set(fromKey_, next_);
		}
		if (toKey_ === ZERO_ADDRESS) {
			this.cstTotalSupply -= value_;
			this.cstTotalBurned += value_;
		} else {
			this.cst.set(toKey_, this.cstBalanceOf(toKey_) + value_);
		}
	}

	mockErc20BalanceOf(address_) {
		return this.mockErc20.get(address_.toLowerCase()) ?? 0n;
	}

	_mockErc20ApplyTransfer(from_, to_, value_) {
		const fromKey_ = from_.toLowerCase();
		const toKey_ = to_.toLowerCase();
		if (fromKey_ === ZERO_ADDRESS) {
			this.mockErc20TotalSupply += value_;
		} else {
			const next_ = this.mockErc20BalanceOf(fromKey_) - value_;
			expect(next_ >= 0n, "mock ERC-20 ledger: negative balance").to.equal(true);
			this.mockErc20.set(fromKey_, next_);
		}
		if (toKey_ !== ZERO_ADDRESS) {
			this.mockErc20.set(toKey_, this.mockErc20BalanceOf(toKey_) + value_);
		} else {
			this.mockErc20TotalSupply -= value_;
		}
	}

	_nftApplyTransfer(ownersMap_, from_, to_, nftId_) {
		const idKey_ = nftId_.toString();
		const fromKey_ = from_.toLowerCase();
		const toKey_ = to_.toLowerCase();
		if (fromKey_ === ZERO_ADDRESS) {
			expect(ownersMap_.has(idKey_), `NFT ledger: mint of existing id ${idKey_}`).to.equal(false);
		} else {
			expect(ownersMap_.get(idKey_), `NFT ledger: transfer from non-owner of id ${idKey_}`).to.equal(fromKey_);
		}
		if (toKey_ === ZERO_ADDRESS) {
			ownersMap_.delete(idKey_);
		} else {
			ownersMap_.set(idKey_, toKey_);
		}
	}

	nftOwnersOf(kind_) {
		switch (kind_) {
			case "cs": return this.csNftOwners;
			case "rw": return this.rwNftOwners;
			case "mock": return this.mockNftOwners;
			default: throw new Error(`unknown NFT kind ${kind_}`);
		}
	}

	/** NFT ids owned by `address_` (decimal strings). */
	nftIdsOwnedBy(kind_, address_) {
		const key_ = address_.toLowerCase();
		const out_ = [];
		for (const [id_, owner_] of this.nftOwnersOf(kind_)) {
			if (owner_ === key_) {
				out_.push(id_);
			}
		}
		return out_;
	}

	nftCountOwnedBy(kind_, address_) {
		const key_ = address_.toLowerCase();
		let count_ = 0n;
		for (const owner_ of this.nftOwnersOf(kind_).values()) {
			if (owner_ === key_) {
				++ count_;
			}
		}
		return count_;
	}

	// #endregion
	// #region PrizesWallet ledger helpers

	prizesWalletEthOf(roundNum_, winnerAddress_) {
		return this.prizesWallet.ethBalances.get(`${roundNum_}|${winnerAddress_.toLowerCase()}`) ?? 0n;
	}

	prizesWalletEthTotal() {
		let sum_ = 0n;
		for (const value_ of this.prizesWallet.ethBalances.values()) {
			sum_ += value_;
		}
		return sum_;
	}

	/** Rounds (as bigint) in which `winnerAddress_` has a positive ETH balance. */
	prizesWalletRoundsWithEthFor(winnerAddress_) {
		const key_ = winnerAddress_.toLowerCase();
		const out_ = [];
		for (const [mapKey_, value_] of this.prizesWallet.ethBalances) {
			if (value_ > 0n && mapKey_.endsWith(`|${key_}`)) {
				out_.push(BigInt(mapKey_.split("|")[0]));
			}
		}
		out_.sort((a_, b_) => (a_ < b_ ? -1 : a_ > b_ ? 1 : 0));
		return out_;
	}

	// #endregion
	// #region Receipt application

	/**
	Applies all logs of a transaction receipt to the ledgers.
	Unknown events from registered contracts are tolerated (they are verified by actions);
	token/NFT `Transfer`s and wallet bookkeeping events mutate ledgers exactly.
	@param {import("ethers").TransactionReceipt} receipt_
	*/
	applyReceipt(receipt_) {
		for (const log_ of receipt_.logs) {
			const entry_ = this.contractsByAddress.get(log_.address.toLowerCase());
			if (entry_ === undefined) {
				continue;
			}
			let parsed_;
			try {
				parsed_ = entry_.iface.parseLog(log_);
			} catch {
				continue;
			}
			if (parsed_ === null) {
				continue;
			}
			this._applyParsedEvent(entry_.name, log_.address.toLowerCase(), parsed_);
		}
	}

	_applyParsedEvent(contractName_, contractAddress_, parsed_) {
		const a_ = this.addresses;
		switch (contractName_) {
			case "CosmicSignatureToken": {
				if (parsed_.name === "Transfer") {
					this._cstApplyTransfer(parsed_.args[0], parsed_.args[1], parsed_.args[2]);
				}
				break;
			}
			case "CosmicSignatureNft": {
				if (parsed_.name === "Transfer") {
					this._nftApplyTransfer(this.csNftOwners, parsed_.args[0], parsed_.args[1], parsed_.args[2]);
				}
				break;
			}
			case "RandomWalkNFT": {
				if (parsed_.name === "Transfer") {
					this._nftApplyTransfer(this.rwNftOwners, parsed_.args[0], parsed_.args[1], parsed_.args[2]);
				} else if (parsed_.name === "MintEvent") {
					// price ladder is updated by the action (it also moves ETH); only sanity data here.
					this.randomWalkNft.lastMinter = parsed_.args[1].toLowerCase();
				}
				break;
			}
			case "FuzzTestMockErc721": {
				if (parsed_.name === "Transfer") {
					this._nftApplyTransfer(this.mockNftOwners, parsed_.args[0], parsed_.args[1], parsed_.args[2]);
				}
				break;
			}
			case "FuzzTestMockErc20": {
				if (parsed_.name === "Transfer") {
					this._mockErc20ApplyTransfer(parsed_.args[0], parsed_.args[1], parsed_.args[2]);
				}
				break;
			}
			case "StakingWalletCosmicSignatureNft": {
				if (parsed_.name === "NftStaked") {
					const [stakeActionId_, nftId_, stakerAddress_, numStakedNfts_, rewardAmountPerStakedNft_] = parsed_.args;
					const nftKey_ = nftId_.toString();
					expect(this.csStaking.usedNfts.has(nftKey_), `CS staking: NFT ${nftKey_} staked twice`).to.equal(false);
					this.csStaking.usedNfts.add(nftKey_);
					this.csStaking.actionCounter += 1n;
					expect(stakeActionId_).to.equal(this.csStaking.actionCounter);
					this.csStaking.stakeActions.set(stakeActionId_.toString(), {
						nftId: BigInt(nftId_),
						ownerAddress: stakerAddress_.toLowerCase(),
						initialRewardAmountPerStakedNft: BigInt(rewardAmountPerStakedNft_),
					});
					this.csStaking.numStakedNfts += 1n;
					expect(numStakedNfts_).to.equal(this.csStaking.numStakedNfts);
					expect(rewardAmountPerStakedNft_).to.equal(this.csStaking.rewardAmountPerStakedNft);
				} else if (parsed_.name === "NftUnstaked") {
					const [actionCounter_, stakeActionId_, , , numStakedNfts_, rewardAmountPerStakedNft_, rewardAmount_] = parsed_.args;
					const action_ = this.csStaking.stakeActions.get(stakeActionId_.toString());
					expect(action_ !== undefined, `CS staking: unstake of unknown action ${stakeActionId_}`).to.equal(true);
					const expectedReward_ = this.csStaking.rewardAmountPerStakedNft - action_.initialRewardAmountPerStakedNft;
					expect(rewardAmount_, "CS staking: unstake reward mismatch").to.equal(expectedReward_);
					expect(rewardAmountPerStakedNft_).to.equal(this.csStaking.rewardAmountPerStakedNft);
					this.csStaking.stakeActions.delete(stakeActionId_.toString());
					this.csStaking.numStakedNfts -= 1n;
					this.csStaking.actionCounter += 1n;
					expect(actionCounter_).to.equal(this.csStaking.actionCounter);
					expect(numStakedNfts_).to.equal(this.csStaking.numStakedNfts);
				} else if (parsed_.name === "EthDepositReceived") {
					const [, actionCounter_, depositAmount_, newRewardAmountPerStakedNft_, numStakedNfts_] = parsed_.args;
					expect(numStakedNfts_).to.equal(this.csStaking.numStakedNfts);
					expect(this.csStaking.numStakedNfts > 0n, "CS staking: deposit with zero staked").to.equal(true);
					this.csStaking.rewardAmountPerStakedNft += depositAmount_ / this.csStaking.numStakedNfts;
					expect(newRewardAmountPerStakedNft_).to.equal(this.csStaking.rewardAmountPerStakedNft);
					this.csStaking.actionCounter += 1n;
					expect(actionCounter_).to.equal(this.csStaking.actionCounter);
				}
				break;
			}
			case "StakingWalletRandomWalkNft": {
				if (parsed_.name === "NftStaked") {
					const [stakeActionId_, nftId_, stakerAddress_, numStakedNfts_] = parsed_.args;
					const nftKey_ = nftId_.toString();
					expect(this.rwStaking.usedNfts.has(nftKey_), `RW staking: NFT ${nftKey_} staked twice`).to.equal(false);
					this.rwStaking.usedNfts.add(nftKey_);
					this.rwStaking.actionCounter += 1n;
					expect(stakeActionId_).to.equal(this.rwStaking.actionCounter);
					this.rwStaking.stakeActions.set(stakeActionId_.toString(), { nftId: nftId_, ownerAddress: stakerAddress_.toLowerCase() });
					this.rwStaking.numStakedNfts += 1n;
					expect(numStakedNfts_).to.equal(this.rwStaking.numStakedNfts);
				} else if (parsed_.name === "NftUnstaked") {
					const [actionCounter_, stakeActionId_, , , numStakedNfts_] = parsed_.args;
					expect(this.rwStaking.stakeActions.has(stakeActionId_.toString()), "RW staking: unstake of unknown action").to.equal(true);
					this.rwStaking.stakeActions.delete(stakeActionId_.toString());
					this.rwStaking.numStakedNfts -= 1n;
					this.rwStaking.actionCounter += 1n;
					expect(actionCounter_).to.equal(this.rwStaking.actionCounter);
					expect(numStakedNfts_).to.equal(this.rwStaking.numStakedNfts);
				}
				break;
			}
			case "PrizesWallet": {
				if (parsed_.name === "EthReceived") {
					const [roundNum_, , prizeWinnerAddress_, amount_] = parsed_.args;
					const key_ = `${roundNum_}|${prizeWinnerAddress_.toLowerCase()}`;
					this.prizesWallet.ethBalances.set(key_, (this.prizesWallet.ethBalances.get(key_) ?? 0n) + amount_);
				} else if (parsed_.name === "EthWithdrawn") {
					const [roundNum_, prizeWinnerAddress_, , amount_] = parsed_.args;
					const key_ = `${roundNum_}|${prizeWinnerAddress_.toLowerCase()}`;
					const previous_ = this.prizesWallet.ethBalances.get(key_) ?? 0n;
					expect(previous_, "PrizesWallet ledger: EthWithdrawn amount mismatch").to.equal(amount_);
					this.prizesWallet.ethBalances.delete(key_);
				} else if (parsed_.name === "TimeoutDurationToWithdrawPrizesChanged") {
					this.prizesWallet.timeoutDurationToWithdrawPrizes = parsed_.args[0];
				} else if (parsed_.name === "NftDonated") {
					const [roundNum_, , nftAddress_, nftId_, index_] = parsed_.args;
					expect(index_).to.equal(this.prizesWallet.nextDonatedNftIndex);
					this.prizesWallet.donatedNfts.set(index_.toString(), {
						roundNum: roundNum_,
						nftAddress: nftAddress_.toLowerCase(),
						nftId: nftId_,
						claimed: false,
					});
					this.prizesWallet.nextDonatedNftIndex += 1n;
				} else if (parsed_.name === "DonatedNftClaimed") {
					const index_ = parsed_.args[4];
					const record_ = this.prizesWallet.donatedNfts.get(index_.toString());
					expect(record_ !== undefined && !record_.claimed, "PrizesWallet ledger: double NFT claim").to.equal(true);
					record_.claimed = true;
				} else if (parsed_.name === "TokenDonated") {
					const [roundNum_, , tokenAddress_, amount_] = parsed_.args;
					if (tokenAddress_.toLowerCase() === a_.mockErc20) {
						const key_ = roundNum_.toString();
						this.prizesWallet.donatedMockErc20.set(key_, (this.prizesWallet.donatedMockErc20.get(key_) ?? 0n) + amount_);
					}
				} else if (parsed_.name === "DonatedTokenClaimed") {
					const [roundNum_, , tokenAddress_, amount_] = parsed_.args;
					if (tokenAddress_.toLowerCase() === a_.mockErc20) {
						const key_ = roundNum_.toString();
						const previous_ = this.prizesWallet.donatedMockErc20.get(key_) ?? 0n;
						expect(previous_ >= amount_, "PrizesWallet ledger: donated token over-claim").to.equal(true);
						this.prizesWallet.donatedMockErc20.set(key_, previous_ - amount_);
					}
				}
				break;
			}
			default:
				break;
		}
	}

	// #endregion
}

// #endregion

module.exports = {
	ShadowState,
};
