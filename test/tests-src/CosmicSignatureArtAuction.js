"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const { productionFixture, hostileNftFixture, registeredFixture, eligibleFixture, registerBatch, placeBid, settleFirstLot, expectSolvent, MINIMUM_BID, ELIGIBILITY_DELAY, AUCTION_DURATION, EXTENSION_DURATION, TRANSACTION_OPTIONS } = require("../src/ArtAuctionTestHelpers.js");

describe("CosmicSignatureArtAuction", function () {
	it("binds deployed game and collection addresses and publishes immutable rules", async function () {
		const contracts_ = await loadFixture(productionFixture);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureArtAuction");
		const gameAddress_ = await contracts_.game.getAddress();
		const nftAddress_ = await contracts_.nft.getAddress();
		for (const badAddress_ of [hre.ethers.ZeroAddress, contracts_.signers[1].address]) {
			await expect(factory_.deploy(badAddress_, nftAddress_)).revertedWithCustomError(factory_, "InvalidContractAddress").withArgs(badAddress_);
			await expect(factory_.deploy(gameAddress_, badAddress_)).revertedWithCustomError(factory_, "InvalidContractAddress").withArgs(badAddress_);
		}
		const otherGame_ = await (await hre.ethers.getContractFactory("ArtAuctionTestGame")).deploy();
		await expect(factory_.deploy(await otherGame_.getAddress(), nftAddress_))
			.revertedWithCustomError(factory_, "CollectionGameMismatch").withArgs(await otherGame_.getAddress(), gameAddress_);
		expect(await contracts_.auction.game()).equal(gameAddress_);
		expect(await contracts_.auction.nft()).equal(nftAddress_);
		expect(await contracts_.auction.NFTS_PER_BATCH()).equal(8n);
		expect(await contracts_.auction.MINIMUM_BID()).equal(MINIMUM_BID);
		expect(await contracts_.auction.ELIGIBILITY_DELAY()).equal(ELIGIBILITY_DELAY);
		expect(await contracts_.auction.AUCTION_DURATION()).equal(AUCTION_DURATION);
		expect(await contracts_.auction.MINIMUM_INCREASE_DIVISOR()).equal(10n);
		expect(await contracts_.auction.EXTENSION_DURATION()).equal(EXTENSION_DURATION);
		expect(contracts_.auction.interface.getFunction("owner")).equal(null);
		expect(contracts_.auction.interface.getFunction("pause")).equal(null);
		expect(contracts_.auction.interface.getFunction("cancel")).equal(null);
	});

	it("registers exactly eight latest tokens and exposes bounded batch enumeration", async function () {
		const contracts_ = await loadFixture(productionFixture);
		const batch_ = await registerBatch(contracts_, 10n);
		for (let nftId_ = 0n; nftId_ < 8n; ++nftId_) {
			const auction_ = await contracts_.auction.getAuction(nftId_);
			expect(auction_.roundNum).equal(10n);
			expect(auction_.eligibleAt).equal(batch_.eligibleAt);
			expect(auction_.registered).equal(true);
			expect(auction_.endAt).equal(0n);
			expect(auction_.highestBid).equal(0n);
			expect(auction_.highestBidder).equal(hre.ethers.ZeroAddress);
			expect(auction_.settled || auction_.delivered || auction_.proceedsForwarded).equal(false);
			expect(await contracts_.nft.ownerOf(nftId_)).equal(contracts_.auctionAddress);
		}
		await registerBatch(contracts_, 11n);
		expect(await contracts_.auction.registeredBatchCount()).equal(2n);
		expect(await contracts_.auction.firstNftIdByBatchIndex(0n)).equal(0n);
		expect(await contracts_.auction.firstNftIdByBatchIndex(1n)).equal(8n);
		await expect(contracts_.auction.firstNftIdByBatchIndex(2n)).revertedWithPanic(0x32);
	});

	it("authenticates registration, rejects duplicates/ranges, and rolls back atomic minting on failure", async function () {
		const contracts_ = await loadFixture(registeredFixture);
		await expect(contracts_.auction.connect(contracts_.signers[1]).registerAuctionBatch(1n, 0n))
			.revertedWithCustomError(contracts_.auction, "OnlyGame").withArgs(contracts_.signers[1].address);
		await expect(contracts_.game.registerExisting(contracts_.auctionAddress, 0n, 0n))
			.revertedWithCustomError(contracts_.auction, "RoundAlreadyRegistered");
		await expect(contracts_.game.registerExisting(contracts_.auctionAddress, 1n, 0n))
			.revertedWithCustomError(contracts_.auction, "NftAlreadyRegistered");
		for (const firstNftId_ of [1n, hre.ethers.MaxUint256]) {
			await expect(contracts_.game.registerExisting(contracts_.auctionAddress, 1n, firstNftId_))
				.revertedWithCustomError(contracts_.auction, "InvalidBatchRange");
		}
		await expect(contracts_.game.mintAndRegister(contracts_.auctionAddress, 0n, 999n))
			.revertedWithCustomError(contracts_.auction, "RoundAlreadyRegistered");
		expect(await contracts_.nft.totalSupply()).equal(8n);
		expect(await contracts_.auction.registeredBatchCount()).equal(1n);
		await expect(contracts_.auction.getAuction(8n)).revertedWithCustomError(contracts_.auction, "UnknownAuction");
	});

	it("rejects missing/partially held custody without leaving partial registration", async function () {
		const contracts_ = await loadFixture(productionFixture);
		await expect(contracts_.game.registerExisting(contracts_.auctionAddress, 0n, 0n))
			.revertedWithCustomError(contracts_.auction, "InvalidBatchRange");
		await (await contracts_.game.mintTo(contracts_.auctionAddress, 4n, 0n)).wait();
		await (await contracts_.game.mintTo(contracts_.signers[1].address, 4n, 0n)).wait();
		await expect(contracts_.game.registerExisting(contracts_.auctionAddress, 0n, 0n))
			.revertedWithCustomError(contracts_.auction, "NftNotInCustody").withArgs(4n, contracts_.signers[1].address);
		expect(await contracts_.auction.registeredRounds(0n)).equal(false);
		expect(await contracts_.auction.registeredBatchCount()).equal(0n);
		for (let nftId_ = 0n; nftId_ < 8n; ++nftId_) {
			await expect(contracts_.auction.getAuction(nftId_)).revertedWithCustomError(contracts_.auction, "UnknownAuction");
		}
	});

	it("does not turn accidental NFT transfers into lots or grant an approval/rescue path", async function () {
		const contracts_ = await loadFixture(registeredFixture);
		await (await contracts_.game.mintTo(contracts_.signers[1].address, 2n, 1n)).wait();
		await expect(contracts_.nft.connect(contracts_.signers[1])["safeTransferFrom(address,address,uint256)"](
			contracts_.signers[1].address, contracts_.auctionAddress, 8n
		)).revertedWithCustomError(contracts_.nft, "ERC721InvalidReceiver");
		await (await contracts_.nft.connect(contracts_.signers[1]).transferFrom(contracts_.signers[1].address, contracts_.auctionAddress, 9n)).wait();
		await expect(contracts_.auction.bid(9n, MINIMUM_BID, { value: MINIMUM_BID }))
			.revertedWithCustomError(contracts_.auction, "UnknownAuction");
		await expect(contracts_.auction.claimNft(9n, contracts_.signers[1].address))
			.revertedWithCustomError(contracts_.auction, "UnknownAuction");
		for (let nftId_ = 0n; nftId_ < 8n; ++nftId_) expect(await contracts_.nft.getApproved(nftId_)).equal(hre.ethers.ZeroAddress);
	});

	it("accepts the first bid at the exact eligibility boundary and leaves other lots dormant indefinitely", async function () {
		const contracts_ = await loadFixture(registeredFixture);
		await time.setNextBlockTimestamp(contracts_.eligibleAt - 1n);
		await expect(contracts_.auction.bid(0n, MINIMUM_BID, { ...TRANSACTION_OPTIONS, value: MINIMUM_BID }))
			.revertedWithCustomError(contracts_.auction, "AuctionNotEligible");
		await time.setNextBlockTimestamp(contracts_.eligibleAt);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		expect((await contracts_.auction.getAuction(0n)).endAt).equal(contracts_.eligibleAt + AUCTION_DURATION);
		await time.increase(365n * 24n * 60n * 60n);
		await expect(contracts_.auction.settle(1n)).revertedWithCustomError(contracts_.auction, "AuctionNotStarted");
		const receipt_ = await placeBid(contracts_, contracts_.signers[2], 1n, MINIMUM_BID);
		const timestamp_ = BigInt((await hre.ethers.provider.getBlock(receipt_.blockNumber)).timestamp);
		expect((await contracts_.auction.getAuction(1n)).endAt).equal(timestamp_ + AUCTION_DURATION);
		expect((await contracts_.auction.getAuction(2n)).endAt).equal(0n);
	});

	it("enforces exact funding, rounded-up percentage increments, and direct large bids", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await expect(contracts_.auction.bid(0n, MINIMUM_BID - 1n, { value: MINIMUM_BID - 1n }))
			.revertedWithCustomError(contracts_.auction, "BidTooLow");
		await expect(contracts_.auction.bid(0n, MINIMUM_BID, { value: MINIMUM_BID - 1n }))
			.revertedWithCustomError(contracts_.auction, "IncorrectBidFunding");
		await expect(contracts_.auction.bid(0n, MINIMUM_BID, { value: MINIMUM_BID + 1n }))
			.revertedWithCustomError(contracts_.auction, "IncorrectBidFunding");
		const firstBid_ = MINIMUM_BID + 1n;
		await placeBid(contracts_, contracts_.signers[1], 0n, firstBid_);
		const nextBid_ = firstBid_ + (firstBid_ + 9n) / 10n;
		expect(await contracts_.auction.minimumNextBid(0n)).equal(nextBid_);
		await expect(contracts_.auction.connect(contracts_.signers[2]).bid(0n, nextBid_ - 1n, { value: nextBid_ - 1n }))
			.revertedWithCustomError(contracts_.auction, "BidTooLow");
		await placeBid(contracts_, contracts_.signers[2], 0n, nextBid_);
		const largeBid_ = hre.ethers.parseEther("100");
		await placeBid(contracts_, contracts_.signers[3], 0n, largeBid_);
		expect((await contracts_.auction.getAuction(0n)).highestBid).equal(largeBid_);
		await expectSolvent(contracts_, largeBid_, firstBid_ + nextBid_, 0n);
	});

	it("self-raises pay only the difference, and returning bidders do not implicitly reuse credit", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		const secondBid_ = await contracts_.auction.minimumNextBid(0n);
		await expect(contracts_.auction.connect(contracts_.signers[1]).bid(0n, secondBid_, { value: secondBid_ }))
			.revertedWithCustomError(contracts_.auction, "IncorrectBidFunding");
		await placeBid(contracts_, contracts_.signers[1], 0n, secondBid_, secondBid_ - MINIMUM_BID);
		expect(await contracts_.auction.refundCredits(contracts_.signers[1].address)).equal(0n);
		const thirdBid_ = await contracts_.auction.minimumNextBid(0n);
		await placeBid(contracts_, contracts_.signers[2], 0n, thirdBid_);
		const fourthBid_ = await contracts_.auction.minimumNextBid(0n);
		await expect(contracts_.auction.connect(contracts_.signers[1]).bid(0n, fourthBid_, { value: fourthBid_ - secondBid_ }))
			.revertedWithCustomError(contracts_.auction, "IncorrectBidFunding");
		await placeBid(contracts_, contracts_.signers[1], 0n, fourthBid_);
		expect(await contracts_.auction.refundCredits(contracts_.signers[1].address)).equal(secondBid_);
		await expectSolvent(contracts_, fourthBid_, secondBid_ + thirdBid_, 0n);
	});

	it("applies chain ordering to equal bids without changing an earlier bid", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		await expect(contracts_.auction.connect(contracts_.signers[2]).bid(0n, MINIMUM_BID, { value: MINIMUM_BID }))
			.revertedWithCustomError(contracts_.auction, "BidTooLow");
		expect((await contracts_.auction.getAuction(0n)).highestBidder).equal(contracts_.signers[1].address);
	});

	it("only extends in the last ten minutes, permits repeated self extensions, and closes exactly at expiry", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		let endAt_ = (await contracts_.auction.getAuction(0n)).endAt;
		for (const secondsRemaining_ of [3600n, 600n]) {
			await time.setNextBlockTimestamp(endAt_ - secondsRemaining_);
			const nextBid_ = await contracts_.auction.minimumNextBid(0n);
			const prevBid_ = (await contracts_.auction.getAuction(0n)).highestBid;
			await placeBid(contracts_, contracts_.signers[1], 0n, nextBid_, nextBid_ - prevBid_);
			expect((await contracts_.auction.getAuction(0n)).endAt).equal(endAt_);
		}
		for (const secondsRemaining_ of [599n, 120n, 1n]) {
			const timestamp_ = endAt_ - secondsRemaining_;
			await time.setNextBlockTimestamp(timestamp_);
			const nextBid_ = await contracts_.auction.minimumNextBid(0n);
			const prevBid_ = (await contracts_.auction.getAuction(0n)).highestBid;
			await placeBid(contracts_, contracts_.signers[1], 0n, nextBid_, nextBid_ - prevBid_);
			endAt_ = timestamp_ + EXTENSION_DURATION;
			expect((await contracts_.auction.getAuction(0n)).endAt).equal(endAt_);
		}
		await time.setNextBlockTimestamp(endAt_ - 1n);
		await expect(contracts_.auction.settle(0n, TRANSACTION_OPTIONS)).revertedWithCustomError(contracts_.auction, "AuctionNotEnded");
		await time.setNextBlockTimestamp(endAt_);
		await expect(contracts_.auction.bid(0n, await contracts_.auction.minimumNextBid(0n), { ...TRANSACTION_OPTIONS, value: await contracts_.auction.minimumNextBid(0n) }))
			.revertedWithCustomError(contracts_.auction, "AuctionEnded");
		await (await contracts_.auction.connect(contracts_.signers[4]).settle(0n)).wait();
		expect((await contracts_.auction.getAuction(0n)).settled).equal(true);
	});

	it("settles at the exact deadline and records only the final price as proceeds", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		const price_ = await contracts_.auction.minimumNextBid(0n);
		await placeBid(contracts_, contracts_.signers[2], 0n, price_);
		const auction_ = await contracts_.auction.getAuction(0n);
		await time.setNextBlockTimestamp(auction_.endAt);
		await expect(contracts_.auction.connect(contracts_.signers[4]).settle(0n))
			.emit(contracts_.auction, "AuctionSettled").withArgs(0n, 0n, contracts_.signers[2].address, price_);
		await expectSolvent(contracts_, 0n, MINIMUM_BID, price_);
		expect(await contracts_.nft.ownerOf(0n)).equal(contracts_.auctionAddress);
		await expect(contracts_.auction.settle(0n)).revertedWithCustomError(contracts_.auction, "AuctionAlreadySettled");
		await expect(contracts_.auction.bid(0n, price_ * 2n, { value: price_ * 2n })).revertedWithCustomError(contracts_.auction, "AuctionEnded");
	});

	it("lets a credit owner choose a destination without expiry and restores rejected refunds", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		const nextBid_ = await contracts_.auction.minimumNextBid(0n);
		await placeBid(contracts_, contracts_.signers[2], 0n, nextBid_);
		await (await contracts_.actor.setRejectEth(true)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[1]).withdrawRefund(contracts_.actorAddress))
			.revertedWithCustomError(contracts_.auction, "RefundTransferFailed");
		expect(await contracts_.auction.refundCredits(contracts_.signers[1].address)).equal(MINIMUM_BID);
		await expect(contracts_.auction.connect(contracts_.signers[3]).withdrawRefund(contracts_.signers[1].address))
			.revertedWithCustomError(contracts_.auction, "NoRefundCredit");
		for (const recipient_ of [hre.ethers.ZeroAddress, contracts_.auctionAddress]) {
			await expect(contracts_.auction.connect(contracts_.signers[1]).withdrawRefund(recipient_))
				.revertedWithCustomError(contracts_.auction, "InvalidRecipient");
		}
		await time.increase(3650n * 24n * 60n * 60n);
		const destination_ = contracts_.signers[5].address;
		const balanceBefore_ = await hre.ethers.provider.getBalance(destination_);
		await expect(contracts_.auction.connect(contracts_.signers[1]).withdrawRefund(destination_))
			.emit(contracts_.auction, "AuctionRefundWithdrawn").withArgs(contracts_.signers[1].address, destination_, MINIMUM_BID);
		expect(await hre.ethers.provider.getBalance(destination_)).equal(balanceBefore_ + MINIMUM_BID);
		await expectSolvent(contracts_, nextBid_, 0n, 0n);
	});

	it("a rejecting bidder cannot block an outbid, and aggregate credit spans independent lots", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await (await contracts_.actor.setRejectEth(true)).wait();
		for (const nftId_ of [0n, 1n]) {
			await (await contracts_.actor.execute(contracts_.auctionAddress, contracts_.auction.interface.encodeFunctionData("bid", [nftId_, MINIMUM_BID]), { value: MINIMUM_BID })).wait();
			await placeBid(contracts_, contracts_.signers[1], nftId_, MINIMUM_BID * 2n);
		}
		expect(await contracts_.auction.refundCredits(contracts_.actorAddress)).equal(MINIMUM_BID * 2n);
		await (await contracts_.actor.execute(contracts_.auctionAddress, contracts_.auction.interface.encodeFunctionData("withdrawRefund", [contracts_.signers[5].address]))).wait();
		await expectSolvent(contracts_, MINIMUM_BID * 4n, 0n, 0n);
	});

	it("keeps failed delivery, refunds, and retryable game funding independent", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[2], 0n, MINIMUM_BID);
		const price_ = MINIMUM_BID * 2n;
		await placeBid(contracts_, contracts_.signers[1], 0n, price_);
		await (await contracts_.game.setRejectDonations(true)).wait();
		await (await contracts_.actor.setRejectNft(true)).wait();
		await time.increaseTo((await contracts_.auction.getAuction(0n)).endAt);
		await (await contracts_.auction.settle(0n)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.actorAddress)).revertedWith("NFT rejected");
		await expect(contracts_.auction.forwardProceeds(0n)).revertedWithCustomError(contracts_.game, "DonationRejected");
		let auction_ = await contracts_.auction.getAuction(0n);
		expect(auction_.settled).equal(true);
		expect(auction_.delivered || auction_.proceedsForwarded).equal(false);
		await (await contracts_.auction.connect(contracts_.signers[2]).withdrawRefund(contracts_.signers[2].address)).wait();
		await (await contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.signers[5].address)).wait();
		expect(await contracts_.nft.ownerOf(0n)).equal(contracts_.signers[5].address);
		await expectSolvent(contracts_, 0n, 0n, price_);
		await time.increase(365n * 24n * 60n * 60n);
		await (await contracts_.game.setRejectDonations(false)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[6]).forwardProceeds(0n))
			.emit(contracts_.auction, "AuctionProceedsForwarded").withArgs(0n, 0n, price_);
		expect(await contracts_.game.totalDonations()).equal(price_);
		expect(await contracts_.game.receiveCount()).equal(0n);
		auction_ = await contracts_.auction.getAuction(0n);
		expect(auction_.settled && auction_.delivered && auction_.proceedsForwarded).equal(true);
		await expectSolvent(contracts_, 0n, 0n, 0n);
	});

	it("enforces exclusive, non-expiring delivery rights and exactly-once forwarding", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await expect(contracts_.auction.claimNft(0n, contracts_.signers[1].address)).revertedWithCustomError(contracts_.auction, "AuctionNotSettled");
		await expect(contracts_.auction.forwardProceeds(0n)).revertedWithCustomError(contracts_.auction, "AuctionNotSettled");
		await settleFirstLot(contracts_);
		await (await contracts_.auction.forwardProceeds(0n)).wait();
		await expect(contracts_.auction.forwardProceeds(0n)).revertedWithCustomError(contracts_.auction, "ProceedsAlreadyForwarded");
		await time.increase(3650n * 24n * 60n * 60n);
		await expect(contracts_.auction.connect(contracts_.signers[2]).claimNft(0n, contracts_.signers[2].address))
			.revertedWithCustomError(contracts_.auction, "OnlyWinner");
		for (const recipient_ of [hre.ethers.ZeroAddress, contracts_.auctionAddress]) {
			await expect(contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, recipient_))
				.revertedWithCustomError(contracts_.auction, "InvalidRecipient");
		}
		await (await contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.signers[5].address)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.signers[5].address))
			.revertedWithCustomError(contracts_.auction, "NftAlreadyDelivered");
	});

	it("forwards only forced surplus while all three liability categories remain protected", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID);
		await placeBid(contracts_, contracts_.signers[2], 0n, MINIMUM_BID * 2n);
		await time.increaseTo((await contracts_.auction.getAuction(0n)).endAt);
		await (await contracts_.auction.settle(0n)).wait();
		await placeBid(contracts_, contracts_.signers[3], 1n, MINIMUM_BID * 3n);
		await expect(contracts_.signers[1].sendTransaction({ to: contracts_.auctionAddress, value: 1n })).reverted;
		await expect(contracts_.auction.forwardSurplus()).revertedWithCustomError(contracts_.auction, "NoSurplus");
		const surplus_ = 1234567n;
		await (await hre.ethers.getContractFactory("ArtAuctionTestForcedEth")).deploy(contracts_.auctionAddress, { value: surplus_ });
		await expectSolvent(contracts_, MINIMUM_BID * 3n, MINIMUM_BID, MINIMUM_BID * 2n, surplus_);
		await (await contracts_.game.setRejectDonations(true)).wait();
		await expect(contracts_.auction.forwardSurplus()).revertedWithCustomError(contracts_.game, "DonationRejected");
		await expectSolvent(contracts_, MINIMUM_BID * 3n, MINIMUM_BID, MINIMUM_BID * 2n, surplus_);
		await (await contracts_.game.setRejectDonations(false)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[6]).forwardSurplus()).emit(contracts_.auction, "AuctionSurplusForwarded").withArgs(surplus_);
		await expectSolvent(contracts_, MINIMUM_BID * 3n, MINIMUM_BID, MINIMUM_BID * 2n);
		expect(await contracts_.game.totalDonations()).equal(surplus_);
		expect(await contracts_.game.receiveCount()).equal(0n);
	});

	it("reverts atomic creation on a hostile NFT custody read and preserves settlement if its transfer fails", async function () {
		const contracts_ = await loadFixture(hostileNftFixture);
		await (await contracts_.nft.setRejectOwnershipRead(true)).wait();
		await expect(contracts_.game.mintAndRegister(contracts_.auctionAddress, 0n, 1n)).revertedWith("Ownership read rejected");
		expect(await contracts_.nft.totalSupply()).equal(0n);
		expect(await contracts_.auction.registeredBatchCount()).equal(0n);
		await (await contracts_.nft.setRejectOwnershipRead(false)).wait();
		const batch_ = await registerBatch(contracts_);
		await time.increaseTo(batch_.eligibleAt);
		await settleFirstLot(contracts_);
		await (await contracts_.nft.setRejectTransfers(true)).wait();
		await expect(contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.signers[1].address)).revertedWith("Transfer rejected");
		expect((await contracts_.auction.getAuction(0n)).delivered).equal(false);
		await (await contracts_.auction.forwardProceeds(0n)).wait();
		await (await contracts_.nft.setRejectTransfers(false)).wait();
		await (await contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, contracts_.signers[1].address)).wait();
	});

	const reentryCalls_ = [
		["registerAuctionBatch", [99n, 0n]],
		["bid", [1n, MINIMUM_BID]],
		["settle", [0n]],
		["claimNft", [0n, "recipient"]],
		["withdrawRefund", ["recipient"]],
		["forwardProceeds", [0n]],
		["forwardSurplus", []],
	];
	for (const [method_, rawArgs_] of reentryCalls_) {
		it(`blocks reentry into ${method_} from refund, NFT receiver, NFT contract and game callbacks`, async function () {
			for (const source_ of ["refund", "receiver", "nft", "game"]) {
				const contracts_ = await loadFixture(source_ === "nft" ? hostileNftFixture : productionFixture);
				const batch_ = await registerBatch(contracts_);
				await time.increaseTo(batch_.eligibleAt);
				const args_ = rawArgs_.map(value_ => value_ === "recipient" ? contracts_.signers[5].address : value_);
				const callbackData_ = contracts_.auction.interface.encodeFunctionData(method_, args_);
				const probe_ = source_ === "game" ? contracts_.game : source_ === "nft" ? contracts_.nft : contracts_.actor;
				await (await probe_.configureCallback(contracts_.auctionAddress, callbackData_, 0n, false)).wait();
				if (source_ === "refund") {
					await (await contracts_.actor.execute(contracts_.auctionAddress, contracts_.auction.interface.encodeFunctionData("bid", [0n, MINIMUM_BID]), { value: MINIMUM_BID })).wait();
					await placeBid(contracts_, contracts_.signers[1], 0n, MINIMUM_BID * 2n);
					await (await contracts_.actor.execute(contracts_.auctionAddress, contracts_.auction.interface.encodeFunctionData("withdrawRefund", [contracts_.actorAddress]))).wait();
					await expectSolvent(contracts_, MINIMUM_BID * 2n, 0n, 0n);
				} else {
					await settleFirstLot(contracts_);
					if (source_ === "game") {
						await (await contracts_.auction.forwardProceeds(0n)).wait();
						await expectSolvent(contracts_, 0n, 0n, 0n);
					} else {
						const recipient_ = source_ === "receiver" ? contracts_.actorAddress : contracts_.signers[5].address;
						await (await contracts_.auction.connect(contracts_.signers[1]).claimNft(0n, recipient_)).wait();
						await expectSolvent(contracts_, 0n, 0n, MINIMUM_BID);
					}
				}
				expect(await probe_.callbackCount(), source_).equal(1n);
				expect(await probe_.callbackSucceeded(), source_).equal(false);
				expect(await probe_.callbackResult(), source_).equal(contracts_.auction.interface.getError("ReentrancyGuardReentrantCall").selector);
			}
		});
	}

	it("preserves liabilities when a callback insists on successful reentry", async function () {
		const contracts_ = await loadFixture(eligibleFixture);
		await settleFirstLot(contracts_);
		await (await contracts_.game.configureCallback(contracts_.auctionAddress, contracts_.auction.interface.encodeFunctionData("forwardProceeds", [0n]), 0n, true)).wait();
		await expect(contracts_.auction.forwardProceeds(0n)).revertedWith("Callback rejected");
		expect((await contracts_.auction.getAuction(0n)).proceedsForwarded).equal(false);
		await expectSolvent(contracts_, 0n, 0n, MINIMUM_BID);
		await (await contracts_.game.configureCallback(hre.ethers.ZeroAddress, "0x", 0n, false)).wait();
		await (await contracts_.auction.forwardProceeds(0n)).wait();
	});
});
