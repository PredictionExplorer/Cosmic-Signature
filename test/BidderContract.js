"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("BidderContract", function () {
	it("A contract can win main prize", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNft, randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "signer0 bid", {value: nextEthBidPrice_,});
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "signer1 bid", {value: nextEthBidPrice_,});
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "signer2 bid", {value: nextEthBidPrice_,});

		let rwalkPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(signer0).setApprovalForAll(bidderContractAddr_, true);
		let transactionResponse_ = await randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
		let transactionReceipt_ = await transactionResponse_.wait();
		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		let log = transactionReceipt_.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNft.interface.parseLog(log);
		let donatedNftId_ = parsed_log.args.tokenId;
		await randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContractAddr_, donatedNftId_);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract_.connect(signer0).doBidWithEthAndDonateNft(randomWalkNftAddr, donatedNftId_, {value: nextEthBidPrice_,});

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract_.connect(signer0).doBidWithEth({value: nextEthBidPrice_,});

		rwalkPrice = await randomWalkNft.getMintPrice();
		transactionResponse_ = await randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
		transactionReceipt_ = await transactionResponse_.wait();
		topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		log = transactionReceipt_.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = randomWalkNft.interface.parseLog(log);
		let rwalk_token_id = parsed_log.args.tokenId;
		await randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContractAddr_, rwalk_token_id);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await bidderContract_.connect(signer0).doBidWithEthRWalk(rwalk_token_id, {value: nextEthPlusRandomWalkNftBidPrice_,});
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		transactionResponse_ = await bidderContract_.connect(signer0).doClaimMainPrize();
		transactionReceipt_ = await transactionResponse_.wait();
		topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		let mint_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		await bidderContract_.connect(signer0).withdrawAll();

		for (let i = 0; i < mint_logs.length; i++) {
			let parsed_log = cosmicSignatureNft.interface.parseLog(mint_logs[i]);
			if (parsed_log.args.nftOwnerAddress != bidderContractAddr_) {
				continue;
			}
			let tokId = parsed_log.args.nftId;
			let ownerAddr = await cosmicSignatureNft.ownerOf(tokId);
			expect(ownerAddr).to.equal(signer0.address);
		}
		
		let donatedNftOwner_ = await randomWalkNft.ownerOf(donatedNftId_);
		expect(donatedNftOwner_).to.equal(signer0.address);
	});
});
