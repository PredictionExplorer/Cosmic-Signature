// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { generateRandomUInt32, generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForTesting, assertEvent } = require("../../src/ContractTestingHelpers.js");

// #endregion
// #region

describe("PrizesWallet-2", function () {
	// #region

	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.prizesWalletFactory.deploy(hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.prizesWalletFactory, "ZeroAddress");
	});

	// #endregion
	// #region

	it("Contract parameter setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		{
			const newValue_ = 999_999n + generateRandomUInt256() % 3n;
			await expect(contracts_.prizesWallet.connect(contracts_.signers[1]).setTimeoutDurationToWithdrawPrizes(newValue_))
				.revertedWithCustomError(contracts_.prizesWallet, "OwnableUnauthorizedAccount");
			await expect(contracts_.prizesWallet.connect(contracts_.ownerSigner).setTimeoutDurationToWithdrawPrizes(newValue_))
				.emit(contracts_.prizesWallet, "TimeoutDurationToWithdrawPrizesChanged")
				.withArgs(newValue_);
			expect(await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes()).equal(newValue_);
		}
	});

	// #endregion
	// #region

	it("The registerRoundEndAndDepositEthMany, withdrawEverything, donateToken, claimDonatedToken, donateNft methods", async function () {
		// #region

		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_;
		/** @type {import("hardhat").ethers.TransactionReceipt} */
		let transactionReceipt_;

		// #endregion
		// #region

		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const tokens_ = [];
		const tokensAddress_ = [];
		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			const token_ = await contracts_.cosmicSignatureTokenFactory.deploy(contracts_.signers[10].address);
			await token_.waitForDeployment();
			tokens_.push(token_);
			const tokenAddress_ = await token_.getAddress();
			tokensAddress_.push(tokenAddress_);
			// await waitForTransactionReceipt(token_.transferOwnership(contracts_.ownerSigner.address));
		}

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddress_ = await newPrizesWallet_.getAddress();
		transactionResponsePromise_ = newPrizesWallet_.transferOwnership(contracts_.ownerSigner.address);
		await waitForTransactionReceipt(transactionResponsePromise_);

		// #endregion
		// #region

		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			transactionResponsePromise_ = tokens_[counter_].connect(contracts_.signers[counter_]).approve(newPrizesWalletAddress_, (1n << 256n) - 1n);
			await waitForTransactionReceipt(transactionResponsePromise_);
			transactionResponsePromise_ = tokens_[counter_].connect(contracts_.signers[10]).mint(contracts_.signers[counter_].address, 10n ** (18n + 1n));
			await waitForTransactionReceipt(transactionResponsePromise_);
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(0n, contracts_.signers[counter_].address, tokensAddress_[counter_], BigInt(1 << counter_) * 10n ** 18n);
			await waitForTransactionReceipt(transactionResponsePromise_);

			transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(newPrizesWalletAddress_, true);
			await waitForTransactionReceipt(transactionResponsePromise_);
			transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),});
			await waitForTransactionReceipt(transactionResponsePromise_);
			const nftId_ = BigInt(counter_);
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateNft(0n, contracts_.signers[counter_].address, contracts_.randomWalkNftAddress, nftId_);
			await waitForTransactionReceipt(transactionResponsePromise_);
		}

		// #endregion
		// #region

		{
			const ethDeposits_ = [
				[contracts_.signers[0].address, 1n * 10n ** (18n - 3n),],
				[contracts_.signers[1].address, 2n * 10n ** (18n - 3n),],
				[contracts_.signers[2].address, 4n * 10n ** (18n - 3n),],
				[contracts_.signers[3].address, 8n * 10n ** (18n - 3n),],
			];
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, ethDeposits_, {value: (1n + 2n + 4n + 8n) * 10n ** (18n - 3n),});
			transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			expect(transactionReceipt_.logs.length).equal(4);
			for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
				assertEvent(
					transactionReceipt_.logs[3 - counter_],
					newPrizesWallet_,
					"EthReceived",
					[0n, BigInt(counter_), contracts_.signers[counter_].address, BigInt(1 << counter_) * 10n ** (18n - 3n),]
				);
			}
		}

		// #endregion
		// #region

		{
			const donatedTokenHolderAddress_ = await newPrizesWallet_.donatedTokens(0n);
			const donatedTokenHolder_ = await hre.ethers.getContractAt("DonatedTokenHolder", donatedTokenHolderAddress_, contracts_.signers[6]);
			transactionResponsePromise_ = donatedTokenHolder_/*.connect(...)*/.authorizeDeployerAsMyTokenSpender(tokensAddress_[0]);
			await expect(transactionResponsePromise_)
				.revertedWithCustomError(donatedTokenHolder_, "UnauthorizedCaller")
				.withArgs("Deployer only.", contracts_.signers[6].address);

			let donatedTokenAmountToClaim_ = (1n << 2n) * 10n ** 18n - 4n;
			let donatedTokenTotalAmountClamed_ = 0n;
			for ( let counter_ = 3; ; -- counter_ ) {
				expect(await newPrizesWallet_.getDonatedTokenBalanceAmount(0n, tokensAddress_[2])).equal((1n << 2n) * 10n ** 18n - donatedTokenTotalAmountClamed_);
				expect(await tokens_[2].balanceOf(contracts_.signers[2].address)).equal((10n ** (18n + 1n) - (1n << 2n) * 10n ** 18n) + donatedTokenTotalAmountClamed_);
				transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[2]).claimDonatedToken(0n, tokensAddress_[2], donatedTokenAmountToClaim_);
				let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (counter_ == 1) {
					await transactionResponsePromiseAssertion_
						.revertedWithCustomError(tokens_[2], "ERC20InsufficientBalance")
						.withArgs(donatedTokenHolderAddress_, 1n, 2n);
				} else {
					await transactionResponsePromiseAssertion_
						.emit(newPrizesWallet_, "DonatedTokenClaimed")
						.withArgs(0n, contracts_.signers[2].address, tokensAddress_[2], donatedTokenAmountToClaim_)
						.and.emit(tokens_[2], "Transfer")
						.withArgs(donatedTokenHolderAddress_, contracts_.signers[2].address, donatedTokenAmountToClaim_);
					donatedTokenTotalAmountClamed_ += donatedTokenAmountToClaim_;
				}
				if (counter_ <= 0) {
					break;
				}
				donatedTokenAmountToClaim_ = BigInt(counter_);
			}
			expect(donatedTokenTotalAmountClamed_).equal((1n << 2n) * 10n ** 18n);
		}

		// #endregion
		// #region

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything([], [], []);
		transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		expect(transactionReceipt_.logs.length).equal(0);

		// #endregion
		// #region

		{
			const ethPrizeRoundNums_ = [0n,];
			const donatedTokensToClaim_ = [
				[0n, tokensAddress_[3], 0n,],
				[0n, tokensAddress_[1], (1n << 1n) * 10n ** 18n,],
			];
			const donatedNftIndexes_ = [3n, 0n,];
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything(ethPrizeRoundNums_, donatedTokensToClaim_, donatedNftIndexes_);
			transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			expect(transactionReceipt_.logs.length).equal(9);
			assertEvent(
				transactionReceipt_.logs[0],
				newPrizesWallet_,
				"EthWithdrawn",
				[0n, contracts_.signers[2].address, contracts_.signers[2].address, (1n << 2n) * 10n ** (18n - 3n),]
			);
			assertEvent(
				transactionReceipt_.logs[1],
				newPrizesWallet_,
				"DonatedTokenClaimed",
				[0n, contracts_.signers[2].address, tokensAddress_[1], (1n << 1n) * 10n ** 18n,]
			);
			expect(tokens_[1].interface.parseLog(transactionReceipt_.logs[2]).name).equal("Transfer");
			assertEvent(
				transactionReceipt_.logs[3],
				newPrizesWallet_,
				"DonatedTokenClaimed",
				[0n, contracts_.signers[2].address, tokensAddress_[3], (1n << 3n) * 10n ** 18n,]
			);
			expect(tokens_[3].interface.parseLog(transactionReceipt_.logs[4]).name).equal("Transfer");
			assertEvent(
				transactionReceipt_.logs[5],
				newPrizesWallet_,
				"DonatedNftClaimed",
				[0n, contracts_.signers[2].address, contracts_.randomWalkNftAddress, 0n, 0n]
			);
			expect(contracts_.randomWalkNft.interface.parseLog(transactionReceipt_.logs[6]).name).equal("Transfer");
			assertEvent(
				transactionReceipt_.logs[7],
				newPrizesWallet_,
				"DonatedNftClaimed",
				[0n, contracts_.signers[2].address, contracts_.randomWalkNftAddress, 3n, 3n]
			);
			expect(contracts_.randomWalkNft.interface.parseLog(transactionReceipt_.logs[8]).name).equal("Transfer");
		}

		// #endregion
	});

	// #endregion
	// #region

	it("The withdrawEth and withdrawEthMany methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		for ( let roundNum_ = 0n; roundNum_ <= 2n; ++ roundNum_ ) {
			await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 2n);
			/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			let transactionResponsePromise_ =
				(roundNum_ != 1n) ?
				bidderContract_.connect(contracts_.signers[4]).doBidWithEth({value: 10n ** (18n - 2n),}) :
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** (18n - 2n),});
			await waitForTransactionReceipt(transactionResponsePromise_);
			let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			transactionResponsePromise_ =
				(roundNum_ != 1n) ?
				bidderContract_.connect(contracts_.signers[5]).doClaimMainPrize() :
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize();
			await waitForTransactionReceipt(transactionResponsePromise_);
			const prizeWinnerAddress_ = (roundNum_ != 1n) ? bidderContractAddress_ : contracts_.signers[1].address;
			const prizeWinnerEthBalanceAmount_ = await contracts_.prizesWallet["getEthBalanceAmount(uint256,address)"](roundNum_, prizeWinnerAddress_);
			expect(prizeWinnerEthBalanceAmount_).greaterThan(0n);
			if (roundNum_ == 1n) {
				const timeoutDurationToWithdrawPrizes_ = await contracts_.prizesWallet.timeoutDurationToWithdrawPrizes();
				await hre.ethers.provider.send("evm_increaseTime", [Number(timeoutDurationToWithdrawPrizes_),]);
				// await hre.ethers.provider.send("evm_mine");
			}
			for ( let brokenEthReceiverEthDepositAcceptanceModeCode_ = 2n; brokenEthReceiverEthDepositAcceptanceModeCode_ >= 0n; -- brokenEthReceiverEthDepositAcceptanceModeCode_ ) {
				// console.info(`202511164 ${roundNum_} ${brokenEthReceiverEthDepositAcceptanceModeCode_}`);
				transactionResponsePromise_ = bidderContract_.setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_);
				await waitForTransactionReceipt(transactionResponsePromise_);
				switch (roundNum_) {
					case 0n:
						transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[6])["doWithdrawEth(uint256)"](roundNum_);
						break;
					case 1n:
						transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[7])["doWithdrawEth(uint256,address)"](roundNum_, prizeWinnerAddress_);
						break;
					default:
						transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[8]).doWithdrawEthMany([roundNum_]);
						break;
				}
				let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
					await transactionResponsePromiseAssertion_
						.revertedWithCustomError(contracts_.prizesWallet, "FundTransferFailed")
						.withArgs("ETH withdrawal failed.", bidderContractAddress_, prizeWinnerEthBalanceAmount_);
				} else {
					await transactionResponsePromiseAssertion_
						.emit(contracts_.prizesWallet, "EthWithdrawn")
						.withArgs(roundNum_, prizeWinnerAddress_, bidderContractAddress_, prizeWinnerEthBalanceAmount_);
				}
			}
		}
	});

	// #endregion
	// #region

	it("The donateNft method", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: 10n ** (18n - 2n),});
		await waitForTransactionReceipt(transactionResponsePromise_);
		let nftId_ = 0n;
		transactionResponsePromise_ = contracts_.prizesWallet.connect(contracts_.signers[1]).donateNft(0n, contracts_.signers[1].address, contracts_.randomWalkNftAddress, nftId_);
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(contracts_.prizesWallet, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);
		transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", hre.ethers.ZeroAddress, nftId_, {value: 10n ** (18n - 2n),});
		await expect(transactionResponsePromise_).revertedWithoutReason();
		for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
			transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", contracts_.randomWalkNftAddress, nftId_, {value: 10n ** (18n - 2n),});
			if (counter_ <= 0) {
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.randomWalkNft, "ERC721InsufficientApproval");
				transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.prizesWalletAddress, true);
			}
			await waitForTransactionReceipt(transactionResponsePromise_);
		}
	});

	// #endregion
	// #region

	it("The claimManyDonatedNfts method", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const prizesWalletDonatedNftClaimedTopicHash_ = contracts_.prizesWallet.interface.getEvent("DonatedNftClaimed").topicHash;

		for ( let counter_ = 0; counter_ <= 2; ++ counter_ ) {
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(contracts_.prizesWalletAddress, true));
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),}));
			const nftId_ = BigInt(counter_);
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[counter_]).bidWithEthAndDonateNft(-1n, "", contracts_.randomWalkNftAddress, nftId_, {value: nextEthBidPrice_,}))
				.emit(contracts_.prizesWallet, "NftDonated")
				.withArgs(0n, contracts_.signers[counter_].address, contracts_.randomWalkNftAddress, nftId_, BigInt(counter_));
		}

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize());

		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.prizesWallet.connect(contracts_.signers[2]).claimManyDonatedNfts([0n, 1n, 2n]);
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		let prizesWalletDonatedNftClaimedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(prizesWalletDonatedNftClaimedTopicHash_) >= 0));
		expect(prizesWalletDonatedNftClaimedLogs_.length).equal(3);
		for ( let counter_ = 0; counter_ <= 2; ++ counter_ ) {
			const prizesWalletDonatedNftClaimedParsedLog_ = contracts_.prizesWallet.interface.parseLog(prizesWalletDonatedNftClaimedLogs_[counter_]);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.roundNum).equal(0n);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.beneficiaryAddress).equal(contracts_.signers[2].address);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.nftAddress).equal(contracts_.randomWalkNftAddress);
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.nftId).equal(BigInt(2 - counter_));
			expect(prizesWalletDonatedNftClaimedParsedLog_.args.index).equal(BigInt(2 - counter_));
		}
	});

	// #endregion
	// #region

	it("Incorrect or forbidden operations", async function () {
		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_;

		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		// const newPrizesWalletAddress_ = await newPrizesWallet_.getAddress();
		transactionResponsePromise_ = newPrizesWallet_.transferOwnership(contracts_.ownerSigner.address);
		await waitForTransactionReceipt(transactionResponsePromise_);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, [], {value: 0n,});
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEnd(0n, contracts_.signers[2].address);
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).depositEth(0n, 0n, contracts_.signers[2].address, {value: 0n,});
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).donateToken(0n, contracts_.signers[2].address, contracts_.cosmicSignatureTokenAddress, 0n);
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);
		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(0n, contracts_.signers[2].address, hre.ethers.ZeroAddress, 0n);
		await expect(transactionResponsePromise_).revertedWithCustomError(newPrizesWallet_, "SafeERC20FailedOperation");
	});

	// #endregion
	// #region

	// Comment-202507055 applies.
	it("Reentries", async function () {
		// #region

		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);
	
		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddress_ = await newPrizesWallet_.getAddress();
		await waitForTransactionReceipt(newPrizesWallet_.transferOwnership(contracts_.ownerSigner.address));

		const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", contracts_.deployerSigner);
		const maliciousToken_ = await maliciousTokenFactory_.deploy(newPrizesWalletAddress_, hre.ethers.ZeroAddress);
		await maliciousToken_.waitForDeployment();
		const maliciousTokenAddress_ = await maliciousToken_.getAddress();

		const maliciousPrizeWinnerFactory_ = await hre.ethers.getContractFactory("MaliciousPrizeWinner", contracts_.deployerSigner);
		const maliciousPrizeWinner_ = await maliciousPrizeWinnerFactory_.deploy(newPrizesWalletAddress_, hre.ethers.ZeroAddress);
		await maliciousPrizeWinner_.waitForDeployment();
		const maliciousPrizeWinnerAddress_ = await maliciousPrizeWinner_.getAddress();

		// #endregion
		// #region

		{
			const ethDonationAmount_ = 10n ** 18n;
			await waitForTransactionReceipt(contracts_.signers[0].sendTransaction({to: maliciousTokenAddress_, value: ethDonationAmount_,}));
			await waitForTransactionReceipt(contracts_.signers[0].sendTransaction({to: maliciousPrizeWinnerAddress_, value: ethDonationAmount_,}));
		}

		const timeoutDurationToWithdrawPrizes_ = await newPrizesWallet_.timeoutDurationToWithdrawPrizes();
		let roundNum_ = 0n;
		let nextDonatedNftToDonateIndex_ = 0n;
		let nextDonatedNftToClaimIndex_ = 0n;
		const donatedNftRoundNums_ = [];

		// #endregion
		// #region

		for ( let iterationCounter_ = 1; iterationCounter_ <= 250; ++ iterationCounter_ ) {
			// #region

			let randomNumber_ = generateRandomUInt32();

			// Comment-202507062 applies.
			const maliciousActorModeCode_ = BigInt(randomNumber_ % (13 * 2) + 101);

			await waitForTransactionReceipt(maliciousToken_.connect(contracts_.signers[0]).setModeCode(maliciousActorModeCode_));
			await waitForTransactionReceipt(maliciousPrizeWinner_.connect(contracts_.signers[0]).setModeCode(maliciousActorModeCode_));
			let nextDonatedNftToDonateIndexIncrement_ = 0n;
			let nextDonatedNftToClaimIndexIncrement_ = 0n;
			let transactionWillNotFailDueToReentry_ = false;
			// console.info("202507179");

			// #endregion
			// #region

			for (;;) {
				// #region

				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				let transactionResponsePromise_;
				randomNumber_ = generateRandomUInt32();
				const choiceCode_ = randomNumber_ % 15;
				// console.info(`202507069 ${choiceCode_} ${maliciousActorModeCode_}`);

				// #endregion
				// #region

				switch (choiceCode_) {
					case 0: {
						// console.info("202507072");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).registerRoundEndAndDepositEthMany(roundNum_, maliciousPrizeWinnerAddress_, [[maliciousPrizeWinnerAddress_, 1n,]], {value: 1n,});
						++ roundNum_;
						transactionWillNotFailDueToReentry_ = true;
						break;
					}
					case 1:
					case 2:
					case 3: {
						const ethPrizeRoundNums_ = [];
						const donatedTokensToClaim_ = [];
						const donatedNftIndexes_ = [];
						switch (choiceCode_) {
							case 1: {
								// console.info("202507073");
								ethPrizeRoundNums_.push((roundNum_ <= 0n) ? 0n : (roundNum_ - 1n));
								break;
							}
							case 2: {
								if (roundNum_ <= 0n) {
									// console.info("202507074");
									transactionWillNotFailDueToReentry_ = true;
								} else {
									// console.info("202507075");
									donatedTokensToClaim_.push([roundNum_ - 1n, maliciousTokenAddress_, 1n,]);
								}
								break;
							}
							default: {
								if (nextDonatedNftToClaimIndex_ < nextDonatedNftToDonateIndex_ && donatedNftRoundNums_[Number(nextDonatedNftToClaimIndex_)] < roundNum_) {
									// console.info("202507076");
									donatedNftIndexes_.push(nextDonatedNftToClaimIndex_);
									nextDonatedNftToClaimIndexIncrement_ = 1n;
								} else {
									// console.info("202507077");
									transactionWillNotFailDueToReentry_ = true;
								}
								break;
							}
						}
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doWithdrawEverything(ethPrizeRoundNums_, donatedTokensToClaim_, donatedNftIndexes_);
						break;
					}
					case 4: {
						// console.info("202507078");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0])["doWithdrawEth(uint256)"]((roundNum_ <= 0n) ? 0n : (roundNum_ - 1n));
						break;
					}
					case 5: {
						if (roundNum_ <= 0n) {
							// console.info("202507079");
							continue;
						}
						// console.info("202507081");
						await hre.ethers.provider.send("evm_increaseTime", [Number(timeoutDurationToWithdrawPrizes_),]);
						// await hre.ethers.provider.send("evm_mine");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0])["doWithdrawEth(uint256,address)"](roundNum_ - 1n, maliciousPrizeWinnerAddress_);
						break;
					}
					case 6: {
						// console.info("202511173");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doWithdrawEthMany([(roundNum_ <= 0n) ? 0n : (roundNum_ - 1n),]);
						break;
					}
					case 7: {
						// console.info("202507082");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(roundNum_, contracts_.signers[0].address, maliciousTokenAddress_, 1n);
						break;
					}
					case 8: {
						if (roundNum_ <= 0n) {
							// console.info("202507083");
							continue;
						}
						// console.info("202507084");

						// [Comment-202507153]
						// todo-0 I dislike this. Take a closer look.
						// It appears that this can call `maliciousToken.transferFrom` to transfer from the zero address,
						// which won't cause a reversal.
						// Comment-202507177 relates.
						// [/Comment-202507153]
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimDonatedToken(roundNum_ - 1n, maliciousTokenAddress_, 1n);

						break;
					}
					case 9: {
						const donatedTokensToClaim_ = [];
						if (roundNum_ <= 0n) {
							// console.info("202507085");
							transactionWillNotFailDueToReentry_ = true;
						} else {
							// console.info("202507086");
							donatedTokensToClaim_.push([roundNum_ - 1n, maliciousTokenAddress_, 1n,]);
						}

						// Comment-202507153 applies.
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimManyDonatedTokens(donatedTokensToClaim_);

						break;
					}
					case 10:
					case 11:
					case 12: {
						// console.info("202507088");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateNft(roundNum_, contracts_.signers[0].address, maliciousTokenAddress_, 0n);
						nextDonatedNftToDonateIndexIncrement_ = 1n;
						break;
					}
					case 13: {
						if ( ! (nextDonatedNftToClaimIndex_ < nextDonatedNftToDonateIndex_ && donatedNftRoundNums_[Number(nextDonatedNftToClaimIndex_)] < roundNum_) ) {
							// console.info("202507089");
							continue;
						}
						// console.info("202507091");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimDonatedNft(nextDonatedNftToClaimIndex_);
						nextDonatedNftToClaimIndexIncrement_ = 1n;
						break;
					}
					default: {
						expect(choiceCode_).equal(14);
						const donatedNftIndexes_ = [];
						if (nextDonatedNftToClaimIndex_ < nextDonatedNftToDonateIndex_ && donatedNftRoundNums_[Number(nextDonatedNftToClaimIndex_)] < roundNum_) {
							// console.info("202507092");
							donatedNftIndexes_.push(nextDonatedNftToClaimIndex_);
							nextDonatedNftToClaimIndexIncrement_ = 1n;
						} else {
							// console.info("202507093");
							transactionWillNotFailDueToReentry_ = true;
						}
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimManyDonatedNfts(donatedNftIndexes_);
						break;
					}
				}

				// #endregion
				// #region

				// Comment-202507062 applies.
				if (maliciousActorModeCode_ <= 113n && ( ! transactionWillNotFailDueToReentry_ )) {

					const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
					switch (choiceCode_) {
						case 1:
						case 4:
						case 5:
						case 6: {
							// console.info("202507094");
							await transactionResponsePromiseAssertion_
								.revertedWithCustomError(newPrizesWallet_, "FundTransferFailed")
								.withArgs("ETH withdrawal failed.", maliciousPrizeWinnerAddress_, anyUint);
							break;
						}
						default: {
							// console.info("202507095");
							await transactionResponsePromiseAssertion_.revertedWithCustomError(newPrizesWallet_, "ReentrancyGuardReentrantCall");
							break;
						}
					}
				} else {
					await waitForTransactionReceipt(transactionResponsePromise_);
					// nextDonatedNftToDonateIndex_ += nextDonatedNftToDonateIndexIncrement_;
					if (nextDonatedNftToDonateIndexIncrement_ > 0n) {
						// console.info("202507096");
						donatedNftRoundNums_[Number(nextDonatedNftToDonateIndex_)] = roundNum_;
						++ nextDonatedNftToDonateIndex_;
					} else {
						// console.info("202507097");
					}
					nextDonatedNftToClaimIndex_ += nextDonatedNftToClaimIndexIncrement_;
				}

				// #endregion
				// #region

				break;

				// #endregion
			}

			// #endregion
		}

		// #endregion
	});

	// #endregion
});

// #endregion
