"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Events", function () {
	it("Shall emit the correct events in the CharityWallet contract", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, charityWallet, charityWalletAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [daoOwner, donor, bidder1, bidder2, bidder3,] = signers;

		// DonationReceived
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		let cosmicSignatureNftStakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(charityWallet, "DonationReceived")
			.withArgs(cosmicSignatureGameProxyAddr, charityEthDonationAmount_ + cosmicSignatureNftStakingTotalEthRewardAmount_);
		const balance = await hre.ethers.provider.getBalance(charityWalletAddr);
		expect(balance).to.equal(charityEthDonationAmount_ + cosmicSignatureNftStakingTotalEthRewardAmount_);

		// CharityAddressChanged
		await expect(charityWallet.connect(ownerAcct).setCharityAddress(bidder3.address))
			.to.emit(charityWallet, "CharityAddressChanged")
			.withArgs(bidder3.address);

		// // DonationSent
		// await expect(charityWallet.connect(bidder2).send())
		// 	.to.emit(charityWallet, "DonationSent")
		// 	.withArgs(bidder3.address, balance);

		// FundsTransferredToCharity
		await expect(charityWallet.connect(bidder2).send())
			.to.emit(charityWallet, "FundsTransferredToCharity")
			.withArgs(bidder3.address, balance);
	});

	it("Shall emit MainPrizeClaimed and update main prize beneficiary on successful main prize claim", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, prizesWallet, prizesWalletAddr, randomWalkNft, randomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [daoOwner, donor, bidder1, bidder2, bidder3,] = signers;

		// ToDo-202411202-1 applies.
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		// await randeomWalkNFT.connect(donor).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(donor).setApprovalForAll(prizesWalletAddr, true);

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, { value: nextEthBidPrice_ });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "DonatedNftClaimDenied");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(prizesWallet, "DonatedNftClaimDenied");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();

		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0, bidder1.address, mainEthPrizeAmountBeforeClaim_, 0);

		// const mainPrizeBeneficiaryAddress_ = await cosmicSignatureGameProxy.winners(0);
		const mainPrizeBeneficiaryAddress_ = await prizesWallet.mainPrizeBeneficiaryAddresses(0);
		expect(mainPrizeBeneficiaryAddress_).to.equal(bidder1.address);

		const mainEthPrizeAmountAfterClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const balance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr);
		const mainEthPrizeExpectedAmount_ = balance * 25n / 100n;
		expect(mainEthPrizeAmountAfterClaim_).to.equal(mainEthPrizeExpectedAmount_);

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InvalidDonatedNftIndex");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(prizesWallet, "InvalidDonatedNftIndex");

		// await cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0);
		await prizesWallet.connect(bidder1).claimDonatedNft(0);
		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "DonatedNftAlreadyClaimed");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(prizesWallet, "DonatedNftAlreadyClaimed");

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft(1, "hello", randomWalkNftAddr, 2, { value: nextEthPlusRandomWalkNftBidPrice_ });

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(cosmicSignatureGameProxy.connect(donor).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(1, donor.address, mainEthPrizeAmountBeforeClaim_, 7);

		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(1);
		// await cosmicSignatureGameProxy.connect(donor).claimDonatedNft(1);
		await prizesWallet.connect(donor).claimDonatedNft(1);
		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicSignatureGameProxy.roundNum()).to.equal(2);
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
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEthAndDonateNft((-1), "", randomWalkNftAddr, 0, { value: nextEthBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
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
});
