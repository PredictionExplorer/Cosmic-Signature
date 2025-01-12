"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("Contract", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("A contract can win main prize", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		let bidderContract = await BidderContract.connect(owner).deploy(await cosmicSignatureGameProxy.getAddress());
		await bidderContract.waitForDeployment();

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		// let bidParams = { message: "owner bids", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(owner).bid(/*params*/ (-1), "owner bids", { value: nextEthBidPrice_ });
		// bidParams = { message: "addr1 bids", randomWalkNftId: -1 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "addr1 bids", { value: nextEthBidPrice_ });
		// bidParams = { message: "addr2 bids", randomWalkNftId: -1 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "addr2 bids", { value: nextEthBidPrice_ });

		// const randomWalkNftAddr_ = await cosmicSignatureGameProxy.randomWalkNft();
		const randomWalkNftAddr_ = await randomWalkNft.getAddress();
		// const randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
		let rwalkPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(owner).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(owner).setApprovalForAll(await bidderContract.getAddress(), true);
		let tx = await randomWalkNft.connect(owner).mint({ value: rwalkPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNft.interface.parseLog(log);
		let donatedNftId_ = parsed_log.args.tokenId;
		await randomWalkNft.connect(owner).transferFrom(owner.address, await bidderContract.getAddress(), donatedNftId_);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		// todo-1 I have commented this method out.
		await bidderContract.connect(owner).doBidAndDonateNft(randomWalkNftAddr_, donatedNftId_, { value: nextEthBidPrice_ });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract.connect(owner).doBid({ value: nextEthBidPrice_ });

		rwalkPrice = await randomWalkNft.getMintPrice();
		tx = await randomWalkNft.connect(owner).mint({ value: rwalkPrice });
		receipt = await tx.wait();
		topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = randomWalkNft.interface.parseLog(log);
		let rwalk_token_id = parsed_log.args.tokenId;
		await randomWalkNft.connect(owner).transferFrom(owner.address,await bidderContract.getAddress(), rwalk_token_id);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await bidderContract.connect(owner).doBidRWalk(rwalk_token_id, { value: nextEthPlusRandomWalkNftBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		tx = await bidderContract.connect(owner).doClaim();
		receipt = await tx.wait();
		topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		let mint_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		await bidderContract.withdrawAll();

		for (let i = 0; i < mint_logs.length; i++) {
			let parsed_log = cosmicSignatureNft.interface.parseLog(mint_logs[i]);
			if (parsed_log.args.nftOwnerAddress != (await bidderContract.getAddress())) {
				continue;
			}
			let tokId = parsed_log.args.nftId;
			let ownerAddr = await cosmicSignatureNft.ownerOf(tokId);
			expect(ownerAddr).to.equal(owner.address);
		}
		
		let donatedNftOwner_ = await randomWalkNft.ownerOf(donatedNftId_);
		expect(donatedNftOwner_).to.equal(owner.address);
	});

	// [ToDo-202412176-1]
	// We no longer have any contracts that implement `IERC721Receiver'.
	// So both `BidCNonRecv` and this test should be removed.
	// [/ToDo-202412176-1]
	it("Non-IERC721Receiver contract can bid", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const BNonRec = await hre.ethers.getContractFactory("BidCNonRecv");
		let bnonrec = await BNonRec.connect(owner).deploy(await cosmicSignatureGameProxy.getAddress());
		await bnonrec.waitForDeployment();

		// let bidParams = { message: "owner bids", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(owner).bid(/*params*/ (-1), "owner bids", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bnonrec.connect(owner).doBid({ value: nextEthBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await bnonrec.connect(owner).doClaim();
		let receipt = await tx.wait();
		const topic_sig = cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		let mint_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let prizeWinnerTokenIndex = 0;
		let parsed_log = cosmicSignatureNft.interface.parseLog(mint_logs[prizeWinnerTokenIndex]);
		let args = parsed_log.args.toObject();
		let o = await cosmicSignatureNft.ownerOf(args.nftId);
		expect(await bnonrec.getAddress()).to.equal(o);
	});
});
