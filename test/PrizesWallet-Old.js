"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("PrizesWallet-Old", function () {
	it("depositEth works correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, prizesWalletFactory,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		const newPrizesWallet = await prizesWalletFactory.deploy(signer0.address);
		await newPrizesWallet.waitForDeployment();
		await newPrizesWallet.transferOwnership(ownerAcct.address);

		await expect(newPrizesWallet.connect(signer1).depositEth(0, signer1.address, {value: 1000000n})).revertedWithCustomError(newPrizesWallet, "UnauthorizedCaller");

		// // I have replaced respective `require` with an `assert`.
		// // I have observed the `assert` working. This now reverts with panic when asserts are enabled.
		// await expect(newPrizesWallet.connect(signer0).depositEth(0, hre.ethers.ZeroAddress)).revertedWithCustomError(newPrizesWallet, "ZeroAddress");

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(signer0).depositEth(0, signer1.address)).revertedWithCustomError(newPrizesWallet, "ZeroValue");
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
		// await expect(newPrizesWallet.connect(signer2).withdrawEth()).revertedWithCustomError(newPrizesWallet, "ZeroBalance");
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

	it("The claimManyDonatedNfts method", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, prizesWallet, prizesWalletAddr, randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		// [ToDo-202411202-1]
		// This is a quick hack.
		// To be revisited.
		// [/ToDo-202411202-1]
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: mintPrice });
		// await randomWalkNft.connect(signer1).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(signer1).setApprovalForAll(prizesWalletAddr, true);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let transactionResponse_ = await cosmicSignatureGameProxy
			.connect(signer1)
			.bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, {value: nextEthBidPrice_,});
		let transactionReceipt_ = await transactionResponse_.wait();
		// let topic_sig = cosmicSignatureGameProxy.interface.getEvent("NftDonationEvent").topicHash;
		let topic_sig = prizesWallet.interface.getEvent("NftDonated").topicHash;
		let log = transactionReceipt_.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		// todo-1 These asserts fail because the code above needs to be refactored to get the event from `prizesWallet`.
		// expect(parsed_log.args.donorAddress).to.equal(signer1.address);
		// expect(parsed_log.args.nftId).to.equal(0);

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: mintPrice });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 1, {value: nextEthBidPrice_,});

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).not.to.be.reverted;

		// transactionResponse_ = await cosmicSignatureGameProxy.connect(signer1).claimManyDonatedNfts([0, 1]);
		transactionResponse_ = await prizesWallet.connect(signer1).claimManyDonatedNfts([0, 1]);
		transactionReceipt_ = await transactionResponse_.wait();
		// topic_sig = cosmicSignatureGameProxy.interface.getEvent("DonatedNftClaimedEvent").topicHash;
		topic_sig = prizesWallet.interface.getEvent("DonatedNftClaimed").topicHash;
		let event_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
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

	// todo-0 This test used to be in "MainPrize-Old.js" (which I deleted).
	// todo-0 Think if I need to preserve parts of it.
	// todo-0 check for `.not.reverted`.
	it("Emits MainPrizeClaimed and updates main prize beneficiary on successful main prize claim", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {contracts_.ownerAcct, signers, contracts_.cosmicSignatureGameProxy, contracts_.cosmicSignatureGameProxyAddr, contracts_.prizesWallet, prizesWalletAddr, contracts_.randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [daoOwner, donor, bidder1, bidder2, bidder3,] = signers;

		// ToDo-202411202-1 applies.
		await contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await contracts_.randomWalkNft.getMintPrice();
		await contracts_.randomWalkNft.connect(donor).mint({ value: mintPrice });

		// await randeomWalkNFT.connect(donor).setApprovalForAll(contracts_.cosmicSignatureGameProxyAddr, true);
		await contracts_.randomWalkNft.connect(donor).setApprovalForAll(prizesWalletAddr, true);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await contracts_.cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, {value: nextEthBidPrice_,});

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await contracts_.cosmicSignatureGameProxy.connect(bidder1).bidWithEth(-1n, "", {value: nextEthBidPrice_,});

		// await expect(contracts_.cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "DonatedNftClaimDenied");
		await expect(contracts_.prizesWallet.connect(bidder1).claimDonatedNft(0)).revertedWithCustomError(contracts_.prizesWallet, "DonatedNftClaimDenied");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let mainEthPrizeAmountBeforeClaim_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();

		await expect(contracts_.cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0, bidder1.address, mainEthPrizeAmountBeforeClaim_, 0);

		// const mainPrizeBeneficiaryAddress_ = await contracts_.cosmicSignatureGameProxy.winners(0);
		const mainPrizeBeneficiaryAddress_ = await contracts_.prizesWallet.mainPrizeBeneficiaryAddresses(0);
		expect(mainPrizeBeneficiaryAddress_).to.equal(bidder1.address);

		const mainEthPrizeAmountAfterClaim_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const balance = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr);
		const mainEthPrizeExpectedAmount_ = balance * 25n / 100n;
		expect(mainEthPrizeAmountAfterClaim_).to.equal(mainEthPrizeExpectedAmount_);

		// await expect(contracts_.cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(1)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidDonatedNftIndex");
		await expect(contracts_.prizesWallet.connect(bidder1).claimDonatedNft(1)).revertedWithCustomError(contracts_.prizesWallet, "InvalidDonatedNftIndex");

		// await contracts_.cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0);
		await contracts_.prizesWallet.connect(bidder1).claimDonatedNft(0);
		// await expect(contracts_.cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "DonatedNftAlreadyClaimed");
		await expect(contracts_.prizesWallet.connect(bidder1).claimDonatedNft(0)).revertedWithCustomError(contracts_.prizesWallet, "DonatedNftAlreadyClaimed");

		mintPrice = await contracts_.randomWalkNft.getMintPrice();
		await contracts_.randomWalkNft.connect(donor).mint({ value: mintPrice });
		mintPrice = await contracts_.randomWalkNft.getMintPrice();
		await contracts_.randomWalkNft.connect(donor).mint({ value: mintPrice });

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await contracts_.cosmicSignatureGameProxy.connect(bidder1).bidWithEth(-1n, "", {value: nextEthBidPrice_,});

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await contracts_.cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft(1, "hello", randomWalkNftAddr, 2, {value: nextEthPlusRandomWalkNftBidPrice_,});

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		mainEthPrizeAmountBeforeClaim_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(contracts_.cosmicSignatureGameProxy.connect(donor).claimMainPrize())
			.to.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(1, donor.address, mainEthPrizeAmountBeforeClaim_, 7);

		expect(await contracts_.randomWalkNft.balanceOf(donor.address)).to.equal(1);
		// await contracts_.cosmicSignatureGameProxy.connect(donor).claimDonatedNft(1);
		await contracts_.prizesWallet.connect(donor).claimDonatedNft(1);
		expect(await contracts_.randomWalkNft.balanceOf(donor.address)).to.equal(2);

		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).to.equal(2);
	});

	it("The DonatedNftClaimed event is correctly emitted", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, prizesWallet, prizesWalletAddr, randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [daoOwner, donor, bidder1, bidder2, bidder3,] = signers;

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(bidder1).mint({ value: mintPrice });
		// await randomWalkNft.connect(bidder1).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(bidder1).setApprovalForAll(prizesWalletAddr, true);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, {value: nextEthBidPrice_,});

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed");

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0))
		// 	.to.emit(cosmicSignatureGameProxy, "DonatedNftClaimedEvent")
		// 	.withArgs(0, 0, bidder1.address, randomWalkNftAddr, 0);

		// Now, attempt to claim the donated NFT (ID 0)
		// const beneficiaryForRound0 = await prizesWallet.mainPrizeBeneficiaryAddresses(0);
		// console.log("Beneficiary for round 0 BEFORE claim:", beneficiaryForRound0);
		// console.log("Expected beneficiary (bidder1):", bidder1.address);
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0))
			.to.emit(prizesWallet, "DonatedNftClaimed")
			.withArgs(0, bidder1.address, randomWalkNftAddr, 0, 0); // Assuming args are (donatedNftId, claimant, nftContract, tokenId, roundNum)
	});

	it("Shouldn't be possible to deploy PrizesWallet with zero-address-ed parameters", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {prizesWalletFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(prizesWalletFactory.deploy(hre.ethers.ZeroAddress /* , {gasLimit: 3000000} */)).revertedWithCustomError(prizesWalletFactory, "ZeroAddress");
	});
});
