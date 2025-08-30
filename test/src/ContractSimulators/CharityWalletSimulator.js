// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { assertAddressIsValid, assertEvent } = require("../ContractTestingHelpers.js");

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
			expect(typeof value_).equal("bigint");
			expect(value_).greaterThanOrEqual(0n);
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
	expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddress)).equal(charityWalletSimulator_.ethBalanceAmount);
}

// #endregion
// #region

module.exports = {
	createCharityWalletSimulator,
	assertCharityWalletSimulator,
};

// #endregion
