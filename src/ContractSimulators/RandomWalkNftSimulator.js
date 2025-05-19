// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper } = require("../Helpers.js");
const { assertAddressIsValid, assertEvent } = require("../ContractUnitTestingHelpers.js");

// #endregion
// #region `createRandomWalkNftSimulator`

/*async*/ function createRandomWalkNftSimulator() {
	// #region

	const randomWalkNftSimulator_ = {
		// #region Data

		/// For each NFT ID, stores an object that contains: `ownerAddress`.
		/// Each item index equals respective NFT ID.
		nftsInfo: [],

		// #endregion
		// #region `assertNftIdIsValid`

		assertNftIdIsValid: function(nftId_) {
			expect(this.isNftIdValid(nftId_)).equal(true);
		},

		// #endregion
		// #region `isNftIdValid`

		isNftIdValid: function(nftId_) {
			expect(typeof nftId_).equal("bigint");
			return nftId_ >= 0n && nftId_ < this.totalSupply();
		},

		// #endregion
		// #region `totalSupply`

		totalSupply: function() {
			return BigInt(this.nftsInfo.length);
		},

		// #endregion
		// #region `ownerOf`

		ownerOf: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].ownerAddress;
		},

		// #endregion
		// #region `transferFrom`

		transferFrom: function(from_, to_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(from_).equal(this.ownerOf(nftId_));
			assertAddressIsValid(to_);
			this.nftsInfo[Number(nftId_)].ownerAddress = to_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.randomWalkNft,
				"Transfer",
				[from_, to_, nftId_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(callerAddress_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(callerAddress_);
			const nftId_ = this.totalSupply();
			this.nftsInfo.push({ownerAddress: callerAddress_,});
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.randomWalkNft,
				"Transfer",
				[hre.ethers.ZeroAddress, callerAddress_, nftId_,]
			);
			++ eventIndexWrapper_.value;

			// To keep it simple, not asserting event arguments.
			expect(transactionReceipt_.logs[eventIndexWrapper_.value].fragment.name).equal("MintEvent");

			++ eventIndexWrapper_.value;
			return nftId_;
		},

		// #endregion
	};

	// #endregion
	// #region

	return randomWalkNftSimulator_;

	// #endregion
}

// #endregion
// #region `assertRandomWalkNftSimulator`

async function assertRandomWalkNftSimulator(randomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.randomWalkNft.totalSupply()).equal(randomWalkNftSimulator_.totalSupply());
	await assertRandomRandomWalkNftInfoIfPossible(randomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertRandomRandomWalkNftInfoIfPossible`

async function assertRandomRandomWalkNftInfoIfPossible(randomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = randomWalkNftSimulator_.totalSupply()
	if (nftTotalSupplyCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertRandomWalkNftInfo(randomWalkNftSimulator_, contracts_, nftId_);
}

// #endregion
// #region `assertRandomWalkNftInfo`

async function assertRandomWalkNftInfo(randomWalkNftSimulator_, contracts_, nftId_) {
	expect(await contracts_.randomWalkNft.ownerOf(nftId_)).equal(randomWalkNftSimulator_.ownerOf(nftId_));
}

// #endregion
// #region

module.exports = {
	createRandomWalkNftSimulator,
	assertRandomWalkNftSimulator,
};

// #endregion
