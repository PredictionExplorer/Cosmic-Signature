// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper, generateRandomUInt256FromSeed, uint256ToPaddedHexString } = require("../Helpers.js");
const { assertAddressIsValid, assertEvent } = require("../ContractUnitTestingHelpers.js");

// #endregion
// #region `createCharityWalletSimulator`

/*async*/ function createCharityWalletSimulator() {
	// #region

	const charityWalletSimulator_ = {
		// #region Data

		ethBalanceAmount: 0n,

		// #endregion
		// #region `receive`

		receive: function(callerAddress_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(callerAddress_);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			this.ethBalanceAmount += value_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.charityWallet,
				"DonationReceived",
				[callerAddress_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
	};

	// #endregion
	// #region

	return charityWalletSimulator_;

	// #endregion
}

// #endregion
// #region `assertCharityWalletSimulator`

async function assertCharityWalletSimulator(charityWalletSimulator_, contracts_) {
	expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(charityWalletSimulator_.ethBalanceAmount);
}

// #endregion
// #region

module.exports = {
	createCharityWalletSimulator,
	assertCharityWalletSimulator,
};

// #endregion
