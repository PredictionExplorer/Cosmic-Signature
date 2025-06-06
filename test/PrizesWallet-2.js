// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting, assertEvent } = require("../src/ContractUnitTestingHelpers.js");

// #endregion
// #region

describe("PrizesWallet-2", function () {
	// #region

	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.prizesWalletFactory.deploy(hre.ethers.ZeroAddress)).revertedWithCustomError(contracts_.prizesWalletFactory, "ZeroAddress");
	});

	// #endregion
	// #region

	it("Setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		{
			const newValue_ = 999_999n + generateRandomUInt256() % 3n;
			await expect(contracts_.prizesWallet.connect(contracts_.signers[1]).setTimeoutDurationToWithdrawPrizes(newValue_))
				.revertedWithCustomError(contracts_.prizesWallet, "OwnableUnauthorizedAccount");
			await expect(contracts_.prizesWallet.connect(contracts_.ownerAcct).setTimeoutDurationToWithdrawPrizes(newValue_))
				.emit(contracts_.prizesWallet, "TimeoutDurationToWithdrawPrizesChanged")
				.withArgs(newValue_);
			expect(await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes()).equal(newValue_);
		}
	});

	// #endregion
	// #region

	// [Comment-202506192]
	// The test near Comment-202506189 and/or other tests already test some of this functionality, but not all its branches.
	// This test is intended to test what others don't.
	// [/Comment-202506192]
	// todo-1 +++ Recheck that the above comment applies.
	it("The registerRoundEndAndDepositEthMany, withdrawEverything, donateToken, donateNft methods", async function () {
		// #region

		let transactionResponseFuture_;
		let transactionResponse_;
		let transactionReceipt_;

		// #endregion
		// #region

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const tokens_ = [];
		const tokensAddr_ = [];
		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			const token_ = await contracts_.cosmicSignatureTokenFactory.deploy(contracts_.signers[10].address);
			await token_.waitForDeployment();
			tokens_.push(token_);
			const tokenAddr_ = await token_.getAddress();
			tokensAddr_.push(tokenAddr_);
		}

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddr_ = await newPrizesWallet_.getAddress();
		transactionResponseFuture_ = newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address);
		await expect(transactionResponseFuture_).not.reverted;

		// #endregion
		// #region
		
		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			transactionResponseFuture_ = tokens_[counter_].connect(contracts_.signers[counter_]).approve(newPrizesWalletAddr_, (1n << 256n) - 1n);
			await expect(transactionResponseFuture_).not.reverted;
			transactionResponseFuture_ = tokens_[counter_].connect(contracts_.signers[10]).mint(contracts_.signers[counter_].address, 10n ** (18n + 1n));
			await expect(transactionResponseFuture_).not.reverted;
			transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(0n, contracts_.signers[counter_].address, tokensAddr_[counter_], BigInt(1 << counter_) * 10n ** 18n);
			await expect(transactionResponseFuture_).not.reverted;

			transactionResponseFuture_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(newPrizesWalletAddr_, true);
			await expect(transactionResponseFuture_).not.reverted;
			transactionResponseFuture_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),});
			await expect(transactionResponseFuture_).not.reverted;
			const nftId_ = BigInt(counter_);
			transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[10]).donateNft(0n, contracts_.signers[counter_].address, contracts_.randomWalkNftAddr, nftId_);
			await expect(transactionResponseFuture_).not.reverted;
		}

		// #endregion
		// #region

		const ethDeposits_ = [
			[contracts_.signers[0].address, 1n * 10n ** (18n - 3n),],
			[contracts_.signers[1].address, 2n * 10n ** (18n - 3n),],
			[contracts_.signers[2].address, 4n * 10n ** (18n - 3n),],
			[contracts_.signers[3].address, 8n * 10n ** (18n - 3n),],
		];
		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[10]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, ethDeposits_, {value: (1n + 2n + 4n + 8n) * 10n ** (18n - 3n),});
		transactionResponse_ = await transactionResponseFuture_;
		transactionReceipt_ = await transactionResponse_.wait();
		expect(transactionReceipt_.logs.length).equal(4);
		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			assertEvent(
				transactionReceipt_.logs[3 - counter_],
				newPrizesWallet_,
				"EthReceived",
				[0n, contracts_.signers[counter_].address, BigInt(1 << counter_) * 10n ** (18n - 3n),]
			);
		}

		// #endregion
		// #region

		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything(false, [], []);
		transactionResponse_ = await transactionResponseFuture_;
		transactionReceipt_ = await transactionResponse_.wait();
		expect(transactionReceipt_.logs.length).equal(0);

		// #endregion
		// #region

		const donatedTokensToClaim_ = [
			[0n, tokensAddr_[3],],
			[0n, tokensAddr_[1],],
		];
		const donatedNftIndexes_ = [3n, 0n,];
		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything(true, donatedTokensToClaim_, donatedNftIndexes_);
		transactionResponse_ = await transactionResponseFuture_;
		transactionReceipt_ = await transactionResponse_.wait();
		expect(transactionReceipt_.logs.length).equal(9);
		assertEvent(
			transactionReceipt_.logs[0],
			newPrizesWallet_,
			"EthWithdrawn",
			[contracts_.signers[2].address, contracts_.signers[2].address, (1n << 2n) * 10n ** (18n - 3n),]
		);
		assertEvent(
			transactionReceipt_.logs[1],
			newPrizesWallet_,
			"DonatedTokenClaimed",
			[0n, contracts_.signers[2].address, tokensAddr_[1], (1n << 1n) * 10n ** 18n,]
		);
		expect(tokens_[1].interface.parseLog(transactionReceipt_.logs[2]).name).equal("Transfer");
		assertEvent(
			transactionReceipt_.logs[3],
			newPrizesWallet_,
			"DonatedTokenClaimed",
			[0n, contracts_.signers[2].address, tokensAddr_[3], (1n << 3n) * 10n ** 18n,]
		);
		expect(tokens_[3].interface.parseLog(transactionReceipt_.logs[4]).name).equal("Transfer");
		assertEvent(
			transactionReceipt_.logs[5],
			newPrizesWallet_,
			"DonatedNftClaimed",
			[0n, contracts_.signers[2].address, contracts_.randomWalkNftAddr, 0n, 0n]
		);
		expect(contracts_.randomWalkNft.interface.parseLog(transactionReceipt_.logs[6]).name).equal("Transfer");
		assertEvent(
			transactionReceipt_.logs[7],
			newPrizesWallet_,
			"DonatedNftClaimed",
			[0n, contracts_.signers[2].address, contracts_.randomWalkNftAddr, 3n, 3n]
		);
		expect(contracts_.randomWalkNft.interface.parseLog(transactionReceipt_.logs[8]).name).equal("Transfer");

		// #endregion
	});

	// #endregion
	// #region

	// Comment-202506192 applies.
	// todo-1 +++ Recheck that the above comment applies.
	it("The withdrawEth methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).not.reverted;
		const timeoutDurationToWithdrawPrizes_ = await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes();
		await hre.ethers.provider.send("evm_increaseTime", [Number(timeoutDurationToWithdrawPrizes_),]);
		// await hre.ethers.provider.send("evm_mine");

		for ( let ethDepositAcceptanceModeCode_ = 2n; ethDepositAcceptanceModeCode_ >= 0n; -- ethDepositAcceptanceModeCode_ ) {
			await expect(bidderContract_.setEthDepositAcceptanceModeCode(ethDepositAcceptanceModeCode_)).not.reverted;
			for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
				const prizeWinnerAddress_ = (counter_ <= 0) ? bidderContractAddr_ : contracts_.signers[1].address;
				const prizeWinnerEthBalanceAmount_ = (await contracts_.prizesWallet["getEthBalanceInfo(address)"](prizeWinnerAddress_))[1];
				// console.info(hre.ethers.formatEther(prizeWinnerEthBalanceAmount_));
				const transactionResponseFuture_ =
					(counter_ <= 0) ?
					bidderContract_.connect(contracts_.signers[4])["doWithdrawEth"]() :
					bidderContract_.connect(contracts_.signers[4])["doWithdrawEth(address)"](contracts_.signers[1].address);
				if (ethDepositAcceptanceModeCode_ > 0n) {
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.prizesWallet, "FundTransferFailed")
						.withArgs("ETH withdrawal failed.", bidderContractAddr_, prizeWinnerEthBalanceAmount_);
				} else {
					await expect(transactionResponseFuture_)
						.emit(contracts_.prizesWallet, "EthWithdrawn")
						.withArgs(prizeWinnerAddress_, bidderContractAddr_, prizeWinnerEthBalanceAmount_);
				}
			}
		}
	});

	// #endregion
	// #region

	// Comment-202506192 applies.
	// todo-1 +++ Recheck that the above comment applies.
	it("The donateNft method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		let transactionResponseFuture_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: 10n ** (18n - 2n),});
		await expect(transactionResponseFuture_).not.reverted;
		let nftId_ = 0n;
		transactionResponseFuture_ = contracts_.prizesWallet.connect(contracts_.signers[1]).donateNft(0n, contracts_.signers[1].address, contracts_.randomWalkNftAddr, nftId_);
		await expect(transactionResponseFuture_)
			.revertedWithCustomError(contracts_.prizesWallet, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);
		transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", hre.ethers.ZeroAddress, nftId_, {value: 10n ** (18n - 2n),});
		await expect(transactionResponseFuture_).revertedWithoutReason();
		for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
			transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", contracts_.randomWalkNftAddr, nftId_, {value: 10n ** (18n - 2n),});
			if (counter_ <= 0) {
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.randomWalkNft, "ERC721InsufficientApproval");
				transactionResponseFuture_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.prizesWalletAddr, true);
			}
			await expect(transactionResponseFuture_).not.reverted;
		}
	});

	// #endregion
	// #region

	// Comment-202506192 applies.
	// todo-1 +++ Recheck that the above comment applies.
	it("The claimManyDonatedNfts method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const prizesWalletDonatedNftClaimedTopicHash_ = contracts_.prizesWallet.interface.getEvent("DonatedNftClaimed").topicHash;

		for ( let counter_ = 0; counter_ <= 2; ++ counter_ ) {
			await expect( contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(contracts_.prizesWalletAddr, true)).not.reverted;
			await expect( contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),})).not.reverted;
			const nftId_ = BigInt(counter_);
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[counter_]).bidWithEthAndDonateNft(-1n, "", contracts_.randomWalkNftAddr, nftId_, {value: nextEthBidPrice_,}))
				.emit(contracts_.prizesWallet, "NftDonated")
				.withArgs(0n, contracts_.signers[counter_].address, contracts_.randomWalkNftAddr, nftId_, BigInt(counter_));
		}

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).not.reverted;

		let transactionResponse_ = await contracts_.prizesWallet.connect(contracts_.signers[2]).claimManyDonatedNfts([0n, 1n, 2n]);
		let transactionReceipt_ = await transactionResponse_.wait();
		let prizesWalletDonatedNftClaimedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(prizesWalletDonatedNftClaimedTopicHash_) >= 0));
		expect(prizesWalletDonatedNftClaimedLogs_.length).equal(3);
		for ( let counter_ = 0; counter_ <= 2; ++ counter_ ) {
			const prizesWalletDonatedNftClaimedParsedLog_ = /*contracts_.prizesWallet.interface.parseLog*/(prizesWalletDonatedNftClaimedLogs_[counter_]);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.roundNum).equal(0n);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.beneficiaryAddress).equal(contracts_.signers[2].address);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.nftAddress).equal(contracts_.randomWalkNftAddr);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.nftId).equal(BigInt(2 - counter_));
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.index).equal(BigInt(2 - counter_));
		}
	});

	// #endregion
	// #region

	// Comment-202506192 applies.
	// todo-1 +++ Recheck that the above comment applies.
	it("Incorrect or forbidden operations", async function () {
		let transactionResponseFuture_;
		// let transactionResponse_;
		// let transactionReceipt_;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		// const newPrizesWalletAddr_ = await newPrizesWallet_.getAddress();
		transactionResponseFuture_ = newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address);
		await expect(transactionResponseFuture_).not.reverted;

		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, [], {value: 0n,});
		await expect(transactionResponseFuture_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEnd(0n, contracts_.signers[2].address);
		await expect(transactionResponseFuture_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[1]).depositEth(0n, contracts_.signers[2].address, {value: 0n,});
		await expect(transactionResponseFuture_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[1]).donateToken(0n, contracts_.signers[2].address, contracts_.cosmicSignatureTokenAddr, 0n);
		await expect(transactionResponseFuture_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);
		transactionResponseFuture_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(0n, contracts_.signers[2].address, hre.ethers.ZeroAddress, 0n);
		await expect(transactionResponseFuture_).revertedWithCustomError(newPrizesWallet_, "SafeERC20FailedOperation");
	});

	// #endregion
});

// #endregion
