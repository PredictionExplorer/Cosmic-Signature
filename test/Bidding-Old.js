// todo-0 Move these tests to another file and delete this file.

"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { generateRandomUInt32 } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Bidding-Old", function () {


	// todo-0 check for `.not.reverted`.
	it("The getDurationUntilRoundActivation and getDurationElapsedSinceRoundActivation methods behave correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {contracts_.ownerAcct, contracts_.cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		// todo-0 delete>>>// Comment-202501192 applies.
		// todo-0 delete>>>await hre.ethers.provider.send("evm_mine");

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		const newRoundActivationTime_ = latestBlock_.timestamp + 2;
		await contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setRoundActivationTime(newRoundActivationTime_);

		for ( let counter_ = -1; counter_ <= 1; ++ counter_ ) {
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(newRoundActivationTime_ + counter_);
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			expect(durationUntilRoundActivation_).equal( - counter_ );
			const durationElapsedSinceRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationElapsedSinceRoundActivation();
			expect(durationElapsedSinceRoundActivation_).equal(counter_);
			await hre.ethers.provider.send("evm_mine");
		}
	});

	// todo-0 check for `.not.reverted`.
	it("The receive method is executing a bid", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, contracts_.cosmicSignatureGameProxy, contracts_.cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [contracts_.signers[0], contracts_.signers[1],] = signers;

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.signers[1].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddr, value: nextEthBidPrice_,})).not.reverted;
		const nextEthBidPriceAfter_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		expect(nextEthBidPriceAfter_).greaterThan(nextEthBidPrice_);
	});

	// todo-0 check for `.not.reverted`.
	it("Bidding a lot and staking a lot behaves correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {contracts_.ownerAcct, signers, contracts_.cosmicSignatureGameProxy, cosmicSignatureNft, stakingWalletCosmicSignatureNft, stakingWalletCosmicSignatureNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [contracts_.signers[0], contracts_.signers[1], contracts_.signers[2], contracts_.signers[3], contracts_.signers[4], contracts_.signers[5],] = signers;

		// ToDo-202411202-1 applies.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setDelayDurationBeforeRoundActivation(0n)).not.reverted;

		let nextEthBidPrice_;
		let durationUntilMainPrize_;
		for ( let counter_ = 0; counter_ < 30; ++ counter_ ) {
			await hre.ethers.provider.send("evm_increaseTime", [counter_ * 60 * 60]);
			await hre.ethers.provider.send("evm_mine");
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
			durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).not.reverted;
		}
		let transactionResponse_, transactionReceipt_, log, parsed_log;
		let topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		let ts = await cosmicSignatureNft.totalSupply();
		// let rn = await contracts_.cosmicSignatureGameProxy.roundNum();
		const tokensByStaker = {};
		const stakeActionIds_ = [];
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignatureNft.ownerOf(i);
			let owner_signer = await hre.ethers.getSigner(ownr);
			let userTokens = tokensByStaker[ownr];
			if (userTokens == undefined) {
				await expect(cosmicSignatureNft.connect(owner_signer).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true)).not.reverted;
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			transactionResponse_ = await stakingWalletCosmicSignatureNft.connect(owner_signer).stake(i);
			transactionReceipt_ = await transactionResponse_.wait();
			log = transactionReceipt_.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
			// console.log(log.args.stakeActionId);
			stakeActionIds_.push(log.args.stakeActionId);
		}
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth((-1n), "", {value: nextEthBidPrice_})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();

		// We need another time increase to claim as `contracts_.signers[5]` (it has no bids, won't get raffle NFTs).
		const durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilTimeoutTimeToClaimMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let totSupBefore = await cosmicSignatureNft.totalSupply();
		transactionResponse_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[5]).claimMainPrize();
		transactionReceipt_ = await transactionResponse_.wait();
		topic_sig = contracts_.cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerCosmicSignatureNftAwarded").topicHash;
		let raffle_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));

		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = contracts_.cosmicSignatureGameProxy.interface.parseLog(raffle_logs[i]);
			// let winnerAddress_ = rlog.args.winnerAddress;
			// let ownr = await cosmicSignatureNft.ownerOf(rlog.args.prizeCosmicSignatureNftId);
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(rlog.args.prizeCosmicSignatureNftId);
			// expect(stakerAddr).equal("0x0000000000000000000000000000000000000000");
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.usedNfts(rlog.args.prizeCosmicSignatureNftId);
			expect(nftWasUsed_).equal(0n);
		}

		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignatureNft.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(i);
			// if (stakerAddr == "0x0000000000000000000000000000000000000000") {
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.usedNfts(i);
			if (nftWasUsed_ == 0n) {
				let ownr = await cosmicSignatureNft.ownerOf(i);
				let userTokens = tokensByStaker[ownr];
				if (userTokens == undefined) {
					userTokens = [];
				}
				userTokens.push(i);
				tokensByStaker[ownr] = userTokens;
				if (i >= Number(totSupBefore)) {
					// this is new NFT, it is not staked yet
					continue;
				}
			}
			// let isStaked = await stakingWalletCosmicSignatureNft.isTokenStaked(i);
			// expect(isStaked).equal(true);
			// let lastActionId = await stakingWalletCosmicSignatureNft.lastActionIdByTokenId(i);
			let lastActionId = stakeActionIds_[i];
			// todo-1 Why do we convert this to `Number`? Review all conversions like this.
			lastActionId = Number(lastActionId);
			// if (lastActionId < 0) {
			if (lastActionId <= 0) {
				throw "Invalid action id " + lastActionId;
			}
			// let stakeActionRecord = await stakingWalletCosmicSignatureNft.stakeActions(lastActionId);
			// expect(stakeActionRecord.nftOwnerAddress).equal(stakerAddr);
		}

		// todo-1 This is probably no longer needed. At least comment.
		await hre.ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let num_actions;
		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
			let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
			// todo-1 It's probably unnecessary to call `toObject`.
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await hre.ethers.provider.send("evm_increaseTime", [100]);
			// await hre.ethers.provider.send("evm_mine");
			// await expect(stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(i)).not.reverted;
			await expect(stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(stakeActionIds_[i])).not.reverted;
		}

		// at this point, all NFTs were unstaked

		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(num_actions).equal(0);
		// for (let i = 0; i < Number(num_actions); i++) {
		// 	// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
		// 	let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
		// 	// todo-1 It's probably unnecessary to call `toObject`.
		// 	action_rec = action_rec.toObject();
		// 	let ownr = action_rec.nftOwnerAddress;
		// 	let num_deposits = await stakingWalletCosmicSignatureNft.numEthDeposits();
		// 	let owner_signer = await hre.ethers.getSigner(ownr);
		// 	for (let j = 0; j < Number(num_deposits); j++) {
		// 		let deposit_rec = await stakingWalletCosmicSignatureNft.ethDeposits(j);
		// 		// await expect(stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([i], [j])).not.reverted;
		// 		await expect(stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([stakeActionIds_[i]], [j])).not.reverted;
		// 	}
		// }

		// // Comment-202409209 applies.
		// const contractBalance = await hre.ethers.provider.getBalance(stakingWalletCosmicSignatureNftAddr);
		// const m = await stakingWalletCosmicSignatureNft.modulo();
		// expect(m).equal(contractBalance);

		// check that every staker has its own NFTs back
		for (let user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignatureNft.ownerOf(userTokens[i]);
				expect(o).equal(user);
			}
		}
	});

	// todo-0 Eventually delete this test.
	// todo-0 It's currently failing, and that's OK.
	//
	// This is a stress test that executes multiple transactions per block.
	//
	// Discussion: https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1739909248214549
	//
	// todo-1 It would be nice to validate that the behavior is correct.
	//
	// todo-1 Add `claimMainPrize` calls.
	//
	// todo-1 Arbitrum mines 4 blocks per second with equal timestamps. Try to test that.
	// todo-1 There is the `allowBlocksWithSameTimestamp` parameter, but setting it would make all blocks having the same timestamp,
	// todo-1 which would break all tests and other scripts. It appears to be impossible to change it temporarily at runtime.
	// 
	// todo-1 Maybe refactor this to mine 1 transaction per block. Then Chai matchers will work to correctly show
	// todo-1 what caused transaction reversal. They re-execute the transaction in simulation to find out what went wrong.
	// todo-1 Then just review then Solidity code to make sure that
	// todo-1 regardless if `block.timestamp` or `block.number` change or don't change, the behavior will be correct.
	//
	// todo-1 Nick wrote:
	// todo-1 As this is not really a unit test anymore, but an integration test, it should be done as standalone script
	// todo-1 (and maybe go in "scripts" directory, and probably in its own folder) .
	// todo-1 So you could run it over local-chain geth instance
	// todo-1 with its own genesis.json and account balances for this particular test.
	it("Long-term aggressive bidding behaves correctly", async function () {
		if (SKIP_LONG_TESTS) return;

		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {
			signers,
			cosmicSignatureToken,
			contracts_.cosmicSignatureGameProxy,
		} = await loadFixture(deployContractsForUnitTesting);
		
		// todo-0 delete>>>// Comment-202501192 applies.
		// todo-0 delete>>>await hre.ethers.provider.send("evm_mine");

		// {
		// 	let latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_increaseTime", [0]);
		// 	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [latestBlockTimeStamp]);
		// 	await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	console.log();
		// }

		const transactions = [];
		let randomNumber;

		const mineBlockIfNeeded = async (force) => {
			let timeIncrease = force ? 1 : ((randomNumber & 0xFF) - 0xB0);
			if (timeIncrease > 0) {
				if (timeIncrease >= 10) {
					timeIncrease *= 40;
				}
				if (timeIncrease > 1) {
					await hre.ethers.provider.send("evm_increaseTime", [timeIncrease]);
				}

				// todo-1 Bug. Even if `timeIncrease` is zero the next block timestamp will still be incremented.
				// todo-1 Sending "evm_increaseTime" of zero won't help.
				await hre.ethers.provider.send("evm_mine");

				let errorDetails;
				for (const transaction of transactions) {
					try {
						// console.log(transaction);

						// // todo-1 This can throw an error, but the error doesn't appear to contain usable info on what caused the error.
						// await transaction.wait();

						// await expect(transaction).not.reverted;
						// await expect(transaction).fulfilled;

						// We are going to also be OK with the transaction not reverting.
						// todo-1 This fails to detect the actual error, if any, and always throws that the transaction didn't revert,
						// todo-1 probably for the same reason `transaction.wait` doesn't throw a usable error.
						await expect(transaction).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

						// console.log("Success 1.", transactions.length);
					} catch (error2Details) { // todo-1 Rename `error2Details` to `error2Object`?
						// console.log("Error.", transactions.length);

						// console.log();
						// console.log(error2Details.message);
						// console.log(error2Details);

						// // ChatGPT recommended this approach, but it doesn't work.
						// const revertData = error2Details.data;
						// // const revertData = error2Details;
						// if (revertData) {
						// 	const decodedError = contracts_.cosmicSignatureGameProxy.interface.parseError(revertData);
						// 	console.log("Custom Error Name:", decodedError.name);
						// } else {
						// 	console.error("Error data not found.");
						// }

						if (error2Details.message.endsWith(", but it didn't revert")) {
							// console.log("Success 2.", transactions.length);
						} else if ( errorDetails == undefined ||
										errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") &&
										( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )
									) {
							errorDetails = error2Details;
						}
					}
				}
				transactions.length = 0;
				if (errorDetails != undefined) {
					// console.log(errorDetails.message);
					throw errorDetails;
				}
			}
		};

		await hre.ethers.provider.send("evm_setAutomine", [false]);
		try {
			// This loop will keep spinning until an error is thrown due to a signer running out of ETH,
			// or any other error.
			for ( let counter = 0; /*counter < 300*/; ++ counter ) {
				randomNumber = generateRandomUInt32();
				const signer = signers[(randomNumber & 0xFFFF) % signers.length];
				// if ((counter & 0xFF) == 0) {
				// 	console.log((
				// 		await hre.ethers.provider.getBlock("latest")).timestamp,
				// 		((await hre.ethers.provider.getBalance(signer.address)) + 10n ** 18n / 2n) / (10n ** 18n),
				// 		Number(await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n)) / (10 ** 18)
				// 	);
				// }
				let transactionQueued = false;
				if (await contracts_.cosmicSignatureGameProxy.lastBidderAddress() != hre.ethers.ZeroAddress) {
					const cstBalanceAmount_ = await cosmicSignatureToken.balanceOf(signer.address);
					const nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);

					// [Comment-202502193]
					// This is (likely) going to be enough for each of up to 2 CST bids. Further bids within the same block will (likely) fail.
					// [/Comment-202502193]
					// todo-0 Magic numbe hardcoded.
					const nextCstBidPrice2_ = nextCstBidPrice_ * 2n;

					if (cstBalanceAmount_ >= nextCstBidPrice2_) {
						transactions.push(await contracts_.cosmicSignatureGameProxy.connect(signer).bidWithCst(nextCstBidPrice2_, "", {gasLimit: 450_000}));
						transactionQueued = true;
					}
				}
				if ( ! transactionQueued ) {
					const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
					// const nextEthBidPrice2_ = 11n;

					// [Comment-202502191]
					// This is going to be enough for each of up to 4 ETH bids. Further bids within the same block will fail.
					// [/Comment-202502191]
					const nextEthBidPrice2_ = nextEthBidPrice_ * 1041n / 1000n;

					transactions.push(await contracts_.cosmicSignatureGameProxy.connect(signer).bidWithEth((-1n), "", {value: nextEthBidPrice2_, gasLimit: 450_000}));
				}
				randomNumber >>= 16;
				await mineBlockIfNeeded(false);
			}
		} catch (errorDetails) { // todo-1 Rename `errorDetails` to `errorObject`?
			// console.log(errorDetails.message);
			let error2Details;
			try {
				// Mining whatever was queued.
				await mineBlockIfNeeded(true);
			} catch (error2Details2) { // todo-1 Rename `error2Details2` to `error2Object2`?
				error2Details = error2Details2;
			}
			await hre.ethers.provider.send("evm_setAutomine", [true]);
			if ( ! errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") ) {
				throw errorDetails;
			}
			if (error2Details != undefined && ( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )) {
				throw error2Details;
			}
		}
	});
});
