"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("Donating", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("donateEthWithInfo() works as expected", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;
		
		let donationAmount = hre.ethers.parseEther("10");
		let dataStr ="{'version':1,'url':'http://one.two/three'}";
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, { value: donationAmount });
		let numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(1);
		// todo-1 Test that this emits the correct event. But I believe I've seen a relevant test elsewhere.
		let ethDonationWithInfoRecord_ = await cosmicSignatureGameProxy.ethDonationWithInfoRecords(0);
		expect(ethDonationWithInfoRecord_.roundNum).to.equal(0);
		expect(ethDonationWithInfoRecord_.donorAddress).to.equal(addr1.address);
		expect(ethDonationWithInfoRecord_.amount).to.equal(donationAmount);
		expect(ethDonationWithInfoRecord_.data).to.equal(dataStr);

		// check number of records is incrementing
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, { value: donationAmount });
		numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).to.equal(2);

		// await expect(cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, {value: 0n})).revertedWithCustomError(cosmicSignatureGameProxy, "NonZeroValueRequired");
		await cosmicSignatureGameProxy.connect(addr1).donateEthWithInfo(dataStr, {value: 0n});
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`
	// todo-1 and NFT donation without making a bid is now prohibited.
	it("donateNft() without making a bid works", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(owner).mint({ value: mintPrice });
		await randomWalkNft.connect(owner).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);

		await cosmicSignatureGameProxy.connect(owner).donateNft(await randomWalkNft.getAddress(),0);
		let details = await cosmicSignatureGameProxy.getDonatedNftDetails(0);
		expect(details[0]).to.equal(await randomWalkNft.getAddress());
		await expect(cosmicSignatureGameProxy.getDonatedNftDetails(1)).to.be.revertedWith("Invalid donated NFT index.");
	});

	// it("Should not be possible to donate 0 value", async function () {
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
	// 	const [owner, addr1,] = signers;
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	await expect(cosmicSignatureGameProxy.connect(addr1).donateEth()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
	// });

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("claimManyDonatedNfts() works properly", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		// await randomWalkNft.connect(addr1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(addr1).setApprovalForAll(await prizesWallet.getAddress(), true);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		let tx = await cosmicSignatureGameProxy
			.connect(addr1)
			.bidAndDonateNft(/*params*/ (-1), "", await randomWalkNft.getAddress(), 0, { value: ethBidPrice_ });
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("NftDonationEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		expect(parsed_log.args.donorAddress).to.equal(addr1.address);
		expect(parsed_log.args.nftId).to.equal(0);

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bidAndDonateNft(/*params*/ (-1), "", await randomWalkNft.getAddress(), 1, { value: ethBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize()).not.to.be.reverted;

		tx = await cosmicSignatureGameProxy.connect(addr1).claimManyDonatedNfts([0, 1]);
		receipt = await tx.wait();
		topic_sig = cosmicSignatureGameProxy.interface.getEvent("DonatedNftClaimedEvent").topicHash;
		let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(event_logs.length).to.equal(2);
		parsed_log = cosmicSignatureGameProxy.interface.parseLog(event_logs[0]);
		expect(parsed_log.args.nftId).to.equal(0);
		expect(parsed_log.args.beneficiaryAddress).to.equal(addr1.address);
		expect(parsed_log.args.nftAddress).to.equal(await randomWalkNft.getAddress());
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.index).to.equal(0);

		parsed_log = cosmicSignatureGameProxy.interface.parseLog(event_logs[1]);
		expect(parsed_log.args.nftId).to.equal(1);
		expect(parsed_log.args.beneficiaryAddress).to.equal(addr1.address);
		expect(parsed_log.args.nftAddress).to.equal(await randomWalkNft.getAddress());
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.index).to.equal(1);
	});
});
