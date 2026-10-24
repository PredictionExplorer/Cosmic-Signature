"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MINIMUM_BID = 10n ** 13n;
const ELIGIBILITY_DELAY = 7n * 24n * 60n * 60n;
const AUCTION_DURATION = 48n * 60n * 60n;
const EXTENSION_DURATION = 600n;
const TRANSACTION_OPTIONS = { gasLimit: 5_000_000n };

async function deployAuctionFixture(useHostileNft_ = false) {
	const signers_ = await hre.ethers.getSigners();
	const game_ = await (await hre.ethers.getContractFactory("ArtAuctionTestGame")).deploy();
	await game_.waitForDeployment();
	const nft_ = await (await hre.ethers.getContractFactory(useHostileNft_ ? "ArtAuctionTestNft" : "CosmicSignatureNft"))
		.deploy(await game_.getAddress());
	await nft_.waitForDeployment();
	await (await game_.setNft(await nft_.getAddress())).wait();
	const auction_ = await (await hre.ethers.getContractFactory("CosmicSignatureArtAuction"))
		.deploy(await game_.getAddress(), await nft_.getAddress());
	await auction_.waitForDeployment();
	const actor_ = await (await hre.ethers.getContractFactory("ArtAuctionTestActor")).deploy();
	await actor_.waitForDeployment();
	const auctionAddress_ = await auction_.getAddress();
	const actorAddress_ = await actor_.getAddress();
	return { signers: signers_, game: game_, nft: nft_, auction: auction_, actor: actor_, auctionAddress: auctionAddress_, actorAddress: actorAddress_ };
}

async function productionFixture() {
	return deployAuctionFixture(false);
}

async function hostileNftFixture() {
	return deployAuctionFixture(true);
}

async function registerBatch(contracts_, roundNum_ = 0n) {
	const firstNftId_ = await contracts_.nft.totalSupply();
	const receipt_ = await (await contracts_.game.mintAndRegister(contracts_.auctionAddress, roundNum_, 123n)).wait();
	const timestamp_ = BigInt((await hre.ethers.provider.getBlock(receipt_.blockNumber)).timestamp);
	return { firstNftId: firstNftId_, timestamp: timestamp_, eligibleAt: timestamp_ + ELIGIBILITY_DELAY };
}

async function registeredFixture() {
	const contracts_ = await productionFixture();
	return { ...contracts_, ...await registerBatch(contracts_) };
}

async function eligibleFixture() {
	const contracts_ = await registeredFixture();
	await time.increaseTo(contracts_.eligibleAt);
	return contracts_;
}

async function placeBid(contracts_, signer_, nftId_, totalBid_, value_ = totalBid_) {
	return (await contracts_.auction.connect(signer_).bid(nftId_, totalBid_, { ...TRANSACTION_OPTIONS, value: value_ })).wait();
}

async function settleFirstLot(contracts_, signer_ = contracts_.signers[1]) {
	await placeBid(contracts_, signer_, 0n, MINIMUM_BID);
	await time.increaseTo((await contracts_.auction.getAuction(0n)).endAt);
	await (await contracts_.auction.settle(0n)).wait();
}

async function expectSolvent(contracts_, expectedBidEscrow_, expectedRefunds_, expectedPending_, expectedSurplus_ = 0n) {
	expect(await contracts_.auction.totalBidEscrow()).equal(expectedBidEscrow_);
	expect(await contracts_.auction.totalRefundCredits()).equal(expectedRefunds_);
	expect(await contracts_.auction.totalPendingProceeds()).equal(expectedPending_);
	const liabilities_ = expectedBidEscrow_ + expectedRefunds_ + expectedPending_;
	expect(await contracts_.auction.totalLiabilities()).equal(liabilities_);
	expect(await hre.ethers.provider.getBalance(contracts_.auctionAddress)).equal(liabilities_ + expectedSurplus_);
}

/** Exercises real V4-issued inventory without changing the game's participation state. */
async function exerciseV4AuctionLifecycle(game_, nft_, auction_, firstNftId_, eligibleAt_, signers_, snapshotGame_) {
	const [firstBidder_, winner_, lateBidder_, recipient_, settler_] = signers_.slice(1, 6);
	const auctionAddress_ = await auction_.getAddress();
	const gameAddress_ = await game_.getAddress();
	const contracts_ = { auction: auction_, auctionAddress: auctionAddress_ };
	const stateBefore_ = await snapshotGame_();
	const reserveBefore_ = await hre.ethers.provider.getBalance(gameAddress_);
	const supplyBefore_ = await nft_.totalSupply();
	const transactions_ = [];
	async function record_(label_, transaction_) {
		const receipt_ = await (await transaction_).wait();
		transactions_.push({ action: label_, hash: receipt_.hash, gasUsed: receipt_.gasUsed.toString() });
		return receipt_;
	}
	async function refund_(bidder_, amount_) {
		expect(await auction_.refundCredits(bidder_.address)).equal(amount_);
		const before_ = await hre.ethers.provider.getBalance(recipient_.address);
		await record_("refund", auction_.connect(bidder_).withdrawRefund(recipient_.address));
		expect(await hre.ethers.provider.getBalance(recipient_.address)).equal(before_ + amount_);
		expect(await auction_.refundCredits(bidder_.address)).equal(0n);
	}
	async function forward_(tokenId_, amount_) {
		const before_ = await hre.ethers.provider.getBalance(gameAddress_);
		const receipt_ = await record_("forward-proceeds", auction_.connect(settler_).forwardProceeds(tokenId_));
		expect(await hre.ethers.provider.getBalance(gameAddress_)).equal(before_ + amount_);
		expect(await snapshotGame_()).deep.equal(stateBefore_);
		const events_ = receipt_.logs.filter(log_ => log_.address.toLowerCase() === gameAddress_.toLowerCase())
			.map(log_ => game_.interface.parseLog(log_));
		expect(events_.filter(event_ => event_?.name === "BidPlaced")).empty;
		const contribution_ = events_.find(event_ => event_?.name === "EthDonated");
		expect(contribution_?.args.donorAddress).equal(auctionAddress_);
		expect(contribution_.args.amount).equal(amount_);
		return receipt_;
	}

	expect(await auction_.game()).equal(gameAddress_);
	expect(await auction_.nft()).equal(await nft_.getAddress());
	expect(await nft_.ownerOf(firstNftId_)).equal(auctionAddress_);
	await expect(auction_.connect(firstBidder_).bid.staticCall(firstNftId_, MINIMUM_BID, { value: MINIMUM_BID }))
		.revertedWithCustomError(auction_, "AuctionNotEligible");
	await time.setNextBlockTimestamp(eligibleAt_);
	const opening_ = await record_("first-bid", auction_.connect(firstBidder_).bid(firstNftId_, MINIMUM_BID, { value: MINIMUM_BID }));
	const originalEnd_ = eligibleAt_ + AUCTION_DURATION;
	expect(BigInt((await opening_.getBlock()).timestamp)).equal(eligibleAt_);
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(originalEnd_);
	await expectSolvent(contracts_, MINIMUM_BID, 0n, 0n);

	const earlyBid_ = await auction_.minimumNextBid(firstNftId_);
	await record_("early-outbid", auction_.connect(winner_).bid(firstNftId_, earlyBid_, { value: earlyBid_ }));
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(originalEnd_);
	await expectSolvent(contracts_, earlyBid_, MINIMUM_BID, 0n);
	await refund_(firstBidder_, MINIMUM_BID);
	await expectSolvent(contracts_, earlyBid_, 0n, 0n);

	const jumpBid_ = 100n * 10n ** 18n;
	await expect(auction_.connect(winner_).bid.staticCall(firstNftId_, jumpBid_, { value: jumpBid_ }))
		.revertedWithCustomError(auction_, "IncorrectBidFunding");
	await record_("self-raise-to-100-eth", auction_.connect(winner_).bid(firstNftId_, jumpBid_, { value: jumpBid_ - earlyBid_ }));
	expect(await auction_.refundCredits(winner_.address)).equal(0n);
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(originalEnd_);
	await expectSolvent(contracts_, jumpBid_, 0n, 0n);

	// A bid exactly ten minutes before closing preserves the deadline; a later bid restores ten minutes.
	await time.setNextBlockTimestamp(originalEnd_ - EXTENSION_DURATION);
	const boundaryBid_ = await auction_.minimumNextBid(firstNftId_);
	await record_("ten-minute-boundary-bid", auction_.connect(lateBidder_).bid(firstNftId_, boundaryBid_, { value: boundaryBid_ }));
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(originalEnd_);
	await expectSolvent(contracts_, boundaryBid_, jumpBid_, 0n);
	await time.setNextBlockTimestamp(originalEnd_ - 590n);
	const firstLateBid_ = await auction_.minimumNextBid(firstNftId_);
	await record_("late-self-raise", auction_.connect(lateBidder_).bid(firstNftId_, firstLateBid_, { value: firstLateBid_ - boundaryBid_ }));
	const firstExtendedEnd_ = originalEnd_ + 10n;
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(firstExtendedEnd_);
	await expectSolvent(contracts_, firstLateBid_, jumpBid_, 0n);
	await time.setNextBlockTimestamp(firstExtendedEnd_ - 1n);
	const winningPayment_ = await auction_.minimumNextBid(firstNftId_);
	await record_("repeated-late-outbid", auction_.connect(winner_).bid(firstNftId_, winningPayment_, { value: winningPayment_ }));
	const finalEnd_ = firstExtendedEnd_ - 1n + EXTENSION_DURATION;
	expect((await auction_.getAuction(firstNftId_)).endAt).equal(finalEnd_);
	await expectSolvent(contracts_, winningPayment_, jumpBid_ + firstLateBid_, 0n);
	expect(await hre.ethers.provider.getBalance(gameAddress_)).equal(reserveBefore_);
	await expect(auction_.connect(settler_).settle.staticCall(firstNftId_)).revertedWithCustomError(auction_, "AuctionNotEnded");

	await time.setNextBlockTimestamp(finalEnd_);
	await record_("permissionless-settle", auction_.connect(settler_).settle(firstNftId_));
	await expect(auction_.connect(firstBidder_).bid.staticCall(firstNftId_, winningPayment_ * 2n, { value: winningPayment_ * 2n }))
		.revertedWithCustomError(auction_, "AuctionEnded");
	await expectSolvent(contracts_, 0n, jumpBid_ + firstLateBid_, winningPayment_);
	expect(await nft_.ownerOf(firstNftId_)).equal(auctionAddress_);
	expect(await hre.ethers.provider.getBalance(gameAddress_)).equal(reserveBefore_);
	await expect(auction_.connect(settler_).claimNft.staticCall(firstNftId_, settler_.address)).revertedWithCustomError(auction_, "OnlyWinner");
	await expect(auction_.connect(winner_).claimNft(firstNftId_, gameAddress_, TRANSACTION_OPTIONS)).revertedWithCustomError(nft_, "ERC721InvalidReceiver");
	expect((await auction_.getAuction(firstNftId_)).delivered).equal(false);
	await record_("deliver-before-forwarding", auction_.connect(winner_).claimNft(firstNftId_, recipient_.address));
	expect(await nft_.ownerOf(firstNftId_)).equal(recipient_.address);
	expect((await auction_.getAuction(firstNftId_)).proceedsForwarded).equal(false);
	await refund_(winner_, jumpBid_);
	await refund_(lateBidder_, firstLateBid_);
	await expectSolvent(contracts_, 0n, 0n, winningPayment_);

	// Unbid inventory remains eligible and starts its own 48-hour clock even while another lot awaits forwarding.
	const secondNftId_ = firstNftId_ + 1n;
	const secondOpeningTime_ = finalEnd_ + 7n * 86400n;
	await time.setNextBlockTimestamp(secondOpeningTime_);
	await record_("later-first-bid", auction_.connect(firstBidder_).bid(secondNftId_, MINIMUM_BID, { value: MINIMUM_BID }));
	const secondEnd_ = secondOpeningTime_ + AUCTION_DURATION;
	expect((await auction_.getAuction(secondNftId_)).endAt).equal(secondEnd_);
	await expectSolvent(contracts_, MINIMUM_BID, 0n, winningPayment_);
	const forwardReceipt_ = await forward_(firstNftId_, winningPayment_);
	await expectSolvent(contracts_, MINIMUM_BID, 0n, 0n);
	await time.setNextBlockTimestamp(secondEnd_);
	await record_("later-permissionless-settle", auction_.connect(settler_).settle(secondNftId_));
	await forward_(secondNftId_, MINIMUM_BID);
	expect(await nft_.ownerOf(secondNftId_)).equal(auctionAddress_);
	await record_("deliver-after-forwarding", auction_.connect(firstBidder_).claimNft(secondNftId_, firstBidder_.address));
	expect(await nft_.ownerOf(secondNftId_)).equal(firstBidder_.address);
	await expectSolvent(contracts_, 0n, 0n, 0n);
	expect(await hre.ethers.provider.getBalance(gameAddress_)).equal(reserveBefore_ + winningPayment_ + MINIMUM_BID);
	expect(await snapshotGame_()).deep.equal(stateBefore_);
	expect(await nft_.totalSupply()).equal(supplyBefore_);
	for (let index_ = 2n; index_ < 8n; ++index_) {
		expect((await auction_.getAuction(firstNftId_ + index_)).endAt).equal(0n);
		expect(await nft_.ownerOf(firstNftId_ + index_)).equal(auctionAddress_);
	}
	return {
		firstNftId: firstNftId_.toString(), secondNftId: secondNftId_.toString(),
		openingBidWei: MINIMUM_BID.toString(), winningPaymentWei: winningPayment_.toString(),
		reserveIncreaseWei: (winningPayment_ + MINIMUM_BID).toString(),
		originalEnd: originalEnd_.toString(), firstExtendedEnd: firstExtendedEnd_.toString(), finalEnd: finalEnd_.toString(),
		secondOpeningTime: secondOpeningTime_.toString(), secondEnd: secondEnd_.toString(),
		forwardGas: forwardReceipt_.gasUsed.toString(), transactions: transactions_,
		sameBidderDeltaFunding: true, exactlyTenMinuteBoundaryUnchanged: true, repeatedLateBidsRestoreTenMinutes: true,
		refundsPaidBeforeAndAfterSettlement: true, bothDeliveryAndForwardingOrders: true, rejectedNftDeliveryRetryable: true, revertedNftDeliveryTransactions: 1,
		gameStoragePreserved: true, gameBidEventsFromForwarding: 0, remainingLiabilitiesWei: "0", unbidLotsStillInCustody: 6,
	};
}

module.exports = { exerciseV4AuctionLifecycle, productionFixture, hostileNftFixture, registeredFixture, eligibleFixture, registerBatch, placeBid, settleFirstLot, expectSolvent, MINIMUM_BID, ELIGIBILITY_DELAY, AUCTION_DURATION, EXTENSION_DURATION, TRANSACTION_OPTIONS };
