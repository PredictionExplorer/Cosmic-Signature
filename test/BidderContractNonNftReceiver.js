"use strict";

// const { expect } = require("chai");
// const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

// // Comment-202412176 applies.
// describe("BidderContractNonNftReceiver", function () {
// 	it("Non-IERC721Receiver contract can bid", async function () {
// 		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
// 		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNft,} =
// 			await loadFixture(deployContractsForUnitTesting);
// 		const [signer0,] = signers;
// 	
// 		const bidderContractNonNftReceiverFactory = await hre.ethers.getContractFactory("BidderContractNonNftReceiver", deployerAcct);
// 		const bidderContractNonNftReceiver = await bidderContractNonNftReceiverFactory.deploy(cosmicSignatureGameProxyAddr);
// 		await bidderContractNonNftReceiver.waitForDeployment();
// 		const bidderContractNonNftReceiverAddr = await bidderContractNonNftReceiver.getAddress();
// 	
// 		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
// 		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "signer0 bid", { value: nextEthBidPrice_ });
// 		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
// 		await bidderContractNonNftReceiver.connect(signer0).doBidWithEth({ value: nextEthBidPrice_ });
// 	
// 		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
// 		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
// 		// await hre.ethers.provider.send("evm_mine");
// 		let tx = await bidderContractNonNftReceiver.connect(signer0).doClaimMainPrize();
// 		let receipt = await tx.wait();
// 		const topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
// 		let mint_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
// 		let prizeWinnerNftIndex_ = 0;
// 		let parsed_log = cosmicSignatureNft.interface.parseLog(mint_logs[prizeWinnerNftIndex_]);
// 		let args = parsed_log.args.toObject();
// 		let o = await cosmicSignatureNft.ownerOf(args.nftId);
// 		expect(o).to.equal(bidderContractNonNftReceiverAddr);
// 	});
// });
