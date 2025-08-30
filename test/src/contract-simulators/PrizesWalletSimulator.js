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
// #region `createPrizesWalletSimulator`

/*async*/ function createPrizesWalletSimulator() {
	// #region

	const DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 5n * 7n * 24n * 60n * 60n;

	// #endregion
	// #region

	const prizesWalletSimulator_ = {
		// #region Data

		ethBalanceAmount: 0n,
		// mainPrizeBeneficiaryAddress: hre.ethers.ZeroAddress,
		timeoutDurationToWithdrawPrizes: DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES,
		accountEthBalanceAmounts: {},

		// #endregion
		// #region `registerRoundEnd`

		registerRoundEnd: function(transactionBlock_) {
			const roundTimeoutTimeToWithdrawPrizes_ = BigInt(transactionBlock_.timestamp) + this.timeoutDurationToWithdrawPrizes;
			return roundTimeoutTimeToWithdrawPrizes_;
		},

		// #endregion
		// #region `depositEthMany`

		depositEthMany: function(value_, roundNum_, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof value_).equal("bigint");
			expect(value_).equal(ethDeposits_.reduce((amountSum_, ethDeposit_) => (amountSum_ + ethDeposit_.amount), 0n));
			for (let ethDepositIndex_ = ethDeposits_.length; ( -- ethDepositIndex_ ) >= 0; ) {
				const ethDeposit_ = ethDeposits_[ethDepositIndex_];
				this.depositEth(roundNum_, ethDeposit_.prizeWinnerAddress, ethDeposit_.amount, contracts_, transactionReceipt_, eventIndexWrapper_);
			}
		},

		// #endregion
		// #region `depositEth`

		depositEth: function(roundNum_, prizeWinnerAddress_, amount_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof roundNum_).equal("bigint");
			expect(roundNum_).greaterThanOrEqual(0n);
			// assertAddressIsValid(prizeWinnerAddress_);
			expect(prizeWinnerAddress_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof amount_).equal("bigint");
			expect(amount_).greaterThanOrEqual(0n);
			{
				const newEthBalanceAmount_ = this.ethBalanceAmount + amount_;
				expect(newEthBalanceAmount_).lessThanOrEqual((1n << 128n) - 1n);
				this.ethBalanceAmount = newEthBalanceAmount_;
			}
			{
				const prizeWinnerNewEthBalanceAmount_ = this.ethBalanceOf(prizeWinnerAddress_) + amount_;
				this.accountEthBalanceAmounts[prizeWinnerAddress_] = prizeWinnerNewEthBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.prizesWallet,
				"EthReceived",
				[roundNum_, prizeWinnerAddress_, amount_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `ethBalanceOf`

		/// In the contract, there is a similar method named `getEthBalanceInfo`. But we don't seem to need one here.
		ethBalanceOf: function(prizeWinnerAddress_) {
			expect(prizeWinnerAddress_).properAddress;
			return this.accountEthBalanceAmounts[prizeWinnerAddress_] ?? 0n;
		},

		// #endregion
	};

	// #endregion
	// #region

	return prizesWalletSimulator_;

	// #endregion
}

// #endregion
// #region `assertPrizesWalletSimulator`

async function assertPrizesWalletSimulator(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress)).equal(prizesWalletSimulator_.ethBalanceAmount);
	expect(await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes()).equal(prizesWalletSimulator_.timeoutDurationToWithdrawPrizes);
	await assertPrizesWalletSimulatorOfRandomSigner(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertPrizesWalletSimulatorOfRandomSigner`

async function assertPrizesWalletSimulatorOfRandomSigner(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_) {
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const signerIndex_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
	await assertPrizesWalletSimulatorOf(prizesWalletSimulator_, contracts_, contracts_.signers[signerIndex_].address);
}

// #endregion
// #region `assertPrizesWalletSimulatorOf`

async function assertPrizesWalletSimulatorOf(prizesWalletSimulator_, contracts_, prizeWinnerAddress_) {
	expect((await contracts_.prizesWallet["getEthBalanceInfo(address)"](prizeWinnerAddress_))[1]).equal(prizesWalletSimulator_.ethBalanceOf(prizeWinnerAddress_));
}

// #endregion
// #region

module.exports = {
	createPrizesWalletSimulator,
	assertPrizesWalletSimulator,
};

// #endregion
