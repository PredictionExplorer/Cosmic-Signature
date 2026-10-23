"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");
const { activateCurrentRound, getLatestBlockTimestamp, setNextBlockTimeToAtLeast, findParsedEvent } = require("../src/V2UpgradeTestHelpers.js");
const { activateRoundBidAndClaimMainPrize, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");
const { deployV4Fixture, upgradeToV4, snapshotV3Storage } = require("../src/V4UpgradeTestHelpers.js");

function parsedEvents(receipt_, contract_, name_) {
	return receipt_.logs.filter(log_ => log_.address.toLowerCase() === contract_.target.toLowerCase()).map(log_ => contract_.interface.parseLog(log_)).filter(event_ => event_?.name === name_);
}

async function anchorRandomWalk(contracts_) {
	const owner_ = contracts_.signers[2];
	const nft_ = contracts_.randomWalkNft.connect(owner_);
	const nftId_ = await nft_.nextTokenId();
	await waitForTransactionReceipt(nft_.mint({ value: await nft_.getMintPrice() }));
	await waitForTransactionReceipt(nft_.setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true));
	await waitForTransactionReceipt(contracts_.stakingWalletRandomWalkNft.connect(owner_).stake(nftId_));
}

function announcedRecipients(receipt_, game_) {
	const recipients_ = new Map();
	for (const log_ of receipt_.logs) {
		if (log_.address.toLowerCase() !== game_.target.toLowerCase()) continue;
		const event_ = game_.interface.parseLog(log_);
		const args_ = event_?.args;
		if (event_?.name === "MainPrizeClaimed") {
			for (let index_ = 0n; index_ < args_.prizeNumCosmicSignatureNfts; ++index_) recipients_.set(args_.prizeFirstCosmicSignatureNftId + index_, args_.beneficiaryAddress);
		} else if (event_?.name === "RaffleWinnerPrizePaid") recipients_.set(args_.prizeCosmicSignatureNftId, args_.winnerAddress);
		else if (event_?.name === "ChronoWarriorPrizePaid") recipients_.set(args_.prizeCosmicSignatureNftId, args_.chronoWarriorAddress);
		else if (event_?.name === "EnduranceChampionPrizePaid") recipients_.set(args_.prizeCosmicSignatureNftId, args_.enduranceChampionAddress);
		else if (event_?.name === "LastCstBidderPrizePaid") recipients_.set(args_.prizeCosmicSignatureNftId, args_.lastCstBidderAddress);
	}
	return recipients_;
}

describe("CosmicSignatureGameV4-MainPrize", function () {
	for (const withCst_ of [false, true]) for (const withRandomWalk_ of [false, true]) for (const mainCount_ of [1n, 3n, 5n]) {
		it(`adds eight auction NFTs without changing recipient accounting or CST (CST=${withCst_}, RWLK=${withRandomWalk_}, main=${mainCount_})`, async function () {
			const contracts_ = await deployV4Fixture();
			const game_ = contracts_.cosmicSignatureGameV4Proxy;
			const auction_ = contracts_.cosmicSignatureArtAuction;
			const bidder_ = contracts_.signers[1];
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setMainPrizeNumCosmicSignatureNfts(mainCount_));
			if (withRandomWalk_) await anchorRandomWalk(contracts_);
			await activateCurrentRound(game_, contracts_.ownerSigner);
			await bidWithEthAt(game_, bidder_, await getLatestBlockTimestamp() + 1n);
			if (withCst_) await waitForTransactionReceipt(game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n));
			const cycle_ = await game_.roundNum();
			const firstExistingNft_ = await contracts_.cosmicSignatureNft.totalSupply();
			const cstBefore_ = await contracts_.cosmicSignatureToken.totalSupply();
			const normalCount_ = 2n + mainCount_ + (withCst_ ? 1n : 0n) + 10n + (withRandomWalk_ ? 10n : 0n);
			const expectedCst_ = (13n + (withCst_ ? 1n : 0n) + (withRandomWalk_ ? 10n : 0n)) * await game_.cstPrizeAmount() + await game_.marketingWalletCstContributionAmount();
			const deadline_ = await game_.mainPrizeTime();
			await setNextBlockTimeToAtLeast(deadline_ + 137n);
			const receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
			const timestamp_ = BigInt((await receipt_.getBlock()).timestamp);
			const firstAuctionNft_ = firstExistingNft_ + normalCount_;
			expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(firstAuctionNft_ + 8n);
			expect(await contracts_.cosmicSignatureToken.totalSupply() - cstBefore_).equal(expectedCst_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(auction_)).equal(0n);
			const recipients_ = announcedRecipients(receipt_, game_);
			expect(BigInt(recipients_.size)).equal(normalCount_);
			for (let tokenId_ = firstExistingNft_; tokenId_ < firstAuctionNft_; ++tokenId_) {
				expect(recipients_.has(tokenId_), `missing existing recipient for ${tokenId_}`).equal(true);
				expect(await contracts_.cosmicSignatureNft.ownerOf(tokenId_)).equal(recipients_.get(tokenId_));
			}
			const mainEvent_ = findParsedEvent(receipt_, game_, "MainPrizeClaimed");
			expect(mainEvent_.args.prizeNumCosmicSignatureNfts).equal(mainCount_);
			expect(mainEvent_.args.prizeFirstCosmicSignatureNftId + mainCount_).equal(firstAuctionNft_);
			const batch_ = findParsedEvent(receipt_, auction_, "AuctionBatchRegistered");
			expect(batch_.args.roundNum).equal(cycle_);
			expect(batch_.args.firstNftId).equal(firstAuctionNft_);
			expect(batch_.args.count).equal(8n);
			expect(batch_.args.eligibleAt).equal(timestamp_ + 7n * 24n * 3600n);
			expect(batch_.args.eligibleAt).not.equal(deadline_ + 7n * 24n * 3600n);
			const seeds_ = new Set();
			const allMints_ = parsedEvents(receipt_, contracts_.cosmicSignatureNft, "NftMinted");
			for (const event_ of allMints_) {
				expect(event_.args.roundNum).equal(cycle_);
				expect(await contracts_.cosmicSignatureNft.getNftSeed(event_.args.nftId)).equal(event_.args.nftSeed);
				seeds_.add(event_.args.nftSeed.toString());
			}
			expect(seeds_.size).equal(Number(normalCount_ + 8n));
			for (let tokenId_ = firstAuctionNft_; tokenId_ < firstAuctionNft_ + 8n; ++tokenId_) {
				expect(await contracts_.cosmicSignatureNft.ownerOf(tokenId_)).equal(await auction_.getAddress());
				const lot_ = await auction_.getAuction(tokenId_);
				expect(lot_.registered).equal(true);
				expect(lot_.roundNum).equal(cycle_);
				expect(lot_.eligibleAt).equal(batch_.args.eligibleAt);
				expect(lot_.endAt).equal(0n);
				expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(tokenId_)).equal(0n);
			}
			expect(await game_.roundNum()).equal(cycle_ + 1n);
		});
	}

	it("rolls back all distributions, CST, NFT creation and cycle state when batch registration fails", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const factory_ = await hre.ethers.getContractFactory("ArtAuctionRegistrationTestDouble", contracts_.ownerSigner);
		const failing_ = await factory_.deploy(contracts_.cosmicSignatureGameProxyAddress, contracts_.cosmicSignatureNftAddress);
		await failing_.waitForDeployment();
		const game_ = await upgradeToV4(contracts_, failing_);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, contracts_.signers[1], await getLatestBlockTimestamp() + 1n);
		await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
		const beforeSlots_ = await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress);
		const balances_ = await Promise.all([contracts_.cosmicSignatureGameProxyAddress, contracts_.prizesWalletAddress, contracts_.charityWalletAddress, contracts_.stakingWalletCosmicSignatureNftAddress].map(address_ => hre.ethers.provider.getBalance(address_)));
		const nftSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
		const cstSupply_ = await contracts_.cosmicSignatureToken.totalSupply();
		await expect(game_.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(failing_, "RegistrationRejected");
		expect(await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress)).deep.equal(beforeSlots_);
		expect(await Promise.all([contracts_.cosmicSignatureGameProxyAddress, contracts_.prizesWalletAddress, contracts_.charityWalletAddress, contracts_.stakingWalletCosmicSignatureNftAddress].map(address_ => hre.ethers.provider.getBalance(address_)))).deep.equal(balances_);
		expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(nftSupply_);
		expect(await contracts_.cosmicSignatureToken.totalSupply()).equal(cstSupply_);
		expect(await failing_.registrations()).equal(0n);
		await waitForTransactionReceipt(failing_.setRejectRegistration(false));
		await waitForTransactionReceipt(game_.connect(contracts_.signers[1]).claimMainPrize());
		expect(await failing_.registrations()).equal(1n);
	});

	it("continues subsequent cycles while earlier lots remain unbid and permits duplicate-free sequential batches", async function () {
		const contracts_ = await deployV4Fixture();
		const game_ = contracts_.cosmicSignatureGameV4Proxy;
		const auction_ = contracts_.cosmicSignatureArtAuction;
		let previousLast_ = -1n;
		for (let cycle_ = 1n; cycle_ <= 4n; ++cycle_) {
			const receipt_ = await activateRoundBidAndClaimMainPrize(contracts_, game_);
			const batch_ = findParsedEvent(receipt_, auction_, "AuctionBatchRegistered");
			expect(batch_.args.roundNum).equal(cycle_);
			expect(batch_.args.firstNftId).greaterThan(previousLast_);
			previousLast_ = batch_.args.firstNftId + 7n;
			expect((await auction_.getAuction(batch_.args.firstNftId)).endAt).equal(0n);
		}
	});

	it("forwards only a settled winning payment through donateEth without changing game participation", async function () {
		const contracts_ = await deployV4Fixture();
		const game_ = contracts_.cosmicSignatureGameV4Proxy;
		const auction_ = contracts_.cosmicSignatureArtAuction;
		const receipt_ = await activateRoundBidAndClaimMainPrize(contracts_, game_);
		const batch_ = findParsedEvent(receipt_, auction_, "AuctionBatchRegistered");
		const nftId_ = batch_.args.firstNftId;
		await setNextBlockTimeToAtLeast(batch_.args.eligibleAt);
		const price_ = 10n ** 13n;
		await waitForTransactionReceipt(auction_.connect(contracts_.signers[2]).bid(nftId_, price_, { value: price_ }));
		await setNextBlockTimeToAtLeast((await auction_.getAuction(nftId_)).endAt);
		await waitForTransactionReceipt(auction_.connect(contracts_.signers[3]).settle(nftId_));
		const beforeSlots_ = await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress);
		const balance_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		const funding_ = await waitForTransactionReceipt(auction_.connect(contracts_.signers[3]).forwardProceeds(nftId_));
		expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress)).equal(balance_ + price_);
		expect(await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress)).deep.equal(beforeSlots_);
		expect(parsedEvents(funding_, game_, "BidPlaced")).empty;
		const contribution_ = findParsedEvent(funding_, game_, "EthDonated");
		expect(contribution_.args.donorAddress).equal(await auction_.getAddress());
		expect(contribution_.args.amount).equal(price_);
		expect(contribution_.args.roundNum).equal(2n);
		await waitForTransactionReceipt(auction_.connect(contracts_.signers[2]).claimNft(nftId_, contracts_.signers[2].address));
		expect(await contracts_.cosmicSignatureNft.ownerOf(nftId_)).equal(contracts_.signers[2].address);
		expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_)).equal(0n);
	});

	it("preserves the purchased NFT's naming and once-only anchoring utility through a later V4 distribution", async function () {
		const contracts_ = await deployV4Fixture();
		const game_ = contracts_.cosmicSignatureGameV4Proxy;
		const auction_ = contracts_.cosmicSignatureArtAuction;
		const collector_ = contracts_.signers[2];
		const nft_ = contracts_.cosmicSignatureNft.connect(collector_);
		const stakingWallet_ = contracts_.stakingWalletCosmicSignatureNft.connect(collector_);
		const sourceReceipt_ = await activateRoundBidAndClaimMainPrize(contracts_, game_);
		const batch_ = findParsedEvent(sourceReceipt_, auction_, "AuctionBatchRegistered");
		const nftId_ = batch_.args.firstNftId;
		await setNextBlockTimeToAtLeast(batch_.args.eligibleAt);
		const price_ = 10n ** 13n;
		await waitForTransactionReceipt(auction_.connect(collector_).bid(nftId_, price_, { value: price_ }));
		await setNextBlockTimeToAtLeast((await auction_.getAuction(nftId_)).endAt);
		await waitForTransactionReceipt(auction_.settle(nftId_));
		await waitForTransactionReceipt(auction_.connect(collector_).claimNft(nftId_, collector_.address));
		await waitForTransactionReceipt(nft_.setNftName(nftId_, "A collector's moving signature"));
		expect(await nft_.getNftName(nftId_)).equal("A collector's moving signature");
		await waitForTransactionReceipt(nft_.approve(stakingWallet_, nftId_));
		const stakeReceipt_ = await waitForTransactionReceipt(stakingWallet_.stake(nftId_));
		const stakeEvent_ = findParsedEvent(stakeReceipt_, stakingWallet_, "NftStaked");
		const stakeActionId_ = stakeEvent_.args.stakeActionId;
		expect(await nft_.ownerOf(nftId_)).equal(await stakingWallet_.getAddress());
		expect(await stakingWallet_.numStakedNfts()).equal(1n);
		const rewardBefore_ = await stakingWallet_.rewardAmountPerStakedNft();
		await waitForTransactionReceipt(auction_.forwardProceeds(nftId_));
		await activateRoundBidAndClaimMainPrize(contracts_, game_);
		const reward_ = await stakingWallet_.rewardAmountPerStakedNft() - rewardBefore_;
		expect(reward_).greaterThan(0n);
		await expect(stakingWallet_.unstake(stakeActionId_)).changeEtherBalance(collector_, reward_);
		expect(await nft_.ownerOf(nftId_)).equal(collector_.address);
		expect(await stakingWallet_.numStakedNfts()).equal(0n);
		await expect(stakingWallet_.stake(nftId_)).revertedWithCustomError(stakingWallet_, "NftHasAlreadyBeenStaked");
	});
});
