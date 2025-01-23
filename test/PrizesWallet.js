"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("PrizesWallet", function () {
	it("depositEth works correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await expect(newPrizesWallet.connect(addr1).depositEth(0, addr1.address, {value: 1000000n})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "CallDenied");

		// // I have replaced respective `require` with an `assert`.
		// // I have observed the `assert` working. This now reverts with panic when asserts are enabled.
		// await expect(newPrizesWallet.depositEth(0, hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.depositEth(0, addr1.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
		await newPrizesWallet.depositEth(0, addr1.address);
	});
	it("withdrawEth works correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, addr2,] = signers;

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await newPrizesWallet.depositEth(0, addr1.address, {value: 1000n});

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(addr2).withdrawEth()).to.be.revertedWithCustomError(newPrizesWallet, "ZeroBalance");
		await expect(newPrizesWallet.connect(addr2).withdrawEth()).not.to.be.reverted;
	});

	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`
	// // todo-1 and NFT donation without making a bid is now prohibited.
	// it("donateNft() without making a bid works", async function () {
	// 	const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
	// 	const [owner,] = signers;
	//
	// 	let mintPrice = await randomWalkNft.getMintPrice();
	// 	await randomWalkNft.connect(owner).mint({ value: mintPrice });
	// 	await randomWalkNft.connect(owner).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
	//
	// 	await cosmicSignatureGameProxy.connect(owner).donateNft(await randomWalkNft.getAddress(),0);
	// 	let details = await cosmicSignatureGameProxy.getDonatedNftDetails(0);
	// 	expect(details[0]).to.equal(await randomWalkNft.getAddress());
	// 	await expect(cosmicSignatureGameProxy.getDonatedNftDetails(1)).to.be.revertedWith("Invalid donated NFT index.");
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
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let tx = await cosmicSignatureGameProxy
			.connect(addr1)
			.bidAndDonateNft((-1), "", await randomWalkNft.getAddress(), 0, { value: nextEthBidPrice_ });
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("NftDonationEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		expect(parsed_log.args.donorAddress).to.equal(addr1.address);
		expect(parsed_log.args.nftId).to.equal(0);

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bidAndDonateNft((-1), "", await randomWalkNft.getAddress(), 1, { value: nextEthBidPrice_ });

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
