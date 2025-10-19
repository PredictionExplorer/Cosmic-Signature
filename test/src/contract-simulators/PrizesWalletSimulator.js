// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper } = require("../../../src/Helpers.js");
const { assertAddressIsValid, assertEvent } = require("../../../src/ContractTestingHelpers.js");

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

		/**
		Item key is address as `string`.
		Item value is a sparse array containing an item for each bidding round.
		Each item of which is either `undefined` or not yet withdrawn ETH balance amount.
		(But ETH withdrawal is not currently implemented.)
		[Comment-202511172]
		Similar data structures exist in multiple places.
		[/Comment-202511172]
		*/
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
				this.depositEth(roundNum_, BigInt(ethDepositIndex_), ethDeposit_.prizeWinnerAddress, ethDeposit_.amount, contracts_, transactionReceipt_, eventIndexWrapper_);
			}
		},

		// #endregion
		// #region `depositEth`

		depositEth: function(roundNum_, prizeWinnerIndex_, prizeWinnerAddress_, amount_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof roundNum_).equal("bigint");
			expect(roundNum_).greaterThanOrEqual(0n);
			expect(typeof prizeWinnerIndex_).equal("bigint");
			expect(prizeWinnerIndex_).greaterThanOrEqual(0n);
			// expect(prizeWinnerAddress_).not.equal(hre.ethers.ZeroAddress);
			assertAddressIsValid(prizeWinnerAddress_);
			expect(typeof amount_).equal("bigint");
			expect(amount_).greaterThanOrEqual(0n);
			{
				const newEthBalanceAmount_ = this.ethBalanceAmount + amount_;
				expect(newEthBalanceAmount_).lessThanOrEqual((1n << 128n) - 1n);
				this.ethBalanceAmount = newEthBalanceAmount_;
			}
			{
				// const prizeWinnerNewEthBalanceAmount_ = this.getEthBalanceAmount(roundNum_, prizeWinnerAddress_) + amount_;
				let prizeWinnerEthBalanceAmounts_ = this.accountEthBalanceAmounts[prizeWinnerAddress_];
				if (prizeWinnerEthBalanceAmounts_ == undefined) {
					prizeWinnerEthBalanceAmounts_ = [];
					this.accountEthBalanceAmounts[prizeWinnerAddress_] = prizeWinnerEthBalanceAmounts_;
				}
				const prizeWinnerNewEthBalanceAmount_ = (prizeWinnerEthBalanceAmounts_[Number(roundNum_)] ?? 0n) + amount_;
				prizeWinnerEthBalanceAmounts_[Number(roundNum_)] = prizeWinnerNewEthBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.prizesWallet,
				"EthReceived",
				[roundNum_, prizeWinnerIndex_, prizeWinnerAddress_, amount_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `getEthBalanceAmount`

		getEthBalanceAmount: function(roundNum_, prizeWinnerAddress_) {
			expect(typeof roundNum_).equal("bigint");
			expect(roundNum_).greaterThanOrEqual(0n);
			expect(prizeWinnerAddress_).properAddress;
			const prizeWinnerEthBalanceAmounts_ = this.accountEthBalanceAmounts[prizeWinnerAddress_];
			return (prizeWinnerEthBalanceAmounts_ == undefined) ? 0n : (prizeWinnerEthBalanceAmounts_[Number(roundNum_)] ?? 0n);
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

async function assertPrizesWalletSimulator(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_, roundNum_) {
	// expect(typeof roundNum_).equal("bigint");
	// expect(roundNum_).greaterThanOrEqual(0n);
	expect(await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress)).equal(prizesWalletSimulator_.ethBalanceAmount);
	expect(await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes()).equal(prizesWalletSimulator_.timeoutDurationToWithdrawPrizes);
	await assertPrizesWalletSimulatorOfRandomSignerEthBalanceAmount(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_, roundNum_);
}

// #endregion
// #region `assertPrizesWalletSimulatorOfRandomSignerEthBalanceAmount`

async function assertPrizesWalletSimulatorOfRandomSignerEthBalanceAmount(
	prizesWalletSimulator_,
	contracts_,
	randomNumberSeedWrapper_,
	/** @type {bigint} The current bidding round number. We will randomly pick one to assert in the range of [0n, `roundNum_`]. */
	roundNum_
) {
	// expect(typeof roundNum_).equal("bigint");
	// expect(roundNum_).greaterThanOrEqual(0n);
	let randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const roundNumToAssert_ = randomNumber_ % (roundNum_ + 1n);
	randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const signerIndex_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
	await assertPrizesWalletSimulatorOf(prizesWalletSimulator_, contracts_, roundNumToAssert_, contracts_.signers[signerIndex_].address);
}

// #endregion
// #region `assertPrizesWalletSimulatorOf`

async function assertPrizesWalletSimulatorOf(prizesWalletSimulator_, contracts_, roundNumToAssert_, prizeWinnerAddress_) {
	// expect(typeof roundNumToAssert_).equal("bigint");
	// expect(roundNumToAssert_).greaterThanOrEqual(0n);
	expect(await contracts_.prizesWallet["getEthBalanceAmount(uint256,address)"](roundNumToAssert_, prizeWinnerAddress_)).equal(prizesWalletSimulator_.getEthBalanceAmount(roundNumToAssert_, prizeWinnerAddress_));
}

// #endregion
// #region

module.exports = {
	createPrizesWalletSimulator,
	assertPrizesWalletSimulator,
};

// #endregion
