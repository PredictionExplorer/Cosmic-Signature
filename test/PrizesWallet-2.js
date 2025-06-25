// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { generateRandomUInt32, generateRandomUInt256 } = require("../src/Helpers.js");
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

	it("The registerRoundEndAndDepositEthMany, withdrawEverything, donateToken, donateNft methods", async function () {
		// #region

		let transactionResponsePromise_;
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
		transactionResponsePromise_ = newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address);
		await expect(transactionResponsePromise_).not.reverted;

		// #endregion
		// #region
		
		for ( let counter_ = 0; counter_ < 4; ++ counter_ ) {
			transactionResponsePromise_ = tokens_[counter_].connect(contracts_.signers[counter_]).approve(newPrizesWalletAddr_, (1n << 256n) - 1n);
			await expect(transactionResponsePromise_).not.reverted;
			transactionResponsePromise_ = tokens_[counter_].connect(contracts_.signers[10]).mint(contracts_.signers[counter_].address, 10n ** (18n + 1n));
			await expect(transactionResponsePromise_).not.reverted;
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(0n, contracts_.signers[counter_].address, tokensAddr_[counter_], BigInt(1 << counter_) * 10n ** 18n);
			await expect(transactionResponsePromise_).not.reverted;

			transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(newPrizesWalletAddr_, true);
			await expect(transactionResponsePromise_).not.reverted;
			transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),});
			await expect(transactionResponsePromise_).not.reverted;
			const nftId_ = BigInt(counter_);
			transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateNft(0n, contracts_.signers[counter_].address, contracts_.randomWalkNftAddr, nftId_);
			await expect(transactionResponsePromise_).not.reverted;
		}

		// #endregion
		// #region

		const ethDeposits_ = [
			[contracts_.signers[0].address, 1n * 10n ** (18n - 3n),],
			[contracts_.signers[1].address, 2n * 10n ** (18n - 3n),],
			[contracts_.signers[2].address, 4n * 10n ** (18n - 3n),],
			[contracts_.signers[3].address, 8n * 10n ** (18n - 3n),],
		];
		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, ethDeposits_, {value: (1n + 2n + 4n + 8n) * 10n ** (18n - 3n),});
		transactionResponse_ = await transactionResponsePromise_;
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

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything(false, [], []);
		transactionResponse_ = await transactionResponsePromise_;
		transactionReceipt_ = await transactionResponse_.wait();
		expect(transactionReceipt_.logs.length).equal(0);

		// #endregion
		// #region

		const donatedTokensToClaim_ = [
			[0n, tokensAddr_[3],],
			[0n, tokensAddr_[1],],
		];
		const donatedNftIndexes_ = [3n, 0n,];
		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[2]).withdrawEverything(true, donatedTokensToClaim_, donatedNftIndexes_);
		transactionResponse_ = await transactionResponsePromise_;
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

		for ( let brokenEthReceiverEthDepositAcceptanceModeCode_ = 2n; brokenEthReceiverEthDepositAcceptanceModeCode_ >= 0n; -- brokenEthReceiverEthDepositAcceptanceModeCode_ ) {
			await expect(bidderContract_.setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_)).not.reverted;
			for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
				const prizeWinnerAddress_ = (counter_ <= 0) ? bidderContractAddr_ : contracts_.signers[1].address;
				const prizeWinnerEthBalanceAmount_ = (await contracts_.prizesWallet["getEthBalanceInfo(address)"](prizeWinnerAddress_))[1];
				// console.info(hre.ethers.formatEther(prizeWinnerEthBalanceAmount_));
				const transactionResponsePromise_ =
					(counter_ <= 0) ?
					bidderContract_.connect(contracts_.signers[4])["doWithdrawEth"]() :
					bidderContract_.connect(contracts_.signers[4])["doWithdrawEth(address)"](contracts_.signers[1].address);
				if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.prizesWallet, "FundTransferFailed")
						.withArgs("ETH withdrawal failed.", bidderContractAddr_, prizeWinnerEthBalanceAmount_);
				} else {
					await expect(transactionResponsePromise_)
						.emit(contracts_.prizesWallet, "EthWithdrawn")
						.withArgs(prizeWinnerAddress_, bidderContractAddr_, prizeWinnerEthBalanceAmount_);
				}
			}
		}
	});

	// #endregion
	// #region

	it("The donateNft method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		let transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: 10n ** (18n - 2n),});
		await expect(transactionResponsePromise_).not.reverted;
		let nftId_ = 0n;
		transactionResponsePromise_ = contracts_.prizesWallet.connect(contracts_.signers[1]).donateNft(0n, contracts_.signers[1].address, contracts_.randomWalkNftAddr, nftId_);
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(contracts_.prizesWallet, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);
		transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", hre.ethers.ZeroAddress, nftId_, {value: 10n ** (18n - 2n),});
		await expect(transactionResponsePromise_).revertedWithoutReason();
		for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
			transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEthAndDonateNft(-1n, "", contracts_.randomWalkNftAddr, nftId_, {value: 10n ** (18n - 2n),});
			if (counter_ <= 0) {
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.randomWalkNft, "ERC721InsufficientApproval");
				transactionResponsePromise_ = contracts_.randomWalkNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.prizesWalletAddr, true);
			}
			await expect(transactionResponsePromise_).not.reverted;
		}
	});

	// #endregion
	// #region

	it("The claimManyDonatedNfts method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const prizesWalletDonatedNftClaimedTopicHash_ = contracts_.prizesWallet.interface.getEvent("DonatedNftClaimed").topicHash;

		for ( let counter_ = 0; counter_ <= 2; ++ counter_ ) {
			await expect(contracts_.randomWalkNft.connect(contracts_.signers[counter_]).setApprovalForAll(contracts_.prizesWalletAddr, true)).not.reverted;
			await expect(contracts_.randomWalkNft.connect(contracts_.signers[counter_]).mint({value: 10n ** (18n - 2n),})).not.reverted;
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

	it("Incorrect or forbidden operations", async function () {
		// todo-0 Everywhere, rename "future" to "promise".
		let transactionResponsePromise_;
		// let transactionResponse_;
		// let transactionReceipt_;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		// const newPrizesWalletAddr_ = await newPrizesWallet_.getAddress();
		transactionResponsePromise_ = newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address);
		await expect(transactionResponsePromise_).not.reverted;

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEndAndDepositEthMany(0n, contracts_.signers[2].address, [], {value: 0n,});
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).registerRoundEnd(0n, contracts_.signers[2].address);
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).depositEth(0n, contracts_.signers[2].address, {value: 0n,});
		await expect(transactionResponsePromise_)
			.revertedWithCustomError(newPrizesWallet_, "UnauthorizedCaller")
			.withArgs("Only the CosmicSignatureGame contract is permitted to call this method.", contracts_.signers[1].address);

		transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[1]).donateToken(0n, contracts_.signers[2].address, contracts_.cosmicSignatureTokenAddr, 0n);
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

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);
	
		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.signers[10].address);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddr_ = await newPrizesWallet_.getAddress();
		await expect(newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", contracts_.deployerAcct);
		const maliciousToken_ = await maliciousTokenFactory_.deploy(newPrizesWalletAddr_, hre.ethers.ZeroAddress);
		await maliciousToken_.waitForDeployment();
		const maliciousTokenAddr_ = await maliciousToken_.getAddress();

		const maliciousPrizeWinnerFactory_ = await hre.ethers.getContractFactory("MaliciousPrizeWinner", contracts_.deployerAcct);
		const maliciousPrizeWinner_ = await maliciousPrizeWinnerFactory_.deploy(newPrizesWalletAddr_, hre.ethers.ZeroAddress);
		await maliciousPrizeWinner_.waitForDeployment();
		const maliciousPrizeWinnerAddr_ = await maliciousPrizeWinner_.getAddress();

		// #endregion
		// #region

		const ethDonationAmount_ = 10n ** 18n;
		await expect(contracts_.signers[0].sendTransaction({to: maliciousTokenAddr_, value: ethDonationAmount_,})).not.reverted;
		await expect(contracts_.signers[0].sendTransaction({to: maliciousPrizeWinnerAddr_, value: ethDonationAmount_,})).not.reverted;

		const timeoutDurationToWithdrawPrizes_ = await newPrizesWallet_.timeoutDurationToWithdrawPrizes();
		let roundNum_ = 0n;
		let nextDonatedNftIndex_ = 0n;
		let nextDonatedNftToClaimIndex_ = 0n;

		// #endregion
		// #region

		for ( let counter_ = 0; counter_ < 250; ++ counter_ ) {
			// #region

			let randomNumber_ = generateRandomUInt32();

			// Comment-202507062 applies.
			const maliciousActorModeCode_ = BigInt(randomNumber_ % (12 * 2) + 101);

			await expect(maliciousToken_.connect(contracts_.signers[0]).setModeCode(maliciousActorModeCode_)).not.reverted;
			await expect(maliciousPrizeWinner_.connect(contracts_.signers[0]).setModeCode(maliciousActorModeCode_)).not.reverted;

			// #endregion
			// #region

			for (;;) {
				// #region

				let nextDonatedNftIndexIncrement_ = 0n;
				let nextDonatedNftToClaimIndexIncrement_ = 0n;
				let transactionResponsePromise_;
				let transactionWillNotFailDueToReentry_ = false;
				randomNumber_ = generateRandomUInt32();
				const choiceCode_ = randomNumber_ % 14;
				// console.info("202507069", choiceCode_.toString());

				// #endregion
				// #region

				switch (choiceCode_) {
					case 0: {
						// console.info("202507072");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).registerRoundEndAndDepositEthMany(roundNum_, maliciousPrizeWinnerAddr_, [[maliciousPrizeWinnerAddr_, 1n,]], {value: 1n,});
						++ roundNum_;
						transactionWillNotFailDueToReentry_ = true;
						break;
					}
					case 1:
					case 2:
					case 3: {
						let withdrawEth_ = false;
						const donatedTokensToClaim_ = [];
						const donatedNftIndexes_ = [];
						switch (choiceCode_) {
							case 1: {
								// console.info("202507073");
								withdrawEth_ = true;
								break;
							}
							case 2: {
								if (roundNum_ > 0n) {
									// console.info("202507074");
									donatedTokensToClaim_.push([roundNum_ - 1n, maliciousTokenAddr_,]);
								} else {
									// console.info("202507075");
									transactionWillNotFailDueToReentry_ = true;
								}
								break;
							}
							default: {
								if (nextDonatedNftToClaimIndex_ < nextDonatedNftIndex_) {
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
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doWithdrawEverything(withdrawEth_, donatedTokensToClaim_, donatedNftIndexes_);
						break;
					}
					case 4: {
						// console.info("202507078");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0])["doWithdrawEth()"]();
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
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0])["doWithdrawEth(address)"](maliciousPrizeWinnerAddr_);
						break;
					}
					case 6: {
						// console.info("202507082");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateToken(roundNum_, contracts_.signers[0].address, maliciousTokenAddr_, 1n);
						break;
					}
					case 7: {
						if (roundNum_ <= 0n) {
							// console.info("202507083");
							continue;
						}
						// console.info("202507084");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimDonatedToken(roundNum_ - 1n, maliciousTokenAddr_);
						break;
					}
					case 8: {
						const donatedTokensToClaim_ = [];
						if (roundNum_ > 0n) {
							// console.info("202507085");
							donatedTokensToClaim_.push([roundNum_ - 1n, maliciousTokenAddr_,]);
						} else {
							// console.info("202507086");
							transactionWillNotFailDueToReentry_ = true;
						}
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimManyDonatedTokens(donatedTokensToClaim_);
						break;
					}
					case 9:
					case 10:
					case 11: {
						if (roundNum_ <= 0n) {
							// console.info("202507087");
							continue;
						}
						// console.info("202507088");
						transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[10]).donateNft(roundNum_ - 1n, contracts_.signers[0].address, maliciousTokenAddr_, 0n);
						nextDonatedNftIndexIncrement_ = 1n;
						break;
					}
					case 12: {
						if (nextDonatedNftToClaimIndex_ >= nextDonatedNftIndex_) {
							// console.info("202507089");
							continue;
						}
						// console.info("202507091");
						transactionResponsePromise_ = maliciousPrizeWinner_.connect(contracts_.signers[0]).doClaimDonatedNft(nextDonatedNftToClaimIndex_);
						nextDonatedNftToClaimIndexIncrement_ = 1n;
						break;
					}
					default: {
						const donatedNftIndexes_ = [];
						if (nextDonatedNftToClaimIndex_ < nextDonatedNftIndex_) {
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

				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);

				// Comment-202507062 applies.
				if (maliciousActorModeCode_ <= 112n && ( ! transactionWillNotFailDueToReentry_ )) {

					switch (choiceCode_) {
						case 1:
						case 4:
						case 5: {
							// console.info("202507094");
							await transactionResponsePromiseAssertion_
								.revertedWithCustomError(newPrizesWallet_, "FundTransferFailed")
								.withArgs("ETH withdrawal failed.", maliciousPrizeWinnerAddr_, anyUint);
							break;
						}
						default: {
							// console.info("202507095");
							await transactionResponsePromiseAssertion_.revertedWithCustomError(newPrizesWallet_, "ReentrancyGuardReentrantCall");
							break;
						}
					}
				} else {
					// console.info("202507096");
					await transactionResponsePromiseAssertion_.not.reverted;
					nextDonatedNftIndex_ += nextDonatedNftIndexIncrement_;
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
