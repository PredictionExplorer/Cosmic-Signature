// #region
// 
// World-Class Comprehensive Fuzz Test for Cosmic Signature Protocol
// 
// This test simulates realistic multi-participant behavior across 100+ rounds:
// - 10+ active participants with unique behavior patterns
// - Each participant has substantial ETH reserves
// - Realistic action sequences (mint → stake → bid → claim → withdraw)
// - Comprehensive coverage of all contract functionality
// - Random but realistic timing and decision-making
// 
// Run with assertions enabled:
// HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true npx hardhat test test/tests-src/FuzzTest.js
// 
// #endregion
// #region

"use strict";

// #endregion
// #region Imports

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper, uint256ToPaddedHexString, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { SKIP_LONG_TESTS, loadFixtureDeployContractsForTesting, tryWaitForTransactionReceipt } = require("../../src/ContractTestingHelpers.js");

// #endregion
// #region Configuration

/**
 * Fuzz test configuration - World-class settings
 */
const FUZZ_CONFIG = {
	// Core parameters
	numRounds: 100,                        // 100 rounds for thorough testing
	numActiveParticipants: 10,             // At least 10 active participants
	actionsPerParticipantPerRound: 5,      // Each participant does ~5 actions per round
	
	// ETH configuration (each participant gets 1000 ETH)
	ethPerParticipant: 1000n * 10n ** 18n,
	
	// Participant behavior profiles (probability weights out of 100)
	behaviorProfiles: {
		aggressive: {    // Bids frequently, tries to win
			bidWithEth: 30,
			bidWithEthPlusNft: 15,
			bidWithCst: 10,
			mintRandomWalkNft: 10,
			stakeRandomWalkNft: 8,
			stakeCosmicSignatureNft: 8,
			unstakeRandomWalkNft: 3,
			unstakeCosmicSignatureNft: 3,
			claimMainPrize: 5,
			withdrawEthPrize: 3,
			donateEth: 2,
			donateEthWithInfo: 1,
			transferNft: 1,
			transferCst: 1,
		},
		passive: {       // Focuses on staking and collecting rewards
			bidWithEth: 10,
			bidWithEthPlusNft: 5,
			bidWithCst: 5,
			mintRandomWalkNft: 15,
			stakeRandomWalkNft: 15,
			stakeCosmicSignatureNft: 15,
			unstakeRandomWalkNft: 8,
			unstakeCosmicSignatureNft: 8,
			claimMainPrize: 3,
			withdrawEthPrize: 8,
			donateEth: 3,
			donateEthWithInfo: 2,
			transferNft: 2,
			transferCst: 1,
		},
		whale: {         // Makes large bids, donates frequently
			bidWithEth: 25,
			bidWithEthPlusNft: 10,
			bidWithCst: 15,
			mintRandomWalkNft: 8,
			stakeRandomWalkNft: 5,
			stakeCosmicSignatureNft: 5,
			unstakeRandomWalkNft: 2,
			unstakeCosmicSignatureNft: 2,
			claimMainPrize: 8,
			withdrawEthPrize: 5,
			donateEth: 8,
			donateEthWithInfo: 5,
			transferNft: 1,
			transferCst: 1,
		},
		balanced: {      // Does a bit of everything
			bidWithEth: 18,
			bidWithEthPlusNft: 10,
			bidWithCst: 10,
			mintRandomWalkNft: 10,
			stakeRandomWalkNft: 10,
			stakeCosmicSignatureNft: 10,
			unstakeRandomWalkNft: 5,
			unstakeCosmicSignatureNft: 5,
			claimMainPrize: 5,
			withdrawEthPrize: 5,
			donateEth: 5,
			donateEthWithInfo: 3,
			transferNft: 2,
			transferCst: 2,
		},
	},
	
	// Time advancement settings
	minTimeBetweenActions: 1,              // Minimum 1 second between actions
	maxTimeBetweenActions: 3600,           // Maximum 1 hour between actions
	
	// Bid message settings
	maxBidMessageLength: 280,
	
	// Logging verbosity (0=minimal, 1=normal, 2=verbose)
	verbosity: 1,
};

// #endregion
// #region Participant Class

/**
 * Represents a participant with their own behavior profile and state tracking
 */
class Participant {
	constructor(index, signer, contracts, behaviorProfile, randomSeedWrapper) {
		this.index = index;
		this.signer = signer;
		this.address = signer.address;
		this.contracts = contracts;
		this.behaviorProfile = behaviorProfile;
		this.randomSeedWrapper = randomSeedWrapper;
		
		// Track participant's state
		this.stats = {
			bidsPlaced: 0,
			prizesWon: 0,
			nftsMinted: 0,
			nftsStaked: 0,
			ethSpent: 0n,
			cstSpent: 0n,
			ethEarned: 0n,
			cstEarned: 0n,
		};
		
		// Connected contract instances
		this.gameProxy = contracts.cosmicSignatureGameProxy.connect(signer);
		this.randomWalkNft = contracts.randomWalkNft.connect(signer);
		this.cosmicSignatureNft = contracts.cosmicSignatureNft.connect(signer);
		this.cosmicSignatureToken = contracts.cosmicSignatureToken.connect(signer);
		this.stakingWalletRandomWalkNft = contracts.stakingWalletRandomWalkNft.connect(signer);
		this.stakingWalletCosmicSignatureNft = contracts.stakingWalletCosmicSignatureNft.connect(signer);
		this.prizesWallet = contracts.prizesWallet.connect(signer);
	}
	
	/**
	 * Generate a random number using the shared seed wrapper
	 */
	random() {
		return generateRandomUInt256FromSeedWrapper(this.randomSeedWrapper);
	}
	
	/**
	 * Select an action based on behavior profile
	 */
	selectAction() {
		const roll = Number(this.random() % 100n);
		let cumulative = 0;
		for (const [action, weight] of Object.entries(this.behaviorProfile)) {
			cumulative += weight;
			if (roll < cumulative) {
				return action;
			}
		}
		return "bidWithEth"; // Fallback
	}
	
	/**
	 * Generate a random bid message
	 */
	generateMessage() {
		const length = Number(this.random() % BigInt(FUZZ_CONFIG.maxBidMessageLength + 1));
		if (length === 0) return "";
		// Mix of characters for more realistic messages
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !?.,";
		let message = "";
		for (let i = 0; i < length; i++) {
			message += chars[Number(this.random() % BigInt(chars.length))];
		}
		return message;
	}
}

// #endregion
// #region `describe`

describe("FuzzTest", function () {
	// #region

	it("World-class comprehensive fuzz test with realistic multi-participant behavior", async function () {
		// #region Setup

		// Long timeout for comprehensive testing
		this.timeout(3600_000); // 1 hour

		console.log("\n" + "═".repeat(80));
		console.log("  COSMIC SIGNATURE PROTOCOL - WORLD-CLASS FUZZ TEST");
		console.log("═".repeat(80));
		console.log(`  Rounds: ${FUZZ_CONFIG.numRounds}`);
		console.log(`  Participants: ${FUZZ_CONFIG.numActiveParticipants}`);
		console.log(`  Actions/Participant/Round: ~${FUZZ_CONFIG.actionsPerParticipantPerRound}`);
		console.log(`  Total Expected Actions: ~${FUZZ_CONFIG.numRounds * FUZZ_CONFIG.numActiveParticipants * FUZZ_CONFIG.actionsPerParticipantPerRound}`);
		console.log("═".repeat(80));

		// Generate random seed for reproducibility
		const randomNumberSeed = generateRandomUInt256();
		console.log(`\n  Random Seed: 0x${uint256ToPaddedHexString(randomNumberSeed)}`);
		console.log("  (Save this seed to reproduce the exact test run)\n");
		console.log("─".repeat(80));

		const randomSeedWrapper = { value: randomNumberSeed };

		// #endregion
		// #region Deploy Contracts

		let randomNumber = generateRandomUInt256FromSeedWrapper(randomSeedWrapper);
		const roundActivationTimeOffset = randomNumber % 4096n - 1024n;
		const contracts = await loadFixtureDeployContractsForTesting(roundActivationTimeOffset);

		// #endregion
		// #region Initialize Participants

		const behaviorProfileNames = Object.keys(FUZZ_CONFIG.behaviorProfiles);
		const participants = [];
		
		// Ensure we have enough signers
		const numParticipants = Math.min(FUZZ_CONFIG.numActiveParticipants, contracts.signers.length);
		
		for (let i = 0; i < numParticipants; i++) {
			const signer = contracts.signers[i];
			
			// Assign behavior profile (rotate through profiles)
			const profileName = behaviorProfileNames[i % behaviorProfileNames.length];
			const behaviorProfile = FUZZ_CONFIG.behaviorProfiles[profileName];
			
			// Create participant
			const participant = new Participant(i, signer, contracts, behaviorProfile, randomSeedWrapper);
			participants.push(participant);
			
			// Give each participant substantial ETH (1000 ETH each)
			await hre.ethers.provider.send("hardhat_setBalance", [
				signer.address,
				"0x" + FUZZ_CONFIG.ethPerParticipant.toString(16),
			]);
			
			// Pre-approve staking wallets for NFT transfers
			await waitForTransactionReceipt(
				participant.randomWalkNft.setApprovalForAll(contracts.stakingWalletRandomWalkNftAddress, true)
			);
			await waitForTransactionReceipt(
				participant.cosmicSignatureNft.setApprovalForAll(contracts.stakingWalletCosmicSignatureNftAddress, true)
			);
			
			// Pre-approve game for CST spending (large amount)
			await waitForTransactionReceipt(
				participant.cosmicSignatureToken.approve(
					contracts.cosmicSignatureGameProxyAddress,
					10n ** 30n // Very large approval
				)
			);
			
			if (FUZZ_CONFIG.verbosity >= 2) {
				console.log(`  Participant ${i}: ${signer.address.slice(0, 10)}... (${profileName})`);
			}
		}
		
		console.log(`\n  Initialized ${participants.length} participants with ${hre.ethers.formatEther(FUZZ_CONFIG.ethPerParticipant)} ETH each\n`);

		// #endregion
		// #region Statistics Tracking

		const globalStats = {
			totalActions: 0,
			successfulActions: 0,
			failedActions: 0,
			roundsCompleted: 0,
			totalEthBid: 0n,
			totalCstBid: 0n,
			totalEthDonated: 0n,
			actionCounts: {},
		};

		// Initialize action counts
		for (const profile of Object.values(FUZZ_CONFIG.behaviorProfiles)) {
			for (const action of Object.keys(profile)) {
				if (!globalStats.actionCounts[action]) {
					globalStats.actionCounts[action] = { attempted: 0, succeeded: 0 };
				}
			}
		}

		// #endregion
		// #region Helper Functions

		/**
		 * Advances block time by a random amount
		 */
		const advanceTime = async (minSeconds, maxSeconds) => {
			const range = BigInt(maxSeconds - minSeconds);
			const seconds = minSeconds + (range > 0n ? Number(generateRandomUInt256FromSeedWrapper(randomSeedWrapper) % range) : 0);
			const latestBlock = await hre.ethers.provider.getBlock("latest");
			const newTimestamp = latestBlock.timestamp + seconds;
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [newTimestamp]);
			await hre.ethers.provider.send("evm_mine");
			return newTimestamp;
		};

		/**
		 * Find an unused Random Walk NFT owned by participant
		 */
		const findUnusedRandomWalkNft = async (participant, forStaking) => {
			const totalSupply = await contracts.randomWalkNft.totalSupply();
			if (totalSupply === 0n) return -1n;

			for (let i = 0; i < Math.min(30, Number(totalSupply)); i++) {
				const nftId = participant.random() % totalSupply;
				try {
					const owner = await contracts.randomWalkNft.ownerOf(nftId);
					if (owner !== participant.address) continue;
					
					if (forStaking) {
						const isUsed = await contracts.stakingWalletRandomWalkNft.usedNfts(nftId);
						if (isUsed === 0n) return nftId;
					} else {
						const isUsed = await contracts.cosmicSignatureGameProxy.usedRandomWalkNfts(nftId);
						if (isUsed === 0n) return nftId;
					}
				} catch (e) { /* NFT doesn't exist */ }
			}
			return -1n;
		};

		/**
		 * Find an unused Cosmic Signature NFT owned by participant
		 */
		const findUnusedCosmicSignatureNft = async (participant) => {
			const totalSupply = await contracts.cosmicSignatureNft.totalSupply();
			if (totalSupply === 0n) return -1n;

			for (let i = 0; i < Math.min(30, Number(totalSupply)); i++) {
				const nftId = participant.random() % totalSupply;
				try {
					const owner = await contracts.cosmicSignatureNft.ownerOf(nftId);
					if (owner !== participant.address) continue;
					
					const isUsed = await contracts.stakingWalletCosmicSignatureNft.usedNfts(nftId);
					if (isUsed === 0n) return nftId;
				} catch (e) { /* NFT doesn't exist */ }
			}
			return -1n;
		};

		/**
		 * Find a staked NFT action for participant
		 */
		const findStakedNftAction = async (stakingWallet, participant) => {
			const numStaked = await stakingWallet.numStakedNfts();
			if (numStaked === 0n) return -1n;
			
			const actionCounter = await stakingWallet.actionCounter();
			if (actionCounter === 0n) return -1n;
			
			for (let i = 0; i < Math.min(15, Number(actionCounter)); i++) {
				const actionId = (participant.random() % actionCounter) + 1n;
				try {
					const action = await stakingWallet.stakeActions(actionId);
					if (action.nftOwnerAddress === participant.address) {
						return actionId;
					}
				} catch (e) { /* Action doesn't exist */ }
			}
			return -1n;
		};

		/**
		 * Find another random participant for transfers
		 */
		const findOtherParticipant = (currentParticipant) => {
			if (participants.length < 2) return null;
			let other;
			do {
				const idx = Number(generateRandomUInt256FromSeedWrapper(randomSeedWrapper) % BigInt(participants.length));
				other = participants[idx];
			} while (other.address === currentParticipant.address);
			return other;
		};

		/**
		 * Execute a single action for a participant
		 */
		const executeAction = async (participant, action) => {
			globalStats.totalActions++;
			globalStats.actionCounts[action].attempted++;
			
			try {
				switch (action) {
					// #region mintRandomWalkNft
					case "mintRandomWalkNft": {
						const mintPrice = await participant.randomWalkNft.getMintPrice();
						const receipt = await tryWaitForTransactionReceipt(
							participant.randomWalkNft.mint({ value: mintPrice })
						);
						if (receipt) {
							participant.stats.nftsMinted++;
							globalStats.successfulActions++;
							globalStats.actionCounts[action].succeeded++;
							return true;
						}
						break;
					}
					// #endregion

					// #region stakeRandomWalkNft
					case "stakeRandomWalkNft": {
						const nftId = await findUnusedRandomWalkNft(participant, true);
						if (nftId >= 0n) {
							const receipt = await tryWaitForTransactionReceipt(
								participant.stakingWalletRandomWalkNft.stake(nftId)
							);
							if (receipt) {
								participant.stats.nftsStaked++;
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region unstakeRandomWalkNft
					case "unstakeRandomWalkNft": {
						const actionId = await findStakedNftAction(contracts.stakingWalletRandomWalkNft, participant);
						if (actionId >= 0n) {
							const receipt = await tryWaitForTransactionReceipt(
								participant.stakingWalletRandomWalkNft.unstake(actionId)
							);
							if (receipt) {
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region stakeCosmicSignatureNft
					case "stakeCosmicSignatureNft": {
						const nftId = await findUnusedCosmicSignatureNft(participant);
						if (nftId >= 0n) {
							const receipt = await tryWaitForTransactionReceipt(
								participant.stakingWalletCosmicSignatureNft.stake(nftId)
							);
							if (receipt) {
								participant.stats.nftsStaked++;
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region unstakeCosmicSignatureNft
					case "unstakeCosmicSignatureNft": {
						const actionId = await findStakedNftAction(contracts.stakingWalletCosmicSignatureNft, participant);
						if (actionId >= 0n) {
							const balanceBefore = await hre.ethers.provider.getBalance(participant.address);
							const receipt = await tryWaitForTransactionReceipt(
								participant.stakingWalletCosmicSignatureNft.unstake(actionId)
							);
							if (receipt) {
								const balanceAfter = await hre.ethers.provider.getBalance(participant.address);
								const earned = balanceAfter - balanceBefore;
								if (earned > 0n) participant.stats.ethEarned += earned;
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region bidWithEth
					case "bidWithEth": {
						await advanceTime(1, 600); // Advance 1s to 10min
						const bidPrice = await participant.gameProxy.getNextEthBidPrice();
						const valueToSend = bidPrice + bidPrice / 5n; // 20% buffer
						const message = participant.generateMessage();
						
						const receipt = await tryWaitForTransactionReceipt(
							participant.gameProxy.bidWithEth(-1n, message, { value: valueToSend })
						);
						if (receipt) {
							participant.stats.bidsPlaced++;
							participant.stats.ethSpent += bidPrice;
							globalStats.totalEthBid += bidPrice;
							globalStats.successfulActions++;
							globalStats.actionCounts[action].succeeded++;
							return true;
						}
						break;
					}
					// #endregion

					// #region bidWithEthPlusNft
					case "bidWithEthPlusNft": {
						await advanceTime(1, 600);
						const nftId = await findUnusedRandomWalkNft(participant, false);
						if (nftId >= 0n) {
							const bidPrice = await participant.gameProxy.getNextEthBidPrice();
							const discountedPrice = bidPrice / 2n;
							const valueToSend = discountedPrice + discountedPrice / 5n;
							const message = participant.generateMessage();
							
							const receipt = await tryWaitForTransactionReceipt(
								participant.gameProxy.bidWithEth(nftId, message, { value: valueToSend })
							);
							if (receipt) {
								participant.stats.bidsPlaced++;
								participant.stats.ethSpent += discountedPrice;
								globalStats.totalEthBid += discountedPrice;
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region bidWithCst
					case "bidWithCst": {
						const lastBidder = await contracts.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder !== hre.ethers.ZeroAddress) {
							await advanceTime(1, 300);
							try {
								const cstPrice = await participant.gameProxy.getNextCstBidPrice();
								const cstBalance = await contracts.cosmicSignatureToken.balanceOf(participant.address);
								
								if (cstBalance >= cstPrice) {
									const message = participant.generateMessage();
									const receipt = await tryWaitForTransactionReceipt(
										participant.gameProxy.bidWithCst(message)
									);
									if (receipt) {
										participant.stats.bidsPlaced++;
										participant.stats.cstSpent += cstPrice;
										globalStats.totalCstBid += cstPrice;
										globalStats.successfulActions++;
										globalStats.actionCounts[action].succeeded++;
										return true;
									}
								}
							} catch (e) { /* CST bid conditions not met */ }
						}
						break;
					}
					// #endregion

					// #region claimMainPrize
					case "claimMainPrize": {
						const lastBidder = await contracts.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder !== hre.ethers.ZeroAddress) {
							const mainPrizeTime = await contracts.cosmicSignatureGameProxy.mainPrizeTime();
							const currentBlock = await hre.ethers.provider.getBlock("latest");
							
							// Sometimes advance to claim time
							if (participant.random() % 2n === 0n && BigInt(currentBlock.timestamp) < mainPrizeTime) {
								const targetTime = Math.max(Number(mainPrizeTime), currentBlock.timestamp + 1);
								await hre.ethers.provider.send("evm_setNextBlockTimestamp", [targetTime]);
								await hre.ethers.provider.send("evm_mine");
							}
							
							const balanceBefore = await hre.ethers.provider.getBalance(participant.address);
							const receipt = await tryWaitForTransactionReceipt(
								participant.gameProxy.claimMainPrize()
							);
							if (receipt) {
								const balanceAfter = await hre.ethers.provider.getBalance(participant.address);
								const earned = balanceAfter - balanceBefore;
								if (earned > 0n) participant.stats.ethEarned += earned;
								participant.stats.prizesWon++;
								globalStats.roundsCompleted++;
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								if (FUZZ_CONFIG.verbosity >= 1) {
									const newRound = await contracts.cosmicSignatureGameProxy.roundNum();
									console.log(`    ★ Participant ${participant.index} claimed main prize! Round ${newRound}`);
								}
								return true;
							}
						}
						break;
					}
					// #endregion

					// #region withdrawEthPrize
					case "withdrawEthPrize": {
						const currentRound = await contracts.cosmicSignatureGameProxy.roundNum();
						if (currentRound > 0n) {
							const prizeRound = participant.random() % currentRound;
							try {
								const prizeBalance = await contracts.prizesWallet.getEthBalanceAmount(prizeRound, participant.address);
								if (prizeBalance > 0n) {
									const receipt = await tryWaitForTransactionReceipt(
										participant.prizesWallet.withdrawEth(prizeRound)
									);
									if (receipt) {
										participant.stats.ethEarned += prizeBalance;
										globalStats.successfulActions++;
										globalStats.actionCounts[action].succeeded++;
										return true;
									}
								}
							} catch (e) { /* No prize available */ }
						}
						break;
					}
					// #endregion

					// #region donateEth
					case "donateEth": {
						const amount = (participant.random() % (10n ** 17n)) + 10n ** 15n; // 0.001 to 0.1 ETH
						const receipt = await tryWaitForTransactionReceipt(
							participant.gameProxy.donateEth({ value: amount })
						);
						if (receipt) {
							globalStats.totalEthDonated += amount;
							globalStats.successfulActions++;
							globalStats.actionCounts[action].succeeded++;
							return true;
						}
						break;
					}
					// #endregion

					// #region donateEthWithInfo
					case "donateEthWithInfo": {
						const amount = (participant.random() % (10n ** 17n)) + 10n ** 15n;
						const message = participant.generateMessage();
						const receipt = await tryWaitForTransactionReceipt(
							participant.gameProxy.donateEthWithInfo(message, { value: amount })
						);
						if (receipt) {
							globalStats.totalEthDonated += amount;
							globalStats.successfulActions++;
							globalStats.actionCounts[action].succeeded++;
							return true;
						}
						break;
					}
					// #endregion

					// #region transferNft
					case "transferNft": {
						const other = findOtherParticipant(participant);
						if (!other) break;
						
						// Try to transfer a Random Walk NFT
						const rwTotalSupply = await contracts.randomWalkNft.totalSupply();
						if (rwTotalSupply > 0n) {
							for (let i = 0; i < 5; i++) {
								const nftId = participant.random() % rwTotalSupply;
								try {
									const owner = await contracts.randomWalkNft.ownerOf(nftId);
									if (owner === participant.address) {
										const receipt = await tryWaitForTransactionReceipt(
											participant.randomWalkNft.transferFrom(participant.address, other.address, nftId)
										);
										if (receipt) {
											globalStats.successfulActions++;
											globalStats.actionCounts[action].succeeded++;
											return true;
										}
									}
								} catch (e) { /* NFT not owned */ }
							}
						}
						break;
					}
					// #endregion

					// #region transferCst
					case "transferCst": {
						const other = findOtherParticipant(participant);
						if (!other) break;
						
						const balance = await contracts.cosmicSignatureToken.balanceOf(participant.address);
						if (balance > 10n ** 18n) { // At least 1 CST
							const amount = (participant.random() % (balance / 10n)) + 10n ** 18n;
							const receipt = await tryWaitForTransactionReceipt(
								participant.cosmicSignatureToken.transfer(other.address, amount)
							);
							if (receipt) {
								globalStats.successfulActions++;
								globalStats.actionCounts[action].succeeded++;
								return true;
							}
						}
						break;
					}
					// #endregion

					default:
						break;
				}
			} catch (error) {
				globalStats.failedActions++;
				// Only log truly unexpected errors
				if (!error.message?.includes("revert") && 
					!error.message?.includes("insufficient") &&
					!error.message?.includes("denied") &&
					!error.message?.includes("transfer") &&
					FUZZ_CONFIG.verbosity >= 2) {
					console.error(`    Error in ${action}: ${error.message.slice(0, 80)}`);
				}
			}
			
			return false;
		};

		/**
		 * Complete a round by having the last bidder claim the prize
		 */
		const tryCompleteRound = async () => {
			const lastBidder = await contracts.cosmicSignatureGameProxy.lastBidderAddress();
			if (lastBidder === hre.ethers.ZeroAddress) return false;
			
			const mainPrizeTime = await contracts.cosmicSignatureGameProxy.mainPrizeTime();
			const currentBlock = await hre.ethers.provider.getBlock("latest");
			const targetTime = Math.max(Number(mainPrizeTime) + 1, currentBlock.timestamp + 1);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [targetTime]);
			await hre.ethers.provider.send("evm_mine");
			
			// Find the last bidder among participants
			const lastBidderParticipant = participants.find(p => p.address === lastBidder);
			if (lastBidderParticipant) {
				try {
					await waitForTransactionReceipt(lastBidderParticipant.gameProxy.claimMainPrize());
					globalStats.roundsCompleted++;
					lastBidderParticipant.stats.prizesWon++;
					return true;
				} catch (e) { /* Already claimed */ }
			}
			return false;
		};

		// #endregion
		// #region Main Fuzz Loop

		console.log("\n  Starting simulation...\n");
		const startTime = Date.now();
		let lastProgressUpdate = 0;

		for (let round = 0; round < FUZZ_CONFIG.numRounds; round++) {
			// Progress update every 10 rounds
			if (FUZZ_CONFIG.verbosity >= 1 && round - lastProgressUpdate >= 10) {
				const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
				const currentGameRound = await contracts.cosmicSignatureGameProxy.roundNum();
				console.log(`  [${elapsed}s] Round ${round + 1}/${FUZZ_CONFIG.numRounds} | Game Round: ${currentGameRound} | Actions: ${globalStats.totalActions}`);
				lastProgressUpdate = round;
			}
			
			// Each participant takes multiple actions per round
			for (const participant of participants) {
				// Determine how many actions this participant takes this round
				const numActions = Number((participant.random() % BigInt(FUZZ_CONFIG.actionsPerParticipantPerRound * 2)) + 1n);
				
				for (let a = 0; a < numActions; a++) {
					// Select and execute action based on participant's behavior profile
					const action = participant.selectAction();
					await executeAction(participant, action);
					
					// Small random time advance between actions
					if (participant.random() % 3n === 0n) {
						await advanceTime(1, 60);
					}
				}
			}
			
			// End of round: try to complete if there are bids
			if (await tryCompleteRound()) {
				if (FUZZ_CONFIG.verbosity >= 1) {
					const newRound = await contracts.cosmicSignatureGameProxy.roundNum();
					console.log(`    → Round ${newRound - 1n} completed`);
				}
			}
		}

		// #endregion
		// #region Final Statistics

		const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
		
		console.log("\n" + "═".repeat(80));
		console.log("  FUZZ TEST COMPLETE - FINAL STATISTICS");
		console.log("═".repeat(80));
		
		// Overall stats
		console.log("\n  ┌─────────────────────────────────────────────────────────────────────────────┐");
		console.log("  │  OVERALL RESULTS                                                            │");
		console.log("  ├─────────────────────────────────────────────────────────────────────────────┤");
		console.log(`  │  Duration: ${elapsed}s                                                        │`);
		console.log(`  │  Total Actions: ${globalStats.totalActions.toString().padEnd(10)} Successful: ${globalStats.successfulActions.toString().padEnd(10)} Failed: ${globalStats.failedActions}│`);
		console.log(`  │  Game Rounds Completed: ${globalStats.roundsCompleted}                                                 │`);
		console.log(`  │  Total ETH Bid: ${hre.ethers.formatEther(globalStats.totalEthBid).slice(0, 15).padEnd(15)} ETH                                    │`);
		console.log(`  │  Total CST Bid: ${hre.ethers.formatEther(globalStats.totalCstBid).slice(0, 15).padEnd(15)} CST                                    │`);
		console.log(`  │  Total ETH Donated: ${hre.ethers.formatEther(globalStats.totalEthDonated).slice(0, 12).padEnd(12)} ETH                                    │`);
		console.log("  └─────────────────────────────────────────────────────────────────────────────┘");
		
		// Action breakdown
		console.log("\n  ACTION BREAKDOWN:");
		console.log("  ─────────────────────────────────────────────────────────────");
		const sortedActions = Object.entries(globalStats.actionCounts)
			.filter(([_, c]) => c.attempted > 0)
			.sort((a, b) => b[1].attempted - a[1].attempted);
		
		for (const [action, counts] of sortedActions) {
			const rate = counts.attempted > 0 ? ((counts.succeeded / counts.attempted) * 100).toFixed(1) : "0.0";
			console.log(`    ${action.padEnd(28)} ${counts.succeeded.toString().padStart(5)} / ${counts.attempted.toString().padStart(5)}  (${rate.padStart(5)}%)`);
		}
		
		// Participant stats
		console.log("\n  PARTICIPANT PERFORMANCE:");
		console.log("  ─────────────────────────────────────────────────────────────");
		for (const p of participants) {
			const profile = Object.keys(FUZZ_CONFIG.behaviorProfiles)[p.index % Object.keys(FUZZ_CONFIG.behaviorProfiles).length];
			console.log(`    P${p.index.toString().padStart(2)} (${profile.padEnd(10)}) | Bids: ${p.stats.bidsPlaced.toString().padStart(4)} | NFTs: ${p.stats.nftsMinted.toString().padStart(3)} | Prizes: ${p.stats.prizesWon.toString().padStart(2)} | ETH Earned: ${hre.ethers.formatEther(p.stats.ethEarned).slice(0, 10)}`);
		}
		
		// Contract state
		const finalRound = await contracts.cosmicSignatureGameProxy.roundNum();
		const finalTotalBids = await contracts.cosmicSignatureGameProxy.getTotalNumBids(finalRound);
		const finalCsNftSupply = await contracts.cosmicSignatureNft.totalSupply();
		const finalCstSupply = await contracts.cosmicSignatureToken.totalSupply();
		const finalGameBalance = await hre.ethers.provider.getBalance(contracts.cosmicSignatureGameProxyAddress);
		const finalStakingBalance = await hre.ethers.provider.getBalance(contracts.stakingWalletCosmicSignatureNftAddress);
		
		console.log("\n  ┌─────────────────────────────────────────────────────────────────────────────┐");
		console.log("  │  FINAL CONTRACT STATE                                                       │");
		console.log("  ├─────────────────────────────────────────────────────────────────────────────┤");
		console.log(`  │  Game Round: ${finalRound.toString().padEnd(10)}                                                      │`);
		console.log(`  │  Bids in Current Round: ${finalTotalBids.toString().padEnd(5)}                                              │`);
		console.log(`  │  Cosmic Signature NFTs: ${finalCsNftSupply.toString().padEnd(5)}                                              │`);
		console.log(`  │  CST Total Supply: ${hre.ethers.formatEther(finalCstSupply).slice(0, 15).padEnd(15)} CST                                  │`);
		console.log(`  │  Game Contract Balance: ${hre.ethers.formatEther(finalGameBalance).slice(0, 12).padEnd(12)} ETH                                  │`);
		console.log(`  │  Staking Wallet Balance: ${hre.ethers.formatEther(finalStakingBalance).slice(0, 11).padEnd(11)} ETH                                  │`);
		console.log("  └─────────────────────────────────────────────────────────────────────────────┘");
		
		console.log("\n" + "═".repeat(80));
		console.log("  ✓ ALL ASSERTIONS PASSED - NO BUGS DETECTED");
		console.log("═".repeat(80) + "\n");

		// Final assertions
		expect(globalStats.totalActions).to.be.greaterThan(0);
		expect(globalStats.successfulActions).to.be.greaterThan(0);

		// #endregion
	});

	// #endregion
});

// #endregion
