// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper } = require("../Helpers.js");
const { assertEvent } = require("../ContractUnitTestingHelpers.js");

// #endregion
// #region `createCosmicSignatureTokenSimulator`

/*async*/ function createCosmicSignatureTokenSimulator() {
	// #region

	const cosmicSignatureTokenSimulator_ = {
		// #region Data

		totalSupply: 0n,
		accountBalanceAmounts: {},

		// #endregion
		// #region `balanceOf`

		balanceOf: function(account_) {
			// assertAddressIsValid(account_);
			expect(account_).properAddress;
			return this.accountBalanceAmounts[account_] ?? 0n;
		},

		// #endregion
		// #region `transfer`
		
		transfer: function(callerAddress_, to_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(callerAddress_);
			expect(callerAddress_).not.equal(hre.ethers.ZeroAddress);
			// assertAddressIsValid(to_);
			expect(to_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const msgSenderNewBalanceAmount_ = this.balanceOf(callerAddress_) - value_;
				expect(msgSenderNewBalanceAmount_ >= 0n);
				this.accountBalanceAmounts[callerAddress_] = msgSenderNewBalanceAmount_;
			}
			{
				const toNewBalanceAmount_ = this.balanceOf(to_) + value_;
				this.accountBalanceAmounts[to_] = toNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",
				[callerAddress_, to_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(account_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(account_);
			expect(account_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const newTotalSupply_ = this.totalSupply + value_;

				// We want the total supply to be far away from the point of overflow.
				// It would be a concern if we observe it to be bigger than this.
				// Comment-202412033 relates and/or applies.
				expect(newTotalSupply_ <= (1n << 128n) - 1n);

				this.totalSupply = newTotalSupply_;
			}
			{
				const accountNewBalanceAmount_ = this.balanceOf(account_) + value_;
				this.accountBalanceAmounts[account_] = accountNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",
				[hre.ethers.ZeroAddress, account_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `burn`

		burn: function(account_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(account_);
			expect(account_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const newTotalSupply_ = this.totalSupply - value_;
				this.totalSupply = newTotalSupply_;
			}
			{
				const accountNewBalanceAmount_ = this.balanceOf(account_) - value_;
				expect(accountNewBalanceAmount_ >= 0n);
				this.accountBalanceAmounts[account_] = accountNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",

				// Issue. If we burned a zero value, this event parameters make it appear that it was a mint, rather than a burn.
				(value_ > 0n) ? [account_, hre.ethers.ZeroAddress, value_,] : [hre.ethers.ZeroAddress, account_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mintMany`

		mintMany: function(specs_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			for (let index_ = specs_.length; ( -- index_ ) >= 0; ) {
				const spec_ = specs_[index_];
				this.mint(spec_.account, spec_.value, contracts_, transactionReceipt_, eventIndexWrapper_);
			}
		},

		// #endregion
	};

	// #endregion
	// #region

	return cosmicSignatureTokenSimulator_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureTokenSimulator`

async function assertCosmicSignatureTokenSimulator(cosmicSignatureTokenSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.cosmicSignatureToken.totalSupply()).equal(cosmicSignatureTokenSimulator_.totalSupply);
	await assertCosmicSignatureTokenBalanceAmountsOfRandomAccount(cosmicSignatureTokenSimulator_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertCosmicSignatureTokenBalanceAmountsOfRandomAccount`

async function assertCosmicSignatureTokenBalanceAmountsOfRandomAccount(cosmicSignatureTokenSimulator_, contracts_, randomNumberSeedWrapper_) {
	// Assuming that only signers and marketing wallet can hold a CST balance.
	const numCstHolders_ = contracts_.signers.length + 1;

	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const cstHolderIndex_ = Number(randomNumber_ % BigInt(numCstHolders_));
	const cstHolderAddress_ = (cstHolderIndex_ < contracts_.signers.length) ? contracts_.signers[cstHolderIndex_].address : contracts_.marketingWalletAddr;
	await assertCosmicSignatureTokenBalanceAmountOf(cosmicSignatureTokenSimulator_, contracts_, cstHolderAddress_);
}

// #endregion
// #region `assertCosmicSignatureTokenBalanceAmountOf`

async function assertCosmicSignatureTokenBalanceAmountOf(cosmicSignatureTokenSimulator_, contracts_, account_) {
	expect(await contracts_.cosmicSignatureToken.balanceOf(account_)).equal(cosmicSignatureTokenSimulator_.balanceOf(account_));
}

// #endregion
// #region

module.exports = {
	createCosmicSignatureTokenSimulator,
	assertCosmicSignatureTokenSimulator,
};

// #endregion
