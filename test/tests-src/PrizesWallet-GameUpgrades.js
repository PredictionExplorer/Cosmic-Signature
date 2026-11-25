"use strict";

const { expect } = require("chai");
const { describe, it } = require("mocha");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { upgradeGameToV2, activateCurrentRound, getLatestBlockTimestamp } = require("../src/GameV2UpgradeTestHelpers.js");
const { upgradeGameToV3 } = require("../src/GameV3UpgradeTestHelpers.js");
const { bidWithEthAt, finishGameRound } = require("../src/GameRoundTestHelpers.js");

const DONATED_TOKEN_AMOUNT = 10n ** 18n;

/** Places an ETH bid with a donation, paying the exact price quoted for the next block. */
async function bidWithEthAndDonate(game_, bidder_, methodName_, donatedContractAddress_, donatedAmountOrNftId_) {
	const args_ = [-1n, ""];
	if (game_.interface.getFunction("bidWithEth").inputs.length === 3) {
		args_.push(0n);
	}
	const timeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	return waitForTransactionReceipt(
		game_.connect(bidder_)[methodName_](...args_, donatedContractAddress_, donatedAmountOrNftId_, { value: ethBidPrice_, })
	);
}

describe("PrizesWallet-GameUpgrades", function () {
	it("keeps the V1 wallet and pays unclaimed ETH, token and NFT prizes from every game version", async function () {
		const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
		const prizesWallet_ = contracts_.prizesWallet;
		const prizesWalletAddress_ = contracts_.prizesWalletAddress;
		const donor_ = contracts_.signers[1];
		const mockErc20_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner)).deploy();
		await mockErc20_.waitForDeployment();
		const mockErc20Address_ = await mockErc20_.getAddress();
		const mockErc721_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner)).deploy();
		await mockErc721_.waitForDeployment();
		const mockErc721Address_ = await mockErc721_.getAddress();

		await waitForTransactionReceipt(mockErc20_.mint(donor_.address, 3n * DONATED_TOKEN_AMOUNT));
		await waitForTransactionReceipt(mockErc20_.connect(donor_).approve(prizesWalletAddress_, 3n * DONATED_TOKEN_AMOUNT));
		await waitForTransactionReceipt(mockErc721_.connect(donor_).setApprovalForAll(prizesWalletAddress_, true));

		const rounds_ = [];
		let game_ = contracts_.cosmicSignatureGameProxy;
		for (let version_ = 1; version_ <= 3; ++ version_) {
			if (version_ === 2) {
				await upgradeGameToV2(contracts_);
				game_ = contracts_.cosmicSignatureGameV2Proxy;
			} else if (version_ === 3) {
				await upgradeGameToV3(contracts_);
				game_ = contracts_.cosmicSignatureGameV3Proxy;
			}
			expect(await game_.prizesWallet()).equal(prizesWalletAddress_);
			const roundNum_ = await game_.roundNum();
			const beneficiary_ = contracts_.signers[version_ + 1];
			const donatedNftIndex_ = await prizesWallet_.nextDonatedNftIndex();
			const nftId_ = BigInt(version_);
			await waitForTransactionReceipt(mockErc721_.mint(donor_.address));
			await activateCurrentRound(game_, contracts_.ownerSigner);
			await bidWithEthAndDonate(game_, donor_, "bidWithEthAndDonateToken", mockErc20Address_, DONATED_TOKEN_AMOUNT);
			await bidWithEthAndDonate(game_, donor_, "bidWithEthAndDonateNft", mockErc721Address_, nftId_);
			await bidWithEthAt(game_, beneficiary_, (await getLatestBlockTimestamp()) + 1n);
			const balanceBeforeClaim_ = await hre.ethers.provider.getBalance(prizesWalletAddress_);
			await finishGameRound(contracts_, game_);
			const donorEthPrize_ = await prizesWallet_["getEthBalanceAmount(uint256,address)"](roundNum_, donor_.address);
			const beneficiaryEthPrize_ = await prizesWallet_["getEthBalanceAmount(uint256,address)"](roundNum_, beneficiary_.address);
			expect(donorEthPrize_ + beneficiaryEthPrize_).greaterThan(0n);
			expect(donorEthPrize_ + beneficiaryEthPrize_).equal((await hre.ethers.provider.getBalance(prizesWalletAddress_)) - balanceBeforeClaim_);
			rounds_.push({ roundNum_, beneficiary_, donatedNftIndex_, nftId_, donorEthPrize_, beneficiaryEthPrize_ });
		}

		// Wait until both upgrades have completed before retrieving any prize.
		for (const { roundNum_, beneficiary_, donatedNftIndex_, nftId_, donorEthPrize_, beneficiaryEthPrize_ } of rounds_) {
			expect(await prizesWallet_.mainPrizeBeneficiaryAddresses(roundNum_)).equal(beneficiary_.address);
			expect(await prizesWallet_.roundTimeoutTimesToWithdrawPrizes(roundNum_)).greaterThan(await getLatestBlockTimestamp());
			expect(await prizesWallet_.getDonatedTokenBalanceAmount(roundNum_, mockErc20Address_)).equal(DONATED_TOKEN_AMOUNT);
			expect((await prizesWallet_.donatedNfts(donatedNftIndex_)).nftId).equal(nftId_);
			await expect(prizesWallet_.connect(donor_)["withdrawEth(uint256)"](roundNum_)).changeEtherBalance(donor_, donorEthPrize_);
			await expect(prizesWallet_.connect(beneficiary_)["withdrawEth(uint256)"](roundNum_)).changeEtherBalance(beneficiary_, beneficiaryEthPrize_);
			await waitForTransactionReceipt(prizesWallet_.connect(beneficiary_).claimDonatedToken(roundNum_, mockErc20Address_, 0n));
			expect(await mockErc20_.balanceOf(beneficiary_.address)).equal(DONATED_TOKEN_AMOUNT);
			await waitForTransactionReceipt(prizesWallet_.connect(beneficiary_).claimDonatedNft(donatedNftIndex_));
			expect(await mockErc721_.ownerOf(nftId_)).equal(beneficiary_.address);
		}
		expect(await hre.ethers.provider.getBalance(prizesWalletAddress_)).equal(0n);
	});
});
