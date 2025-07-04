"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CharityWallet", function () {
	it("Normal operations", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.signers[2].sendTransaction({to: contracts_.charityWalletAddr, value: 6n,}))
			.emit(contracts_.charityWallet, "DonationReceived")
			.withArgs(contracts_.signers[2].address, 6n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(6n);

		await expect(contracts_.charityWallet.connect(contracts_.signers[3])["send(uint256)"](2n))
			.emit(contracts_.charityWallet, "FundsTransferredToCharity")
			.withArgs(contracts_.charityAcct.address, 2n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(6n - 2n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityAcct.address)).equal(2n);

		await expect(contracts_.charityWallet.connect(contracts_.signers[4])["send(uint256)"](0n))
			.emit(contracts_.charityWallet, "FundsTransferredToCharity")
			.withArgs(contracts_.charityAcct.address, 0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(6n - 2n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityAcct.address)).equal(2n);

		await expect(contracts_.charityWallet.connect(contracts_.signers[5])["send()"]())
			.emit(contracts_.charityWallet, "FundsTransferredToCharity")
			.withArgs(contracts_.charityAcct.address, 6n - 2n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityAcct.address)).equal(6n);

		await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).setCharityAddress(hre.ethers.ZeroAddress))
			.emit(contracts_.charityWallet, "CharityAddressChanged")
			.withArgs(hre.ethers.ZeroAddress);

		await expect(contracts_.charityWallet.connect(contracts_.signers[6])["send()"]())
			.revertedWithCustomError(contracts_.charityWallet, "ZeroAddress")
			.withArgs("Charity address not set.");
		await expect(contracts_.charityWallet.connect(contracts_.signers[7])["send(uint256)"](0n))
			.revertedWithCustomError(contracts_.charityWallet, "ZeroAddress")
			.withArgs("Charity address not set.");
	});

	it("ETH transfer to charity failure", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerAcct);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddr_ = await brokenEthReceiver_.getAddress();
		// await expect(brokenEthReceiver_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;
		
		await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).setCharityAddress(brokenEthReceiverAddr_))
			.emit(contracts_.charityWallet, "CharityAddressChanged")
			.withArgs(brokenEthReceiverAddr_);
		await expect(contracts_.signers[2].sendTransaction({to: contracts_.charityWalletAddr, value: 3n,}))
			.emit(contracts_.charityWallet, "DonationReceived")
			.withArgs(contracts_.signers[2].address, 3n);

		for ( let brokenEthReceiverEthDepositAcceptanceModeCode_ = 2n; brokenEthReceiverEthDepositAcceptanceModeCode_ >= 0n; -- brokenEthReceiverEthDepositAcceptanceModeCode_ ) {
			await expect(brokenEthReceiver_.connect(contracts_.signers[5]).setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_)).not.reverted;
			let transactionResponsePromise_ = contracts_.charityWallet.connect(contracts_.signers[1])["send()"]();
			let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
				await transactionResponsePromiseAssertion_
					.revertedWithCustomError(contracts_.charityWallet, "FundTransferFailed")
					.withArgs("ETH transfer to charity failed.", brokenEthReceiverAddr_, 3n);
			} else {
				await transactionResponsePromiseAssertion_
					.emit(contracts_.charityWallet, "FundsTransferredToCharity")
					.withArgs(brokenEthReceiverAddr_, 3n);
			}
		}
	});

	it("Unauthorized access to restricted methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.charityWallet.connect(contracts_.signers[1]).setCharityAddress(contracts_.signers[1].address))
			.revertedWithCustomError(contracts_.charityWallet, "OwnableUnauthorizedAccount")
			.withArgs(contracts_.signers[1].address);
		await expect(contracts_.charityWallet.connect(contracts_.signers[1]).setCharityAddress(contracts_.signers[2].address))
			.revertedWithCustomError(contracts_.charityWallet, "OwnableUnauthorizedAccount")
			.withArgs(contracts_.signers[1].address);
	});

	it("Reentries", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const maliciousCharityFactory_ = await hre.ethers.getContractFactory("MaliciousCharity", contracts_.deployerAcct);
		const maliciousCharity_ = await maliciousCharityFactory_.deploy(contracts_.charityWalletAddr);
		await maliciousCharity_.waitForDeployment();
		const maliciousCharityAddr_ = await maliciousCharity_.getAddress();
		// await expect(maliciousCharity_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;
		
		await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).setCharityAddress(maliciousCharityAddr_))
			.emit(contracts_.charityWallet, "CharityAddressChanged")
			.withArgs(maliciousCharityAddr_);

		for ( let maliciousCharityModeCode_ = 3n; maliciousCharityModeCode_ >= 0n; -- maliciousCharityModeCode_ ) {
			await expect(maliciousCharity_.connect(contracts_.signers[5]).setModeCode(maliciousCharityModeCode_)).not.reverted;
			for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
				let transactionResponsePromise_;
				if (counter_ <= 0) {
					transactionResponsePromise_ = contracts_.charityWallet.connect(contracts_.signers[1])["send()"]();
				} else {
					transactionResponsePromise_ = contracts_.charityWallet.connect(contracts_.signers[1])["send(uint256)"](0n);
				}
				let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (maliciousCharityModeCode_ > 0n) {
					await transactionResponsePromiseAssertion_
						.revertedWithCustomError(contracts_.charityWallet, "FundTransferFailed")
						.withArgs("ETH transfer to charity failed.", maliciousCharityAddr_, 0n);
				} else {
					await transactionResponsePromiseAssertion_
						.emit(contracts_.charityWallet, "FundsTransferredToCharity")
						.withArgs(maliciousCharityAddr_, 0n);
				}
			}
		}
	});
});
