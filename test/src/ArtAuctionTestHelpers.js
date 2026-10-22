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

module.exports = { productionFixture, hostileNftFixture, registeredFixture, eligibleFixture, registerBatch, placeBid, settleFirstLot, expectSolvent, MINIMUM_BID, ELIGIBILITY_DELAY, AUCTION_DURATION, EXTENSION_DURATION, TRANSACTION_OPTIONS };
