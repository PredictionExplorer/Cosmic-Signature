"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt32 } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting, makeNextBlockTimeDeterministic } = require("../src/ContractUnitTestingHelpers.js");

// let latestTimeStamp = 0;
// let latestBlock = undefined;
// 
// async function logLatestBlock(tag_) {
// 	const latestTimeStamp_ = Date.now();
// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
// 	if (latestTimeStamp <= 0) {
// 		console.info(
// 			tag_,
// 			latestTimeStamp_.toString(),
// 			latestBlock_.number.toString(),
// 			latestBlock_.timestamp.toString(),
// 			(latestBlock_.timestamp - Math.floor(latestTimeStamp_ / 1000)).toString()
// 		);
// 	} else {
// 		console.info(
// 			tag_,
// 			latestTimeStamp_.toString(),
// 			(latestTimeStamp_ - latestTimeStamp).toString(),
// 			latestBlock_.number.toString(),
// 			(latestBlock_.number - latestBlock.number).toString(),
// 			latestBlock_.timestamp.toString(),
// 			(latestBlock_.timestamp - latestBlock.timestamp).toString(),
// 			(latestBlock_.timestamp - Math.floor(latestTimeStamp_ / 1000)).toString()
// 		);
// 	}
// 	latestTimeStamp = latestTimeStamp_;
// 	latestBlock = latestBlock_;
// }

describe("Bidding", function () {
	// Comment-202505315 applies.
	it("Bidding-related durations", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);
		
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		let randomWalkNftId_ = 0n;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "rwalk bid", {value: nextEthPlusRandomWalkNftBidPrice_,})).not.reverted;
		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_] = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();

		// Making CST bid price almost zero.
		await hre.ethers.provider.send("evm_increaseTime", [Number(cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_) - 1 - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(0n, "cst bid")).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(0n, "cst bid")).not.reverted;
	});

	// Comment-202505315 applies.
	it("The getDurationUntilRoundActivation and getDurationElapsedSinceRoundActivation methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		const newRoundActivationTime_ = BigInt(latestBlock_.timestamp + 2);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setRoundActivationTime(newRoundActivationTime_)).not.reverted;

		for ( let counter_ = -1; counter_ <= 1; ++ counter_ ) {
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(Number(newRoundActivationTime_) + counter_);
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			expect(durationUntilRoundActivation_).equal( - counter_ );
			const durationElapsedSinceRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationElapsedSinceRoundActivation();
			expect(durationElapsedSinceRoundActivation_).equal(counter_);
			await hre.ethers.provider.send("evm_mine");
		}
	});

	// Comment-202505315 applies.
	it("Bidding with ETH + Random Walk NFT", async function () {
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
	it("Each bidder bids with ETH + Random Walk NFT", async function () {
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
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[9]).claimMainPrize()).not.reverted;
	});

	// Comment-202505315 applies.
	it("ETH bid refund", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		// Comment-202506033 applies.
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		const ethAmountSent_ = 10n ** (18n - 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEth({value: ethAmountSent_,})).not.reverted;
		let bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		let bidderContractExpectedBalanceAmountAfter_ = ethAmountSent_ - nextEthBidPrice_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
	});

	// Comment-202505315 applies.
	it("ETH + Random Walk NFT bid refund", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		// Comment-202506033 applies.
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		// await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.cosmicSignatureGameProxyAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(bidderContractAddr_, true)).not.reverted;

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		let randomWalkNftId_ = 0n;
		const ethAmountSent_ = 10n ** (18n - 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEthPlusRandomWalkNft(randomWalkNftId_, {value: ethAmountSent_,})).not.reverted;
		let bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		let discountedBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		expect(discountedBidPrice_).equal((nextEthBidPrice_ + 1n) / 2n);
		let bidderContractExpectedBalanceAmountAfter_ = ethAmountSent_ - discountedBidPrice_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
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
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddr_, ethRefundAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(1n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddr_, ethRefundAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(0n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
		const bidderContractEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		expect(bidderContractEthBalanceAmountAfterTransaction_).equal(ethRefundAmount_);
	});

	// Comment-202505315 applies.
	it("Bidding with CST", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const cosmicSignatureGameProxyBidPlacedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("BidPlaced").topicHash;
		const delayDurationBeforeRoundActivation_ = await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation();

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		// console.info();
		// latestTimeStamp = 0;
		// await logLatestBlock("202506230");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		// await logLatestBlock("202506233");
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		// await logLatestBlock("202506235");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).not.reverted;
		// await logLatestBlock("202506237");

		await hre.ethers.provider.send("evm_increaseTime", [Number(delayDurationBeforeRoundActivation_) - 1 - await makeNextBlockTimeDeterministic(),]);
		// await logLatestBlock("202506239");
		await hre.ethers.provider.send("evm_mine");
		// await logLatestBlock("202506240");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		// await logLatestBlock("202506241");

		// Reducing CST bid price.
		await hre.ethers.provider.send("evm_increaseTime", [20000 - await makeNextBlockTimeDeterministic(),]);
		await hre.ethers.provider.send("evm_mine");

		// await logLatestBlock("202506242");
		let nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		expect(nextRoundFirstCstDutchAuctionBeginningBidPrice_).equal(200n * 10n ** 18n);
		let cstDutchAuctionBeginningTimeStamp_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp();
		expect(cstDutchAuctionBeginningTimeStamp_).equal(await contracts_.cosmicSignatureGameProxy.roundActivationTime());
		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_,] = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		// await logLatestBlock("202506243");
		expect(cstDutchAuctionElapsedDuration_).equal(20000n);
		++ cstDutchAuctionElapsedDuration_;
		let cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;
		let nextCstBidExpectedPrice_ = nextRoundFirstCstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		let nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		expect(nextCstBidPrice_).equal(nextCstBidExpectedPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, "cst bid")).not.reverted;
		let cstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).equal(nextCstBidPrice_ * 2n);

		cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - 1n;
		nextCstBidExpectedPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		let transactionResponse_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidExpectedPrice_ * 10n, "cst bid");
		let transactionReceipt_ = await transactionResponse_.wait();
		let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyBidPlacedTopicHash_) >= 0));
		let parsedLog_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(log_);
		expect(parsedLog_.args.lastBidderAddress).equal(contracts_.signers[1].address);
		expect(parsedLog_.args.paidEthPrice).equal(-1n);
		expect(parsedLog_.args.paidCstPrice).equal(nextCstBidExpectedPrice_);
		expect(parsedLog_.args.randomWalkNftId).equal(-1n);
		expect(parsedLog_.args.message).equal("cst bid");
		cstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).equal(nextCstBidExpectedPrice_ * 2n);
	});

	it("Cosmic Signature Token first mint reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const brokenCosmicSignatureTokenFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken", contracts_.deployerAcct);
		const brokenCosmicSignatureToken_ = await brokenCosmicSignatureTokenFactory_.deploy(0n);
		await brokenCosmicSignatureToken_.waitForDeployment();
		const brokenCosmicSignatureTokenAddr_ = await brokenCosmicSignatureToken_.getAddress();

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setCosmicSignatureToken(brokenCosmicSignatureTokenAddr_)).not.reverted;
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct), 2n);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).revertedWith("Test mint failed.");
	});

	it("Cosmic Signature Token second mint reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const numTokenMintsPerBid_ = 1n;
		const brokenCosmicSignatureTokenFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken", contracts_.deployerAcct);
		const brokenCosmicSignatureToken_ = await brokenCosmicSignatureTokenFactory_.deploy(numTokenMintsPerBid_);
		await brokenCosmicSignatureToken_.waitForDeployment();
		const brokenCosmicSignatureTokenAddr_ = await brokenCosmicSignatureToken_.getAddress();

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setCosmicSignatureToken(brokenCosmicSignatureTokenAddr_)).not.reverted;
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct), 2n);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).revertedWith("Test mint failed.");
	});

	// [Comment-202506234]
	// Multiple similar tests exist.
	// When bidding with donating an ERC-20 token or anNFT, it's also possible to reenter any other game method,
	// such as `bidWithEth`. We do not test all possible combinations, including reentries of various methods at various depths.
	// But the logic is really designed to either be reenterable or block reentry attempts,
	// so it's not possible for any malicious donated contracts to do any damage.
	// Comment-202506236 relates.
	// [/Comment-202506234]
	it("The bidWithEthAndDonateToken and bidWithCstAndDonateToken methods reentry", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);
	
		const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", contracts_.deployerAcct);
		const maliciousToken_ = await maliciousTokenFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousToken_.waitForDeployment();
		const maliciousTokenAddr_ = await maliciousToken_.getAddress();

		const ethBidAmount_ = 10n ** (18n - 2n);
		const cstBidAmount_ = 10000n * 10n ** 18n;
		const ethDonationAmount_ = ethBidAmount_ * 100n;

		await expect(contracts_.signers[0].sendTransaction({to: maliciousTokenAddr_, value: ethDonationAmount_,})).not.reverted;

		await expect(maliciousToken_.connect(contracts_.signers[0]).setModeCode(1n)).not.reverted;
		for ( let counter_ = 0; counter_ < 70; ++ counter_ ) {
			// [Comment-202506227]
			// Placing this bid multiple times to get enough CSTs to be used for CST bids.
			// [/Comment-202506227]
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateToken(-1n, "", maliciousTokenAddr_, 1n, {value: ethBidAmount_,}))
				// .revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
				.not.reverted;
		}
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n);

		await expect(maliciousToken_.connect(contracts_.signers[0]).setModeCode(2n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateToken(cstBidAmount_, "", maliciousTokenAddr_, 1n)).not.reverted;
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n + 3n);

		// [Comment-202506229]
		// One method reentering the other.
		// [/Comment-202506229]
		await expect(maliciousToken_.connect(contracts_.signers[0]).setModeCode(2n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateToken(-1n, "", maliciousTokenAddr_, 1n, {value: ethBidAmount_,})).not.reverted;
		await expect(maliciousToken_.connect(contracts_.signers[0]).setModeCode(1n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateToken(cstBidAmount_, "", maliciousTokenAddr_, 1n)).not.reverted;
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n + 3n + 2n * 3n);
	});

	// Comment-202506234 applies.
	it("The bidWithEthAndDonateNft and bidWithCstAndDonateNft methods reentry", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);
	
		const maliciousNftFactory_ = await hre.ethers.getContractFactory("MaliciousNft", contracts_.deployerAcct);
		const maliciousNft_ = await maliciousNftFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousNft_.waitForDeployment();
		const maliciousNftAddr_ = await maliciousNft_.getAddress();

		const ethBidAmount_ = 10n ** (18n - 2n);
		const cstBidAmount_ = 10000n * 10n ** 18n;
		const ethDonationAmount_ = ethBidAmount_ * 100n;

		await expect(contracts_.signers[0].sendTransaction({to: maliciousNftAddr_, value: ethDonationAmount_,})).not.reverted;

		await expect(maliciousNft_.connect(contracts_.signers[0]).setModeCode(1n)).not.reverted;
		for ( let counter_ = 0; counter_ < 70; ++ counter_ ) {
			// Comment-202506227 applies.
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateNft(-1n, "", maliciousNftAddr_, BigInt(counter_ * 10), {value: ethBidAmount_,}))
				// .revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
				.not.reverted;
		}
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n);

		await expect(maliciousNft_.connect(contracts_.signers[0]).setModeCode(2n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateNft(cstBidAmount_, "", maliciousNftAddr_, 1000n)).not.reverted;
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n + 3n);

		// Comment-202506229 applies.
		await expect(maliciousNft_.connect(contracts_.signers[0]).setModeCode(2n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateNft(-1n, "", maliciousNftAddr_, 1100n, {value: ethBidAmount_,})).not.reverted;
		await expect(maliciousNft_.connect(contracts_.signers[0]).setModeCode(1n)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateNft(cstBidAmount_, "", maliciousNftAddr_, 1200n)).not.reverted;
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(0n)).equal(70n * 3n + 3n + 2n * 3n);
	});
});
