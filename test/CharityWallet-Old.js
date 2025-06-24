"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CharityWallet-Old", function () {
	it("CharityWallet is sending the right amount", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, charityWallet, charityWalletAddr,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;
		
		let amountSent = hre.ethers.parseEther("9");
		let receiverAddress_ = await charityWallet.charityAddress();
		await expect(signer2.sendTransaction({to: charityWalletAddr, value: amountSent,})).not.reverted;
		let balanceAmountBefore = await hre.ethers.provider.getBalance(receiverAddress_);
		await charityWallet.>>>connect to a signer>>>.send();
		let balanceAmountAfter = await hre.ethers.provider.getBalance(receiverAddress_);
		expect(balanceAmountAfter).equal(balanceAmountBefore + amountSent);
	});

	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, ownerAcct, charityAcct, signers, charityWallet, charityWalletAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;
		// todo-0 This contract no longer exists.
		const brokenCharityFactory = await hre.ethers.getContractFactory("BrokenCharity", deployerAcct);
		const brokenCharity_ = await brokenCharityFactory.deploy();
		await brokenCharity_.waitForDeployment();
		const brokenCharityAddr = await brokenCharity_.getAddress();

		await expect(signer0.sendTransaction({to: charityWalletAddr, value: hre.ethers.parseEther("3"),})).not.reverted;
		await charityWallet.connect(ownerAcct).setCharityAddress(brokenCharityAddr);
		await expect(charityWallet.connect(signer1).send()).revertedWithCustomError(charityWallet, "FundTransferFailed");
		await charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress);
		await expect(charityWallet.connect(signer1).send()).revertedWithCustomError(charityWallet, "ZeroAddress");
		await charityWallet.connect(ownerAcct).setCharityAddress(charityAcct.address);
		// await expect(charityWallet.connect(signer1).send()).revertedWithCustomError(charityWallet, "ZeroBalance");
		await charityWallet.connect(signer1).send();
	});

	it("Unauthorized access attempts to restricted methods", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await expect(charityWallet.connect(signer1).setCharityAddress(signer1.address))
			.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");
	});

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
		expect(balance).equal(charityEthDonationAmount_ + cosmicSignatureNftStakingTotalEthRewardAmount_);

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

	// todo-1 We now allow a zero address in this case.
	it("Shouldn't be possible to set a zero-address for CharityWallet", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, charityWallet,} = await loadFixture(deployContractsForUnitTesting);

		// await expect(charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress)).revertedWithCustomError(charityWallet, "ZeroAddress");
		await charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress);
	});
});
