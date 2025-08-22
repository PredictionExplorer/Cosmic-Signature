"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { sleepForMilliSeconds, waitForTransactionReceipt } = require("../../src/Helpers.js");

async function waitUntilMainPrizeTime(cosmicSignatureGameProxy_) {
	for (;;) {
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrizeRaw({blockTag: "pending",});
		console.info(`${durationUntilMainPrize_} seconds until main prize.`);
		if (durationUntilMainPrize_ <= 0n) {
			break;
		}
		await sleepForMilliSeconds(Number(durationUntilMainPrize_) * 1000 - 500);
	}
}

async function claimMainPrize(cosmicSignatureGameProxy_, bidderSigner_) {
	console.info("claimMainPrize");
	const cosmicSignatureGameProxyMainPrizeClaimedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("MainPrizeClaimed").topicHash;
	let mainEthPrizeAmount_ = await cosmicSignatureGameProxy_.getMainEthPrizeAmount();
	const timeStamp1_ = performance.now();
	/** @type {Promise<hre.ethers.TransactionResponse>} */
	let transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(bidderSigner_).claimMainPrize();
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	const timeStamp2_ = performance.now();
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyMainPrizeClaimedTopicHash_) >= 0));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.beneficiaryAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.ethPrizeAmount).equal(mainEthPrizeAmount_);
	console.info(`Completed bidding round ${parsedLog_.args.roundNum}. claimMainPrize took ${(timeStamp2_ - timeStamp1_).toFixed(1)} ms.`);
}

// /// Comment-202509229 applies.
// async function forward_time_to_main_prize_time() {
// 	const cosmicSignatureGame = await getCosmicSignatureGameContract();
// 	let durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrizeRaw();
// 	console.info("Duration until main prize before:", durationUntilMainPrize);
// 	if (durationUntilMainPrize > 0n) {
// 		if (durationUntilMainPrize > 1n) {
// 			await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize.toNumber()]);
// 		}
// 		await hre.ethers.provider.send("evm_mine");
//
// 		// This is supposed to be zero.
// 		// But this can also be negative.
// 		durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrizeRaw();
//
// 		console.info("Duration until main prize after:", durationUntilMainPrize);
// 	}
// }

// /// [Comment-202509229]
// /// Issue. This is a legacy function that I preserved for now.
// /// Consider deleting it.
// /// [/Comment-202509229]
// async function claim_main_prize(testingAcct, cosmicSignatureGame) {
// 	let mainEthPrizeAmount = await cosmicSignatureGame.getMainEthPrizeAmount();
// 	let charityEthDonationAmount = await cosmicSignatureGame.getCharityEthDonationAmount();
// 	/** @type {Promise<hre.ethers.TransactionResponse>} */
// 	let transactionResponsePromise = cosmicSignatureGame.connect(testingAcct).claimMainPrize();
// 	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
// 	let topic_sig = cosmicSignatureGame.interface.getEventTopic("MainPrizeClaimed");
// 	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
// 	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
// 	// todo-1 Assert other args passed to the event.
// 	expect(parsed_log.args.beneficiaryAddress).equal(testingAcct.address);
// 	expect(parsed_log.args.amount).equal(mainEthPrizeAmount);
//
// 	let cosmicSignatureNftAddress = await cosmicSignatureGame.nft();
//
// 	// Comment-202502096 applies.
// 	let cosmicSignatureNft = await hre.ethers.getContractAt("CosmicSignatureNft", cosmicSignatureNftAddress);
//
// 	topic_sig = cosmicSignatureGame.interface.getEventTopic("RaffleWinnerCosmicSignatureNftAwarded");
// 	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
// 	for (let i = 0; i < event_logs.length; i++) {
// 		let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[i]);
// 		let ownr = await cosmicSignatureNft.ownerOf(parsed_log.args.prizeCosmicSignatureNftId);
// 		expect(ownr).equal(parsed_log.args.winnerAddress);
// 	}
//
// 	let prizesWalletAddress = await cosmicSignatureGame.prizesWallet();
//
// 	// Comment-202502096 applies.
// 	let prizesWallet = await hre.ethers.getContractAt("PrizesWallet", prizesWalletAddress);
//
// 	topic_sig = prizesWallet.interface.getEventTopic("EthReceived");
// 	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
// 	await claim_raffle_eth(testingAcct, prizesWallet, event_logs);
//
// 	let charityWalletAddress = await cosmicSignatureGame.charityAddress();
//
// 	// Comment-202502096 applies.
// 	let charityWallet = await hre.ethers.getContractAt("CharityWallet", charityWalletAddress);
//
// 	topic_sig = charityWallet.interface.getEventTopic("DonationReceived");
// 	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
// 	parsed_log = charityWallet.interface.parseLog(event_logs[0]);
// 	expect(parsed_log.args.amount).equal(charityEthDonationAmount);
// }

// /// Comment-202509229 applies.
// /// todo-1 Now Chrono-Warrior also gets ETH.
// /// todo-1 So maybe this function name should not include "raffle".
// async function claim_raffle_eth(testingAcct, prizesWallet, event_logs) {
// 	const unique_winners = {};
// 	for (let i = 0; i < event_logs.length; i++) {
// 		let wlog = prizesWallet.interface.parseLog(event_logs[i]);
// 		let prizeWinnerAddress = wlog.args.prizeWinnerAddress;
// 		if (prizeWinnerAddress.address == testingAcct.address) {
// 			if (unique_winners[prizeWinnerAddress] == undefined) {
// 				await prizesWallet.connect(testingAcct).withdrawEth();
// 				unique_winners[prizeWinnerAddress] = 1;
// 			}
// 		}
// 	}
// }

module.exports = {
	waitUntilMainPrizeTime,
	claimMainPrize,
};
