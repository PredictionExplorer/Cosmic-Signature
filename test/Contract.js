"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("Contract", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
			bidLogic,
		};
	}
	it("A contract can win main prize", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, randomWalkNft } = await loadFixture(
			deployCosmicSignature,
		);

		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		let bidderContract = await BidderContract.connect(owner).deploy(await cosmicSignatureGameProxy.getAddress());
		await bidderContract.waitForDeployment();

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice;
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "owner bids", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(owner).bid(params, { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		bidParams = { message: "addr1 bids", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		bidParams = { message: "addr2 bids", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(addr2).bid(params, { value: bidPrice });

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
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await randomWalkNft.connect(owner).transferFrom(owner.address, await bidderContract.getAddress(), donatedNftId_);
		// todo-1 I have commented this method out.
		await bidderContract.connect(owner).doBidAndDonateNft(randomWalkNftAddr_, donatedNftId_, { value: bidPrice });

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await bidderContract.connect(owner).doBid({ value: bidPrice });

		rwalkPrice = await randomWalkNft.getMintPrice();
		tx = await randomWalkNft.connect(owner).mint({ value: rwalkPrice });
		receipt = await tx.wait();
		topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = randomWalkNft.interface.parseLog(log);
		let rwalk_token_id = parsed_log.args.tokenId;
		await randomWalkNft.connect(owner).transferFrom(owner.address,await bidderContract.getAddress(), rwalk_token_id);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await bidderContract.connect(owner).doBidRWalk(rwalk_token_id, { value: bidPrice });
		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
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
	it("Non-ERC721 receiver contract can bid", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, randomWalkNft } = await loadFixture(
			deployCosmicSignature,
		);

		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const BNonRec = await hre.ethers.getContractFactory("BidCNonRecv");
		let bnonrec = await BNonRec.connect(owner).deploy(await cosmicSignatureGameProxy.getAddress());
		await bnonrec.waitForDeployment();

		let bidPrice;
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "owner bids", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(owner).bid(params, { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await bnonrec.connect(owner).doBid({ value: bidPrice });

		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
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
