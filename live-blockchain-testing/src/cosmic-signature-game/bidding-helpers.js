"use strict";

const { expect } = require("chai");
// const hre = require("hardhat");
const { sleepForMilliSeconds, getBlockTimeStampByBlockNumber, waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function ensureDurationElapsedSinceRoundActivationIsAtLeast(cosmicSignatureGameProxy_, ownerSigner_, durationElapsedSinceRoundActivationMinLimit_) {
	const roundActivationTime_ = await cosmicSignatureGameProxy_.roundActivationTime({blockTag: "pending",});
	const pendingBlockTimeStamp_ = await getBlockTimeStampByBlockNumber("pending");
	const roundActivationTimeMaxLimit_ = pendingBlockTimeStamp_ - durationElapsedSinceRoundActivationMinLimit_;
	const roundActivationTimeExcess_ = roundActivationTime_ - roundActivationTimeMaxLimit_;
	if(roundActivationTimeExcess_ > 0n) {
		console.info("%s", `Moving bidding round activation time back by ${roundActivationTimeExcess_} seconds.`);
		await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setRoundActivationTime(roundActivationTimeMaxLimit_));
	} else {
		console.info("%s", `It's unnecessary to move bidding round activation time back. Its current value is already before its desired value by ${( - roundActivationTimeExcess_ )} seconds.`);
	}
}

async function waitUntilCstDutchAuctionElapsedDurationIsAtLeast(cosmicSignatureGameProxy_, cstDutchAuctionElapsedDurationMinLimit_) {
	for (;;) {
		let cstDutchAuctionElapsedDuration_ = (await cosmicSignatureGameProxy_.getCstDutchAuctionDurations({blockTag: "pending",}))[1];
		console.info("%s", `CST Dutch auction elapsed duration is ${cstDutchAuctionElapsedDuration_} seconds. We want it to be at least ${cstDutchAuctionElapsedDurationMinLimit_} seconds.`);
		if (cstDutchAuctionElapsedDuration_ >= cstDutchAuctionElapsedDurationMinLimit_) {
			break;
		}
		let sleepDurationInMilliSeconds_ = (Number(cstDutchAuctionElapsedDurationMinLimit_) - Number(cstDutchAuctionElapsedDuration_)) * 1000 - 500;
		await sleepForMilliSeconds(sleepDurationInMilliSeconds_);
	}
}

async function bidWithEth(cosmicSignatureGameProxy_, bidderSigner_) {
	console.info("%s", "bidWithEth");
	const cosmicSignatureGameProxyBidPlacedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const nextEthBidPrices_ = new Array(5);

	// [Comment-202510017]
	// Issue. We need to request ETH bid prices for a few upcoming seconds only if we are to make the 1st bid in a bidding round.
	// Otherwise all the prices would be the same.
	// But keeping it simple.
	// [/Comment-202510017]
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;

		// [Comment-202509215]
		// Issue. Passing `currentTimeOffset_ = nextEthBidPriceIndex_`.
		// It's correct to do so only if a block does not span multilpe seconds.
		// [/Comment-202509215]
		nextEthBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(BigInt(nextEthBidPriceIndex_), {blockTag: "pending",});

		if (nextEthBidPriceIndex_ <= 0) {
			break;
		}
	}

	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ =
		cosmicSignatureGameProxy_
			.connect(bidderSigner_)
			.bidWithEth(-1n, "bidWithEth", {value: nextEthBidPrices_[0],});
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(cosmicSignatureGameProxyBidPlacedTopicHash_)));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.paidEthPrice).oneOf(nextEthBidPrices_);
	expect(parsedLog_.args.paidCstPrice).equals(-1n);
	expect(parsedLog_.args.randomWalkNftId).equal(-1n);
	expect(parsedLog_.args.message).equal("bidWithEth");
}

async function bidWithEthPlusRandomWalkNft(cosmicSignatureGameProxy_, bidderSigner_, randomWalkNftId_) {
	console.info("%s", "bidWithEthPlusRandomWalkNft");
	const cosmicSignatureGameProxyBidPlacedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const nextEthBidPrices_ = new Array(5);

	// Comment-202510017 applies.
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;

		// Comment-202509215 applies.
		nextEthBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(BigInt(nextEthBidPriceIndex_), {blockTag: "pending",});

		if (nextEthBidPriceIndex_ <= 0) {
			break;
		}
	}

	const nextEthPlusRandomWalkNftBidPrices_ = new Array(nextEthBidPrices_.length);
	nextEthPlusRandomWalkNftBidPrices_[0] = await cosmicSignatureGameProxy_.getEthPlusRandomWalkNftBidPrice(nextEthBidPrices_[0], {blockTag: "pending",});
	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ =
		cosmicSignatureGameProxy_
			.connect(bidderSigner_)
			.bidWithEth(randomWalkNftId_, "bidWithEthPlusRandomWalkNft", {value: nextEthPlusRandomWalkNftBidPrices_[0],});
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;
		nextEthPlusRandomWalkNftBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getEthPlusRandomWalkNftBidPrice(nextEthBidPrices_[nextEthBidPriceIndex_], {blockTag: "pending",});
		if (nextEthBidPriceIndex_ <= 1) {
			break;
		}
	}
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(cosmicSignatureGameProxyBidPlacedTopicHash_)));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.paidEthPrice).oneOf(nextEthPlusRandomWalkNftBidPrices_);
	expect(parsedLog_.args.paidCstPrice).equals(-1n);
	expect(parsedLog_.args.randomWalkNftId).equal(randomWalkNftId_);
	expect(parsedLog_.args.message).equal("bidWithEthPlusRandomWalkNft");
}

async function bidWithEthAndDonateNft(cosmicSignatureGameProxy_, prizesWallet_, bidderSigner_, donatedNftAddress_, donatedNftId_, donatedNftIndexes_) {
	console.info("%s", "bidWithEthAndDonateNft");
	const cosmicSignatureGameProxyBidPlacedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const prizesWalletNftDonatedTopicHash_ = prizesWallet_.interface.getEvent("NftDonated").topicHash;
	const nextEthBidPrices_ = new Array(5);

	// Comment-202510017 applies.
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;

		// Comment-202509215 applies.
		nextEthBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(BigInt(nextEthBidPriceIndex_), {blockTag: "pending",});

		if (nextEthBidPriceIndex_ <= 0) {
			break;
		}
	}

	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ =
		cosmicSignatureGameProxy_
			.connect(bidderSigner_)
			.bidWithEthAndDonateNft(-1n, "bidWithEthAndDonateNft", donatedNftAddress_, donatedNftId_, {value: nextEthBidPrices_[0],});
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(cosmicSignatureGameProxyBidPlacedTopicHash_)));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.paidEthPrice).oneOf(nextEthBidPrices_);
	expect(parsedLog_.args.paidCstPrice).equals(-1n);
	expect(parsedLog_.args.randomWalkNftId).equal(-1n);
	expect(parsedLog_.args.message).equal("bidWithEthAndDonateNft");
	log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(prizesWalletNftDonatedTopicHash_)));
	parsedLog_ = prizesWallet_.interface.parseLog(log_);
	expect(parsedLog_.args.donorAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.nftAddress).equal(donatedNftAddress_);
	expect(parsedLog_.args.nftId).equal(donatedNftId_);
	donatedNftIndexes_.push(parsedLog_.args.index);
}

async function bidWithEthPlusRandomWalkNftAndDonateNft(cosmicSignatureGameProxy_, prizesWallet_, bidderSigner_, randomWalkNftId_, donatedNftAddress_, donatedNftId_, donatedNftIndexes_) {
	console.info("%s", "bidWithEthPlusRandomWalkNftAndDonateNft");
	const cosmicSignatureGameProxyBidPlacedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const prizesWalletNftDonatedTopicHash_ = prizesWallet_.interface.getEvent("NftDonated").topicHash;
	const nextEthBidPrices_ = new Array(5);

	// Comment-202510017 applies.
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;

		// Comment-202509215 applies.
		nextEthBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(BigInt(nextEthBidPriceIndex_), {blockTag: "pending",});

		if (nextEthBidPriceIndex_ <= 0) {
			break;
		}
	}

	const nextEthPlusRandomWalkNftBidPrices_ = new Array(nextEthBidPrices_.length);
	nextEthPlusRandomWalkNftBidPrices_[0] = await cosmicSignatureGameProxy_.getEthPlusRandomWalkNftBidPrice(nextEthBidPrices_[0], {blockTag: "pending",});
	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ =
		cosmicSignatureGameProxy_
			.connect(bidderSigner_)
			.bidWithEthAndDonateNft(randomWalkNftId_, "bidWithEthPlusRandomWalkNftAndDonateNft", donatedNftAddress_, donatedNftId_, {value: nextEthPlusRandomWalkNftBidPrices_[0],});
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	for (let nextEthBidPriceIndex_ = nextEthBidPrices_.length; ; ) {
		-- nextEthBidPriceIndex_;
		nextEthPlusRandomWalkNftBidPrices_[nextEthBidPriceIndex_] = await cosmicSignatureGameProxy_.getEthPlusRandomWalkNftBidPrice(nextEthBidPrices_[nextEthBidPriceIndex_], {blockTag: "pending",});
		if (nextEthBidPriceIndex_ <= 1) {
			break;
		}
	}
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(cosmicSignatureGameProxyBidPlacedTopicHash_)));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.paidEthPrice).oneOf(nextEthPlusRandomWalkNftBidPrices_);
	expect(parsedLog_.args.paidCstPrice).equals(-1n);
	expect(parsedLog_.args.randomWalkNftId).equal(randomWalkNftId_);
	expect(parsedLog_.args.message).equal("bidWithEthPlusRandomWalkNftAndDonateNft");
	log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(prizesWalletNftDonatedTopicHash_)));
	parsedLog_ = prizesWallet_.interface.parseLog(log_);
	expect(parsedLog_.args.donorAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.nftAddress).equal(donatedNftAddress_);
	expect(parsedLog_.args.nftId).equal(donatedNftId_);
	donatedNftIndexes_.push(parsedLog_.args.index);
}

async function bidWithCstAndDonateToken(cosmicSignatureGameProxy_, prizesWallet_, bidderSigner_, donatedTokenAddress_, donatedTokenAmount_, donatedTokensToClaim_) {
	console.info("%s", "bidWithCstAndDonateToken");
	const cosmicSignatureGameProxyBidPlacedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const prizesWalletTokenDonatedTopicHash_ = prizesWallet_.interface.getEvent("TokenDonated").topicHash;
	const nextCstBidPrices_ = new Array(5);
	const timeStamp1_ = performance.now();
	for (let nextCstBidPriceIndex_ = nextCstBidPrices_.length; ; ) {
		-- nextCstBidPriceIndex_;

		// Comment-202509215 applies.
		nextCstBidPrices_[nextCstBidPriceIndex_] = await cosmicSignatureGameProxy_.getNextCstBidPriceAdvanced(BigInt(nextCstBidPriceIndex_), {blockTag: "pending",});

		// console.info("%s", hre.ethers.formatEther(nextCstBidPrices_[nextCstBidPriceIndex_]));
		if (nextCstBidPriceIndex_ <= 0) {
			break;
		}
	}
	const timeStamp2_ = performance.now();
	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ =
		cosmicSignatureGameProxy_
			.connect(bidderSigner_)
			.bidWithCstAndDonateToken(nextCstBidPrices_[0], "bidWithCstAndDonateToken", donatedTokenAddress_, donatedTokenAmount_);
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	const timeStamp3_ = performance.now();
	console.info(
		"%s",
		`${nextCstBidPrices_.length} getNextCstBidPriceAdvanced calls took ${(timeStamp2_ - timeStamp1_).toFixed(1)} ms. ` +
		`bidWithCstAndDonateToken took ${(timeStamp3_ - timeStamp2_).toFixed(1)} ms.`
	);
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(cosmicSignatureGameProxyBidPlacedTopicHash_)));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.paidEthPrice).equals(-1n);
	expect(parsedLog_.args.paidCstPrice).oneOf(nextCstBidPrices_);
	expect(parsedLog_.args.randomWalkNftId).equal(-1n);
	expect(parsedLog_.args.message).equal("bidWithCstAndDonateToken");
	log_ = transactionReceipt_.logs.find((log_) => (log_.topics.includes(prizesWalletTokenDonatedTopicHash_)));
	parsedLog_ = prizesWallet_.interface.parseLog(log_);
	expect(parsedLog_.args.donorAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.tokenAddress).equal(donatedTokenAddress_);
	expect(parsedLog_.args.amount).equal(donatedTokenAmount_);
	donatedTokensToClaim_.push({
		roundNum: parsedLog_.args.roundNum,
		tokenAddress: parsedLog_.args.tokenAddress,
		amount: parsedLog_.args.amount,
	});
}

module.exports = {
	ensureDurationElapsedSinceRoundActivationIsAtLeast,
	waitUntilCstDutchAuctionElapsedDurationIsAtLeast,
	bidWithEth,
	bidWithEthPlusRandomWalkNft,
	bidWithEthAndDonateNft,
	bidWithEthPlusRandomWalkNftAndDonateNft,
	bidWithCstAndDonateToken,
};
