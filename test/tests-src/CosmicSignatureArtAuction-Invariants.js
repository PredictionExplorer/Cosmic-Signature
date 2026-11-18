"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
	productionFixture, registerBatch, MINIMUM_BID, AUCTION_DURATION, EXTENSION_DURATION, TRANSACTION_OPTIONS,
} = require("../src/ArtAuctionTestHelpers.js");

/** Independent deterministic integer model; failed transactions must leave it and on-chain state unchanged. */
function createModel(seed_) {
	let randomState_ = BigInt(seed_) & 0xffffffffn;
	return {
		lots: [],
		credits: new Map(),
		deposits: 0n,
		refundsPaid: 0n,
		saleProceedsPaid: 0n,
		forcedEth: 0n,
		surplusPaid: 0n,
		gameRejects: false,
		random(limit_) {
			randomState_ = (randomState_ * 1664525n + 1013904223n) & 0xffffffffn;
			return Number(randomState_ % BigInt(limit_));
		},
	};
}

function minimumBid(lot_) {
	// Arithmetic differs from Solidity's quotient-plus-remainder implementation.
	return lot_.amount === 0n ? lot_.openingBid : (lot_.amount * 11n + 9n) / 10n;
}

async function addBatch(contracts_, model_) {
	const roundNum_ = BigInt(model_.lots.length / 8);
	const openingBid_ = MINIMUM_BID + BigInt(model_.random(5000));
	await (await contracts_.game.setArtAuctionOpeningBid(openingBid_)).wait();
	const batch_ = await registerBatch(contracts_, roundNum_);
	for (let index_ = 0n; index_ < 8n; ++index_) {
		model_.lots.push({
			nftId: batch_.firstNftId + index_, openingBid: openingBid_, roundNum: roundNum_, eligibleAt: batch_.eligibleAt,
			endAt: 0n, bidder: hre.ethers.ZeroAddress, amount: 0n, settled: false,
			delivered: false, forwarded: false, recipient: contracts_.auctionAddress,
		});
	}
}

/** @param {ReturnType<typeof createModel>} model_ */
async function verifyModel(contracts_, model_, context_) {
	const reads_ = await Promise.all(model_.lots.map(async lot_ => ({
		lot: lot_, auction: await contracts_.auction.getAuction(lot_.nftId), owner: await contracts_.nft.ownerOf(lot_.nftId),
	})));
	let bidEscrow_ = 0n;
	let pendingProceeds_ = 0n;
	for (const { lot: lot_, auction: auction_, owner: owner_ } of reads_) {
		expect(auction_.registered, context_).equal(true);
		expect(auction_.roundNum, context_).equal(lot_.roundNum);
		expect(auction_.eligibleAt, context_).equal(lot_.eligibleAt);
		expect(auction_.endAt, context_).equal(lot_.endAt);
		expect(auction_.highestBidder, context_).equal(lot_.bidder);
		expect(auction_.highestBid, context_).equal(lot_.amount);
		expect(auction_.settled, context_).equal(lot_.settled);
		expect(auction_.delivered, context_).equal(lot_.delivered);
		expect(auction_.proceedsForwarded, context_).equal(lot_.forwarded);
		expect(owner_, context_).equal(lot_.recipient);
		if (!lot_.settled) bidEscrow_ += lot_.amount;
		else if (!lot_.forwarded) pendingProceeds_ += lot_.amount;
	}
	let refundCredits_ = 0n;
	for (const signer_ of contracts_.signers.slice(1, 5)) {
		const expected_ = model_.credits.get(signer_.address) ?? 0n;
		expect(await contracts_.auction.refundCredits(signer_.address), context_).equal(expected_);
		refundCredits_ += expected_;
	}
	const surplus_ = model_.forcedEth - model_.surplusPaid;
	const liabilities_ = bidEscrow_ + refundCredits_ + pendingProceeds_;
	const balance_ = await hre.ethers.provider.getBalance(contracts_.auctionAddress);
	expect(await contracts_.auction.totalBidEscrow(), context_).equal(bidEscrow_);
	expect(await contracts_.auction.totalRefundCredits(), context_).equal(refundCredits_);
	expect(await contracts_.auction.totalPendingProceeds(), context_).equal(pendingProceeds_);
	expect(await contracts_.auction.totalLiabilities(), context_).equal(liabilities_);
	expect(balance_, context_).equal(liabilities_ + surplus_);
	expect(balance_, context_).equal(model_.deposits + model_.forcedEth - model_.refundsPaid - model_.saleProceedsPaid - model_.surplusPaid);
	expect(await contracts_.game.totalDonations(), context_).equal(model_.saleProceedsPaid + model_.surplusPaid);
	expect(await contracts_.game.receiveCount(), context_).equal(0n);
	expect(await contracts_.auction.registeredBatchCount(), context_).equal(BigInt(model_.lots.length / 8));
}

describe("CosmicSignatureArtAuction-Invariants", function () {
	const seeds_ = process.env.AUCTION_FUZZ_SEED ? [BigInt(process.env.AUCTION_FUZZ_SEED)] : [42161n, 0xc05c1cn, 0xdeadbeefn, 0x71a5b3d9n];
	for (const seed_ of seeds_) {
		it(`matches a stateful model across funded actions and failures (seed ${seed_.toString(16)})`, async function () {
			const contracts_ = await loadFixture(productionFixture);
			const model_ = createModel(seed_);
			const bidders_ = contracts_.signers.slice(1, 5);
			await addBatch(contracts_, model_);
			await addBatch(contracts_, model_);
			await time.increaseTo(model_.lots.at(-1).eligibleAt);
			const steps_ = 180;
			for (let step_ = 0; step_ < steps_; ++step_) {
				if (step_ === 60) await addBatch(contracts_, model_);
				const lot_ = model_.lots[model_.random(model_.lots.length)];
				const bidder_ = bidders_[model_.random(bidders_.length)];
				const action_ = model_.random(100);
				const context_ = `seed=0x${seed_.toString(16)} step=${step_} action=${action_} token=${lot_.nftId}`;
				try {
					if (action_ < 45) {
						const timestamp_ = BigInt(await time.latest()) + 1n;
						const minimum_ = minimumBid(lot_);
						let amount_ = minimum_ + BigInt(model_.random(4)) * MINIMUM_BID;
						const badPrice_ = model_.random(8) === 0;
						if (badPrice_) amount_ = minimum_ - 1n;
						let value_ = bidder_.address === lot_.bidder ? amount_ - lot_.amount : amount_;
						const badValue_ = model_.random(8) === 0;
						if (badValue_) ++value_;
						await time.setNextBlockTimestamp(timestamp_);
						const transaction_ = contracts_.auction.connect(bidder_).bid(lot_.nftId, amount_, { ...TRANSACTION_OPTIONS, value: value_ });
						const expectedError_ = timestamp_ < lot_.eligibleAt ? "AuctionNotEligible" :
							lot_.endAt !== 0n && timestamp_ >= lot_.endAt ? "AuctionEnded" :
							badPrice_ ? "BidTooLow" : badValue_ ? "IncorrectBidFunding" : null;
						if (expectedError_) {
							await expect(transaction_).revertedWithCustomError(contracts_.auction, expectedError_);
						} else {
							await (await transaction_).wait();
							if (lot_.bidder !== hre.ethers.ZeroAddress && lot_.bidder !== bidder_.address) {
								model_.credits.set(lot_.bidder, (model_.credits.get(lot_.bidder) ?? 0n) + lot_.amount);
							}
							model_.deposits += value_;
							if (lot_.endAt === 0n) lot_.endAt = timestamp_ + AUCTION_DURATION;
							else if (lot_.endAt - timestamp_ < EXTENSION_DURATION) lot_.endAt = timestamp_ + EXTENSION_DURATION;
							lot_.bidder = bidder_.address;
							lot_.amount = amount_;
						}
					} else if (action_ < 60) {
						await time.increase(BigInt(model_.random(86400) + 1));
					} else if (action_ < 70) {
						const timestamp_ = BigInt(await time.latest()) + 1n;
						await time.setNextBlockTimestamp(timestamp_);
						const transaction_ = contracts_.auction.connect(bidder_).settle(lot_.nftId, TRANSACTION_OPTIONS);
						const expectedError_ = lot_.settled ? "AuctionAlreadySettled" : lot_.endAt === 0n ? "AuctionNotStarted" : timestamp_ < lot_.endAt ? "AuctionNotEnded" : null;
						if (expectedError_) await expect(transaction_).revertedWithCustomError(contracts_.auction, expectedError_);
						else { await (await transaction_).wait(); lot_.settled = true; }
					} else if (action_ < 80) {
						const credit_ = model_.credits.get(bidder_.address) ?? 0n;
						const transaction_ = contracts_.auction.connect(bidder_).withdrawRefund(contracts_.signers[5].address, TRANSACTION_OPTIONS);
						if (credit_ === 0n) await expect(transaction_).revertedWithCustomError(contracts_.auction, "NoRefundCredit");
						else {
							await (await transaction_).wait();
							model_.credits.set(bidder_.address, 0n);
							model_.refundsPaid += credit_;
						}
					} else if (action_ < 88) {
						const winner_ = bidders_.find(signer_ => signer_.address === lot_.bidder);
						const caller_ = winner_ && model_.random(3) !== 0 ? winner_ : bidder_;
						const recipient_ = contracts_.signers[5 + model_.random(2)].address;
						const transaction_ = contracts_.auction.connect(caller_).claimNft(lot_.nftId, recipient_, TRANSACTION_OPTIONS);
						const expectedError_ = !lot_.settled ? "AuctionNotSettled" : caller_.address !== lot_.bidder ? "OnlyWinner" : lot_.delivered ? "NftAlreadyDelivered" : null;
						if (expectedError_) await expect(transaction_).revertedWithCustomError(contracts_.auction, expectedError_);
						else { await (await transaction_).wait(); lot_.delivered = true; lot_.recipient = recipient_; }
					} else if (action_ < 95) {
						model_.gameRejects = model_.random(4) === 0;
						await (await contracts_.game.setRejectDonations(model_.gameRejects)).wait();
						const transaction_ = contracts_.auction.connect(bidder_).forwardProceeds(lot_.nftId, TRANSACTION_OPTIONS);
						const expectedError_ = !lot_.settled ? "AuctionNotSettled" : lot_.forwarded ? "ProceedsAlreadyForwarded" : model_.gameRejects ? "DonationRejected" : null;
						if (expectedError_) await expect(transaction_).revertedWithCustomError(expectedError_ === "DonationRejected" ? contracts_.game : contracts_.auction, expectedError_);
						else { await (await transaction_).wait(); lot_.forwarded = true; model_.saleProceedsPaid += lot_.amount; }
					} else {
						const amount_ = BigInt(model_.random(1000) + 1);
						const force_ = await (await hre.ethers.getContractFactory("ArtAuctionTestForcedEth")).deploy(contracts_.auctionAddress, { value: amount_ });
						await force_.waitForDeployment();
						model_.forcedEth += amount_;
						const transaction_ = contracts_.auction.forwardSurplus(TRANSACTION_OPTIONS);
						if (model_.gameRejects) await expect(transaction_).revertedWithCustomError(contracts_.game, "DonationRejected");
						else { await (await transaction_).wait(); model_.surplusPaid = model_.forcedEth; }
					}
					await verifyModel(contracts_, model_, context_);
				} catch (error_) {
					error_.message = `${context_}\n${error_.message}`;
					throw error_;
				}
			}

			// Drain every valid liability after randomized interleavings; unbid lots remain available.
			await (await contracts_.game.setRejectDonations(false)).wait();
			model_.gameRejects = false;
			await time.increase(30n * 86400n);
			for (const lot_ of model_.lots) {
				if (lot_.amount === 0n) continue;
				if (!lot_.settled) { await (await contracts_.auction.settle(lot_.nftId)).wait(); lot_.settled = true; }
				if (!lot_.forwarded) {
					await (await contracts_.auction.forwardProceeds(lot_.nftId)).wait();
					lot_.forwarded = true; model_.saleProceedsPaid += lot_.amount;
				}
				if (!lot_.delivered) {
					const winner_ = bidders_.find(signer_ => signer_.address === lot_.bidder);
					await (await contracts_.auction.connect(winner_).claimNft(lot_.nftId, winner_.address)).wait();
					lot_.delivered = true; lot_.recipient = winner_.address;
				}
			}
			for (const bidder_ of bidders_) {
				const credit_ = model_.credits.get(bidder_.address) ?? 0n;
				if (credit_ === 0n) continue;
				await (await contracts_.auction.connect(bidder_).withdrawRefund(bidder_.address)).wait();
				model_.credits.set(bidder_.address, 0n); model_.refundsPaid += credit_;
			}
			if (model_.forcedEth > model_.surplusPaid) {
				await (await contracts_.auction.forwardSurplus()).wait();
				model_.surplusPaid = model_.forcedEth;
			}
			await verifyModel(contracts_, model_, `seed=0x${seed_.toString(16)} final drain`);
			expect(await contracts_.auction.totalLiabilities()).equal(0n);
			expect(await hre.ethers.provider.getBalance(contracts_.auctionAddress)).equal(0n);
		});
	}
});
