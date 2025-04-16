"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("PrizesWallet", function () {
	it("depositEth works correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, prizesWalletFactory,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		const newPrizesWallet = await prizesWalletFactory.deploy(signer0.address);
		await newPrizesWallet.waitForDeployment();
		await newPrizesWallet.transferOwnership(ownerAcct.address);

		await expect(newPrizesWallet.connect(signer1).depositEth(0, signer1.address, {value: 1000000n})).to.be.revertedWithCustomError(newPrizesWallet, "UnauthorizedCaller");

		// // I have replaced respective `require` with an `assert`.
		// // I have observed the `assert` working. This now reverts with panic when asserts are enabled.
		// await expect(newPrizesWallet.connect(signer0).depositEth(0, hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(newPrizesWallet, "ZeroAddress");

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(signer0).depositEth(0, signer1.address)).to.be.revertedWithCustomError(newPrizesWallet, "ZeroValue");
		await newPrizesWallet.connect(signer0).depositEth(0, signer1.address);
	});
	
	it("withdrawEth works correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, prizesWalletFactory,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		const newPrizesWallet = await prizesWalletFactory.deploy(signer0.address);
		await newPrizesWallet.waitForDeployment();
		await newPrizesWallet.transferOwnership(ownerAcct.address);

		await newPrizesWallet.connect(signer0).depositEth(0, signer1.address, {value: 1000n});

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(signer2).withdrawEth()).to.be.revertedWithCustomError(newPrizesWallet, "ZeroBalance");
		await expect(newPrizesWallet.connect(signer2).withdrawEth()).not.to.be.reverted;
	});

	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`
	// // todo-1 and NFT donation without making a bid is now prohibited.
	// it("donateNft() without making a bid works", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, randomWalkNft, randomWalkNftAddr,} =
	// 		await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//
	// 	let mintPrice = await randomWalkNft.getMintPrice();
	// 	await randomWalkNft.connect(signer0).mint({ value: mintPrice });
	// 	await randomWalkNft.connect(signer0).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
	//
	// 	await cosmicSignatureGameProxy.connect(signer0).donateNft(randomWalkNftAddr, 0);
	// 	let details = await cosmicSignatureGameProxy.getDonatedNftDetails(0);
	// 	expect(details[0]).to.equal(randomWalkNftAddr);
	// 	await expect(cosmicSignatureGameProxy.getDonatedNftDetails(1)).to.be.revertedWith("Invalid donated NFT index.");
	// });

	it("claimManyDonatedNfts() works properly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, prizesWallet, prizesWalletAddr, randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		// ToDo-202411202-1 applies.
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: mintPrice });
		// await randomWalkNft.connect(signer1).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(signer1).setApprovalForAll(prizesWalletAddr, true);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let tx = await cosmicSignatureGameProxy
			.connect(signer1)
			.bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, { value: nextEthBidPrice_ });
		let receipt = await tx.wait();
		// let topic_sig = cosmicSignatureGameProxy.interface.getEvent("NftDonationEvent").topicHash;
		let topic_sig = prizesWallet.interface.getEvent("NftDonated").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		// todo-1 These asserts fail because the code above needs to be refactored to get the event from `prizesWallet`.
		// expect(parsed_log.args.donorAddress).to.equal(signer1.address);
		// expect(parsed_log.args.nftId).to.equal(0);

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: mintPrice });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 1, { value: nextEthBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).not.to.be.reverted;

		// tx = await cosmicSignatureGameProxy.connect(signer1).claimManyDonatedNfts([0, 1]);
		tx = await prizesWallet.connect(signer1).claimManyDonatedNfts([0, 1]);
		receipt = await tx.wait();
		// topic_sig = cosmicSignatureGameProxy.interface.getEvent("DonatedNftClaimedEvent").topicHash;
		topic_sig = prizesWallet.interface.getEvent("DonatedNftClaimed").topicHash;
		let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(event_logs.length).to.equal(2);
		// parsed_log = cosmicSignatureGameProxy.interface.parseLog(event_logs[0]);
		parsed_log = prizesWallet.interface.parseLog(event_logs[0]);
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.beneficiaryAddress).to.equal(signer1.address);
		expect(parsed_log.args.nftAddress).to.equal(randomWalkNftAddr);
		expect(parsed_log.args.nftId).to.equal(1);
		expect(parsed_log.args.index).to.equal(1);

		// parsed_log = cosmicSignatureGameProxy.interface.parseLog(event_logs[1]);
		parsed_log = prizesWallet.interface.parseLog(event_logs[1]);
		expect(parsed_log.args.roundNum).to.equal(0);
		expect(parsed_log.args.beneficiaryAddress).to.equal(signer1.address);
		expect(parsed_log.args.nftAddress).to.equal(randomWalkNftAddr);
		expect(parsed_log.args.nftId).to.equal(0);
		expect(parsed_log.args.index).to.equal(0);
	});
});
