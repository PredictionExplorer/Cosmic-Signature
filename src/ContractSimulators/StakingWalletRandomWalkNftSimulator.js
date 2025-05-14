// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper, generateRandomUInt256FromSeed } = require("../Helpers.js");
const { assertEvent } = require("../ContractUnitTestingHelpers.js");

// #endregion
// #region `createStakingWalletRandomWalkNftSimulator`

/// todo-1 For now, this is a simplified design. To be revisited.
/*async*/ function createStakingWalletRandomWalkNftSimulator(randomWalkNftSimulator_) {
	// #region

	const stakingWalletRandomWalkNftSimulator_ = {
		// #region Data

		randomWalkNftSimulator: randomWalkNftSimulator_,

		/// Comment-202504221 applies.
		usedNfts: {},

		actionCounter: 0n,

		/// todo-1 If I implement `unstake` this would need to be sparse.
		/// todo-1 Actually this is already sparse, given that the item at the index of 0 is missing.
		stakeActions: [undefined,],

		// #endregion
		// #region `stake`

		/// todo-1 Do we need `unstake`?
		stake: function(nftOwnerAddress_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect( ! this.usedNfts[nftId_] );
			this.usedNfts[nftId_] = true;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			const newStakeActionId_ = newActionCounter_;

			// Comment-202504011 applies.
			this.stakeActions[Number(newStakeActionId_)] = {nftId: nftId_, nftOwnerAddress: nftOwnerAddress_,};

			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletRandomWalkNft,
				"NftStaked",
				[newStakeActionId_, nftId_, nftOwnerAddress_, newStakeActionId_,]
			);
			++ eventIndexWrapper_.value;
			this.randomWalkNftSimulator.transferFrom(nftOwnerAddress_, contracts_.stakingWalletRandomWalkNftAddr, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `numStakedNfts`

		numStakedNfts: function() {
			return BigInt(this.stakeActions.length - 1);
		},

		// #endregion
		// #region `pickRandomStakerAddressesIfPossible`

		pickRandomStakerAddressesIfPossible: function(numStakerAddresses_, randomNumberSeed_) {
			expect(typeof numStakerAddresses_ === "bigint");
			expect(numStakerAddresses_ >= 0n);
			let luckyStakerAddresses_;
			{
				const numStakedNftsCopy_ = this.numStakedNfts();
				if (numStakedNftsCopy_ !== 0n) {
					luckyStakerAddresses_ = new Array(Number(numStakerAddresses_));
					for (let luckyStakerIndex_ = Number(numStakerAddresses_); ( -- luckyStakerIndex_ ) >= 0; ) {
						randomNumberSeed_ = BigInt.asUintN(256, randomNumberSeed_ + 1n);
						const randomNumber_ = generateRandomUInt256FromSeed(randomNumberSeed_);
						const luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_ + 1n;
						const luckyStakerAddress_ = this.stakeActions[Number(luckyStakeActionIndex_)].nftOwnerAddress;
						// console.info("202504297", luckyStakerAddress_);
						luckyStakerAddresses_[luckyStakerIndex_] = luckyStakerAddress_;
					}
				} else {
					luckyStakerAddresses_ = [];
				}
			}
			return luckyStakerAddresses_;
		},

		// #endregion
	};

	// #endregion
	// #region

	return stakingWalletRandomWalkNftSimulator_;

	// #endregion
}

// #endregion
// #region `assertStakingWalletRandomWalkNftSimulator`

async function assertStakingWalletRandomWalkNftSimulator(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.stakingWalletRandomWalkNft.numStakedNfts()).equal(stakingWalletRandomWalkNftSimulator_.numStakedNfts());
	await assertIfRandomRandomWalkNftWasUsedForStakingIfPossible(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletRandomWalkNft.actionCounter()).equal(stakingWalletRandomWalkNftSimulator_.actionCounter);
	await assertRandomRandomWalkNftStakeAction(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertIfRandomRandomWalkNftWasUsedForStakingIfPossible`

async function assertIfRandomRandomWalkNftWasUsedForStakingIfPossible(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = stakingWalletRandomWalkNftSimulator_.randomWalkNftSimulator.totalSupply()
	if (nftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertIfRandomWalkNftWasUsedForStaking(stakingWalletRandomWalkNftSimulator_, contracts_, nftId_);
}

// #endregion
// #region `assertIfRandomWalkNftWasUsedForStaking`

async function assertIfRandomWalkNftWasUsedForStaking(stakingWalletRandomWalkNftSimulator_, contracts_, nftId_) {
	expect(await contracts_.stakingWalletRandomWalkNft.usedNfts(nftId_) === stakingWalletRandomWalkNftSimulator_.usedNfts[nftId_] ? 1n : 0n);
}

// #endregion
// #region `assertRandomRandomWalkNftStakeAction`

async function assertRandomRandomWalkNftStakeAction(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	const numStakedNftsCopy_ = stakingWalletRandomWalkNftSimulator_.numStakedNfts();
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const stakeActionId_ = randomNumber_ % (numStakedNftsCopy_ + 1n);
	await assertRandomWalkNftStakeAction(stakingWalletRandomWalkNftSimulator_, contracts_, stakeActionId_);
}

// #endregion
// #region `assertRandomWalkNftStakeAction`

async function assertRandomWalkNftStakeAction(stakingWalletRandomWalkNftSimulator_, contracts_, stakeActionId_) {
	const stakeActionFromContract_ = await contracts_.stakingWalletRandomWalkNft.stakeActions(stakeActionId_);
	const stakeActionFromContractSimulator_ = stakingWalletRandomWalkNftSimulator_.stakeActions[Number(stakeActionId_)];
	if (stakeActionId_ === 0n) {
		expect(stakeActionFromContract_[0] === 0n);
		expect(stakeActionFromContract_[1] === hre.ethers.ZeroAddress);
		expect(stakeActionFromContract_[2] === 0n);
		expect(stakeActionFromContractSimulator_ === undefined);
	} else {
		expect(stakeActionFromContract_[0] === stakeActionFromContractSimulator_.nftId);
		expect(stakeActionFromContract_[1] === stakeActionFromContractSimulator_.nftOwnerAddress);
		// todo-1 expect(stakeActionFromContract_[2] === stakeActionFromContractSimulator_.index);
	}
}

// #endregion
// #region

module.exports = {
	createStakingWalletRandomWalkNftSimulator,
	assertStakingWalletRandomWalkNftSimulator,
};

// #endregion
