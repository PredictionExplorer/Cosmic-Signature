// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper } = require("../../../src/Helpers.js");
const { assertEvent } = require("../../../src/ContractTestingHelpers.js");

// #endregion
// #region `createStakingWalletCosmicSignatureNftSimulator`

/*async*/ function createStakingWalletCosmicSignatureNftSimulator(cosmicSignatureNftSimulator_) {
	// #region

	const stakingWalletCosmicSignatureNftSimulator_ = {
		// #region Data

		cosmicSignatureNftSimulator: cosmicSignatureNftSimulator_,
		ethBalanceAmount: 0n,
		numStakedNfts: 0n,

		/** Comment-202504221 applies. */
		usedNfts: {},

		actionCounter: 0n,
		stakeActions: [undefined,],
		rewardAmountPerStakedNft: 0n,

		// #endregion
		// #region `stake`

		stake: function(nftOwnerAddress_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(this.wasNftUsed(nftId_)).false;
			this.usedNfts[nftId_] = true;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			const newStakeActionId_ = newActionCounter_;

			// Comment-202504011 applies.
			this.stakeActions[Number(newStakeActionId_)] = {nftId: nftId_, nftOwnerAddress: nftOwnerAddress_, initialRewardAmountPerStakedNft: this.rewardAmountPerStakedNft,};

			const newNumStakedNfts_ = this.numStakedNfts + 1n;
			this.numStakedNfts = newNumStakedNfts_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletCosmicSignatureNft,
				"NftStaked",
				[newStakeActionId_, nftId_, nftOwnerAddress_, newNumStakedNfts_, this.rewardAmountPerStakedNft,]
			);
			++ eventIndexWrapper_.value;
			this.cosmicSignatureNftSimulator.transferFrom(nftOwnerAddress_, contracts_.stakingWalletCosmicSignatureNftAddress, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `wasNftUsed`

		wasNftUsed: function(nftId_) {
			expect(typeof nftId_).equal("bigint");
			expect(nftId_).greaterThanOrEqual(0n);
			const nftWasUsed_ = Boolean(this.usedNfts[nftId_]);
			return nftWasUsed_;
		},

		// #endregion
		// #region // `numStakedNfts`

		// numStakedNfts: function() {
		// 	return BigInt(this.stakeActions.length - 1);
		// },

		// #endregion
		// #region `tryDeposit`

		tryDeposit: function(value_, roundNum_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof value_).equal("bigint");
			expect(value_).greaterThanOrEqual(0n);
			expect(typeof roundNum_).equal("bigint");
			expect(roundNum_).greaterThanOrEqual(0n);
			const numStakedNftsCopy_ = this.numStakedNfts;
			if (numStakedNftsCopy_ == 0n) {
				// console.info("%s", "202505104");
				return false;
			}
			// console.info("%s", "202505105");
			this.ethBalanceAmount += value_;
			const newRewardAmountPerStakedNft_ = this.rewardAmountPerStakedNft + value_ / numStakedNftsCopy_;
			this.rewardAmountPerStakedNft = newRewardAmountPerStakedNft_;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletCosmicSignatureNft,
				"EthDepositReceived",
				[roundNum_, newActionCounter_, value_, newRewardAmountPerStakedNft_, numStakedNftsCopy_,]
			);
			++ eventIndexWrapper_.value;
			return true;
		},

		// #endregion
	};

	// #endregion
	// #region

	return stakingWalletCosmicSignatureNftSimulator_;

	// #endregion
}

// #endregion
// #region `assertStakingWalletCosmicSignatureNftSimulator`

async function assertStakingWalletCosmicSignatureNftSimulator(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress)).equal(stakingWalletCosmicSignatureNftSimulator_.ethBalanceAmount);
	expect(await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts()).equal(stakingWalletCosmicSignatureNftSimulator_.numStakedNfts);
	await assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletCosmicSignatureNft.actionCounter()).equal(stakingWalletCosmicSignatureNftSimulator_.actionCounter);
	await assertRandomCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletCosmicSignatureNft.rewardAmountPerStakedNft()).equal(stakingWalletCosmicSignatureNftSimulator_.rewardAmountPerStakedNft);
}

// #endregion
// #region `assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible`

async function assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = stakingWalletCosmicSignatureNftSimulator_.cosmicSignatureNftSimulator.totalSupply();
	if (nftTotalSupplyCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertIfCosmicSignatureNftWasUsedForStaking(stakingWalletCosmicSignatureNftSimulator_, contracts_, nftId_);
}

// #endregion
// #region `assertIfCosmicSignatureNftWasUsedForStaking`

async function assertIfCosmicSignatureNftWasUsedForStaking(stakingWalletCosmicSignatureNftSimulator_, contracts_, nftId_) {
	expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_)).equal(stakingWalletCosmicSignatureNftSimulator_.wasNftUsed(nftId_) ? 1n : 0n);
}

// #endregion
// #region `assertRandomCosmicSignatureNftStakeAction`

async function assertRandomCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	// This includes gaps.
	const numStakeActions_ = BigInt(stakingWalletCosmicSignatureNftSimulator_.stakeActions.length);

	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const stakeActionId_ = randomNumber_ % numStakeActions_;
	await assertCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftSimulator_, contracts_, stakeActionId_);
}

// #endregion
// #region `assertCosmicSignatureNftStakeAction`

async function assertCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftSimulator_, contracts_, stakeActionId_) {
	const stakeActionFromContract_ = await contracts_.stakingWalletCosmicSignatureNft.stakeActions(stakeActionId_);
	const stakeActionFromContractSimulator_ = stakingWalletCosmicSignatureNftSimulator_.stakeActions[Number(stakeActionId_)];
	if (stakeActionFromContractSimulator_ == undefined) {
		expect(stakeActionFromContract_[0]).equal(0n);
		expect(stakeActionFromContract_[1]).equal(hre.ethers.ZeroAddress);
		expect(stakeActionFromContract_[2]).equal(0n);
	} else {
		expect(stakeActionFromContract_[0]).equal(stakeActionFromContractSimulator_.nftId);
		expect(stakeActionFromContract_[1]).equal(stakeActionFromContractSimulator_.nftOwnerAddress);
		expect(stakeActionFromContract_[2]).equal(stakeActionFromContractSimulator_.initialRewardAmountPerStakedNft);
	}
}

// #endregion
// #region

module.exports = {
	createStakingWalletCosmicSignatureNftSimulator,
	assertStakingWalletCosmicSignatureNftSimulator,
};

// #endregion
