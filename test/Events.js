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
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", {value: nextEthBidPrice_,});
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
});
