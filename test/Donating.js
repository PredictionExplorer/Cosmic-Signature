"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("Donation tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNFTId", type: "int256" },
		],
	};
	it("donateWithInfo() works as expected", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = hre.ethers.parseEther("10");
		let dataStr ="{'version':1,'url':'http://one.two/three'}";
		await cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: donationAmount });
		let numDonationInfoRecords_ = await cosmicGameProxy.numDonationInfoRecords();
		expect(numDonationInfoRecords_).to.equal(1);
		let donationInfoRec = await cosmicGameProxy.donationInfoRecords(0);
		expect(donationInfoRec.donor).to.equal(addr1.address);
		expect(donationInfoRec.data).to.equal(dataStr);

		// check number of records is incrementing
		await cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: donationAmount });
		numDonationInfoRecords_ = await cosmicGameProxy.numDonationInfoRecords();
		expect(numDonationInfoRecords_).to.equal(2);

		await expect(cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: 0n})).to.be.revertedWithCustomError(cosmicGameProxy, "NonZeroValueRequired");
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`
	// todo-1 and NFT donation without making a bid is now prohibited.
	it("donateNft() without making a bid works", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(owner).mint({ value: mintPrice });
		await randomWalkNFT.connect(owner).setApprovalForAll(await cosmicGameProxy.getAddress(), true);

		await cosmicGameProxy.connect(owner).donateNft(await randomWalkNFT.getAddress(),0);
		let details = await cosmicGameProxy.getDonatedNftDetails(0);
		expect(details[0]).to.equal(await randomWalkNFT.getAddress());
		await expect(cosmicGameProxy.getDonatedNftDetails(1)).to.be.revertedWith("Invalid donated NFT index.");
	});

	it("Should not be possible to donate 0 value", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(cosmicGameProxy.connect(addr1).donate()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("claimManyDonatedNfts() works properly", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		// await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.prizesWallet(), true);
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let tx = await cosmicGameProxy
			.connect(addr1)
			.bidAndDonateNft(params, await randomWalkNFT.getAddress(), 0, { value: bidPrice });
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent("NftDonationEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		expect(parsed_log.args.donor).to.equal(addr1.address);
		expect(parsed_log.args.nftId).to.equal(0);

		bidPrice = await cosmicGameProxy.getBidPrice();
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bidAndDonateNft(params, await randomWalkNFT.getAddress(), 1, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+100]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).not.to.be.reverted;

		tx = await cosmicGameProxy.connect(addr1).claimManyDonatedNfts([0, 1]);
		receipt = await tx.wait();
		topic_sig = cosmicGameProxy.interface.getEvent("DonatedNftClaimedEvent").topicHash;
		let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(event_logs.length).to.equal(2);
		parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
		expect(parsed_log.args.nftId).to.equal(0);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddress).to.equal(await randomWalkNFT.getAddress());
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.index).to.equal(0);

		parsed_log = cosmicGameProxy.interface.parseLog(event_logs[1]);
		expect(parsed_log.args.nftId).to.equal(1);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddress).to.equal(await randomWalkNFT.getAddress());
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.index).to.equal(1);
	});
});
