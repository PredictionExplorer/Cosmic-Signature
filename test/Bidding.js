"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt32 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Bidding", function () {
	// Comment-202505315 applies.
	it("Bidding with a Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		let randomWalkNftId_ = 0n;
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(2n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(0, "hello", {value: nextEthPlusRandomWalkNftBidPrice_,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CallerIsNotNftOwner");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(0, "hello", {value: nextEthPlusRandomWalkNftBidPrice_,})).not.reverted;

		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		++ randomWalkNftId_;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: 0n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: nextEthPlusRandomWalkNftBidPrice_,})).not.reverted;
		expect(await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(randomWalkNftId_)).equal(1n);
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: nextEthPlusRandomWalkNftBidPrice_,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "UsedRandomWalkNft");
	});

	// Comment-202505315 applies.
	it("Each bidder bids with a Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		for ( let signerIndex_ = 0; signerIndex_ <= 9; ++ signerIndex_ ) {
			const randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
			await expect(contracts_.randomWalkNft.connect(contracts_.signers[signerIndex_]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
			const randomWalkNftId_ = BigInt(signerIndex_);
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			const nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(randomWalkNftId_, "bidWithRWalk", {value: nextEthPlusRandomWalkNftBidPrice_,})).not.reverted;
		}

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[9]).claimMainPrize()).not.reverted;
	});

	it("ETH refund receive by bidder reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

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
