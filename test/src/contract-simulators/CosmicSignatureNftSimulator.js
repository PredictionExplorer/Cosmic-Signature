// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper, generateRandomUInt256FromSeed } = require("../../../src/Helpers.js");
const { assertAddressIsValid, assertEvent } = require("../../../src/ContractTestingHelpers.js");

// #endregion
// #region `createCosmicSignatureNftSimulator`

/*async*/ function createCosmicSignatureNftSimulator() {
	// #region

	const cosmicSignatureNftSimulator_ = {
		// #region Data

		/// For each NFT ID, stores an object that contains: `ownerAddress`, `name`, `seed`.
		/// Each item index equals respective NFT ID.
		nftsInfo: [],

		// #endregion
		// #region `assertNftIdIsValid`

		assertNftIdIsValid: function(nftId_) {
			expect(this.isNftIdValid(nftId_)).true;
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
		// #region `getNftName`

		getNftName: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].name;
		},

		// #endregion
		// #region `setNftName`

		setNftName: function(nftId_, nftName_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			this.assertNftIdIsValid(nftId_);
			expect(typeof nftName_).equal("string");
			this.nftsInfo[Number(nftId_)].name = nftName_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"NftNameChanged",
				[nftId_, nftName_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `getNftSeed`

		getNftSeed: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].seed;
		},

		// #endregion
		// #region `transferFrom`

		transferFrom: function(from_, to_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(from_).equal(this.ownerOf(nftId_));
			assertAddressIsValid(to_);
			this.nftsInfo[Number(nftId_)].ownerAddress = to_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"Transfer",
				[from_, to_, nftId_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(roundNum_, nftOwnerAddress_, randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof roundNum_).equal("bigint");
			expect(roundNum_).greaterThanOrEqual(0n);
			assertAddressIsValid(nftOwnerAddress_);
			const nftSeed_ = generateRandomUInt256FromSeed(randomNumberSeed_);
			const nftId_ = this.totalSupply();
			this.nftsInfo.push({ownerAddress: nftOwnerAddress_, name: "", seed: nftSeed_,});
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"Transfer",
				[hre.ethers.ZeroAddress, nftOwnerAddress_, nftId_,]
			);
			++ eventIndexWrapper_.value;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"NftMinted",
				[roundNum_, nftOwnerAddress_, nftSeed_, nftId_,]
			);
			++ eventIndexWrapper_.value;
			return nftId_;
		},

		// #endregion
		// #region `mintMany`

		mintMany: function(roundNum_, nftOwnerAddresses_, randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			let firstNftId_ = 0n;
			if (nftOwnerAddresses_.length > 0) {
				firstNftId_ = this.mint(roundNum_, nftOwnerAddresses_[0], randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
				for ( let index_ = 1; index_ < nftOwnerAddresses_.length; ++ index_ ) {
					randomNumberSeed_ = BigInt.asUintN(256, randomNumberSeed_ + 1n);
					this.mint(roundNum_, nftOwnerAddresses_[index_], randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
				}
			}
			return firstNftId_;
		},

		// #endregion
	};

	// #endregion
	// #region

	return cosmicSignatureNftSimulator_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureNftSimulator`

async function assertCosmicSignatureNftSimulator(cosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(cosmicSignatureNftSimulator_.totalSupply());
	await assertRandomCosmicSignatureNftInfoIfPossible(cosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_);
	/*await*/ assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible(cosmicSignatureNftSimulator_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertRandomCosmicSignatureNftInfoIfPossible`

async function assertRandomCosmicSignatureNftInfoIfPossible(cosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = cosmicSignatureNftSimulator_.totalSupply()
	if (nftTotalSupplyCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertCosmicSignatureNftInfo(cosmicSignatureNftSimulator_, contracts_, nftId_);
}

// #endregion
// #region `assertCosmicSignatureNftInfo`

async function assertCosmicSignatureNftInfo(cosmicSignatureNftSimulator_, contracts_, nftId_) {
	expect(await contracts_.cosmicSignatureNft.ownerOf(nftId_)).equal(cosmicSignatureNftSimulator_.ownerOf(nftId_));
	expect(await contracts_.cosmicSignatureNft.getNftName(nftId_)).equal(cosmicSignatureNftSimulator_.getNftName(nftId_));
	expect(await contracts_.cosmicSignatureNft.getNftSeed(nftId_)).equal(cosmicSignatureNftSimulator_.getNftSeed(nftId_));
}

// #endregion
// #region `assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible`

/*async*/ function assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible(cosmicSignatureNftSimulator_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = cosmicSignatureNftSimulator_.totalSupply()
	if (nftTotalSupplyCopy_ < 2n) {
		return;
	}
	let randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nft1Id_ = randomNumber_ % nftTotalSupplyCopy_;
	randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	let nft2Id_ = randomNumber_ % nftTotalSupplyCopy_;
	if (nft2Id_ == nft1Id_) {
		nft2Id_ = (randomNumber_ ^ 1n) % nftTotalSupplyCopy_;
	}
	expect(cosmicSignatureNftSimulator_.getNftSeed(nft1Id_)).not.equal(cosmicSignatureNftSimulator_.getNftSeed(nft2Id_));
}

// #endregion
// #region

module.exports = {
	createCosmicSignatureNftSimulator,
	assertCosmicSignatureNftSimulator,
};

// #endregion
