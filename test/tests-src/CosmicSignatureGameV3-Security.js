"use strict";

// Tests V3 interactions with hostile ETH recipients and broken donated tokens.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
} = require("../src/V3UpgradeTestHelpers.js");

async function deployHostileBidder(game_, deployerSigner_) {
	const hostileBidderFactory_ = await hre.ethers.getContractFactory("HostileBidder", deployerSigner_);
	const hostileBidder_ = await hostileBidderFactory_.deploy(await game_.getAddress());
	await hostileBidder_.waitForDeployment();
	return hostileBidder_;
}

async function deployBrokenToken(prizesWallet_, deployerSigner_) {
	const brokenTokenFactory_ = await hre.ethers.getContractFactory("BrokenToken", deployerSigner_);
	const brokenToken_ = await brokenTokenFactory_.deploy(await prizesWallet_.getAddress());
	await brokenToken_.waitForDeployment();
	return brokenToken_;
}

async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const bidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	return waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, { value: bidPrice_ })
	);
}

describe("CosmicSignatureGameV3-Security", function () {
	it("a charity that reenters the game cannot block main-prize claiming", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const hostileCharity_ = await deployHostileBidder(game_, contracts_.signers[10]);
		const hostileCharityAddress_ = await hostileCharity_.getAddress();

		// Mode 4 reenters `bidWithEth` whenever the charity receives ETH.
		await waitForTransactionReceipt(hostileCharity_.setHostilityModeCode(4n));
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setCharityAddress(hostileCharityAddress_)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[1];
		await bidWithEthAt(game_, bidder_, (await getLatestBlockTimestamp()) + 10n);
		const roundNum_ = await game_.roundNum();
		const charityAmount_ = await game_.getCharityEthDonationAmount();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);

		// Charity payout is best-effort: reentry makes the transfer fail, but claiming still completes.
		await expect(game_.connect(bidder_).claimMainPrize())
			.emit(game_, "FundTransferFailed")
			.withArgs("ETH transfer to charity failed.", hostileCharityAddress_, charityAmount_);
		expect(await game_.roundNum()).equal(roundNum_ + 1n);
	});

	it("broken ERC-20 and ERC-721 donation transfers revert the whole bid atomically", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const brokenToken_ = await deployBrokenToken(contracts_.prizesWallet, contracts_.signers[10]);
		await waitForTransactionReceipt(brokenToken_.setModeCode(1n));
		const brokenTokenAddress_ = await brokenToken_.getAddress();
		const bidder_ = contracts_.signers[1];

		await expect(
			game_.connect(bidder_).bidWithEthAndDonateToken(
				-1n,
				"",
				0n,
				brokenTokenAddress_,
				1n,
				{ value: 10n ** 18n }
			)
		).revertedWith("BrokenToken rejects transferFrom.");
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);

		const donatedNftIndex_ = await contracts_.prizesWallet.nextDonatedNftIndex();
		await expect(
			game_.connect(bidder_).bidWithEthAndDonateNft(
				-1n,
				"",
				0n,
				brokenTokenAddress_,
				42n,
				{ value: 10n ** 18n }
			)
		).revertedWith("BrokenToken rejects transferFrom.");
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		expect(await contracts_.prizesWallet.nextDonatedNftIndex()).equal(donatedNftIndex_);
	});

	it("a donated NFT that rejects its claim remains claimable later", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder_ = contracts_.signers[1];

		const brokenToken_ = await deployBrokenToken(contracts_.prizesWallet, contracts_.signers[10]);
		const brokenTokenAddress_ = await brokenToken_.getAddress();
		const nftId_ = 42n;
		await waitForTransactionReceipt(brokenToken_.mintNft(bidder_.address, nftId_));

		const donatedNftIndex_ = await contracts_.prizesWallet.nextDonatedNftIndex();
		await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEthAndDonateNft(
				-1n,
				"",
				0n,
				brokenTokenAddress_,
				nftId_,
				{ value: 10n ** 18n }
			)
		);
		expect(await brokenToken_.ownerOf(nftId_)).equal(await contracts_.prizesWallet.getAddress());

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());

		await waitForTransactionReceipt(brokenToken_.setModeCode(2n));
		await expect(
			contracts_.prizesWallet.connect(bidder_).claimDonatedNft(donatedNftIndex_)
		).revertedWith("BrokenToken rejects claim transfer.");

		// Reverting the transfer also restores the preceding record deletion, so the NFT is not lost.
		const donatedNftAfterFailedClaim_ = await contracts_.prizesWallet.donatedNfts(donatedNftIndex_);
		expect(donatedNftAfterFailedClaim_.nftAddress).equal(brokenTokenAddress_);
		expect(await brokenToken_.ownerOf(nftId_)).equal(await contracts_.prizesWallet.getAddress());

		await waitForTransactionReceipt(brokenToken_.setModeCode(0n));
		await waitForTransactionReceipt(
			contracts_.prizesWallet.connect(bidder_).claimDonatedNft(donatedNftIndex_)
		);
		expect(await brokenToken_.ownerOf(nftId_)).equal(bidder_.address);
		expect((await contracts_.prizesWallet.donatedNfts(donatedNftIndex_)).nftAddress)
			.equal(hre.ethers.ZeroAddress);
	});
});
