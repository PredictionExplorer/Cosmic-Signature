"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt32 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Bidding", function () {
	it("ETH refund receive by bidder reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(1n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		const ethBidAmount_ = 10n ** 18n;

		// When `rounfNum == 0`, this doesn't depend on time.
		// Otherwise this test would probably fail.
		const requiredEthBidAmount_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);

		const ethRefundAmount_ = ethBidAmount_ - requiredEthBidAmount_;
		expect(ethRefundAmount_).greaterThan(0n);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(2n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth2({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddr_, ethRefundAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(1n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth2({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddr_, ethRefundAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(0n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth2({value: ethBidAmount_,}))
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
		const bidderContractEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		expect(bidderContractEthBalanceAmountAfterTransaction_).equal(ethRefundAmount_);
	});
});
