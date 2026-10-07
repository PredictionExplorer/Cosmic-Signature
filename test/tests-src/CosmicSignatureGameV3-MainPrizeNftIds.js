"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");
const { bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

async function stakeRandomWalkNfts(contracts_, staker_, numNfts_) {
	await waitForTransactionReceipt(contracts_.randomWalkNft.connect(staker_).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true));
	const nftIds_ = [];
	for (let nftIndex_ = 0; nftIndex_ < numNfts_; ++ nftIndex_) {
		const nftId_ = await contracts_.randomWalkNft.nextTokenId();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(staker_).mint({ value: await contracts_.randomWalkNft.getMintPrice(), }));
		nftIds_.push(nftId_);
	}
	await waitForTransactionReceipt(contracts_.stakingWalletRandomWalkNft.connect(staker_).stakeMany(nftIds_));
}

/**
Maps each Cosmic Signature NFT ID announced by the main prize claim events to the announced owner.
Fails if an ID is announced more than once.
*/
function getAnnouncedNftOwners(receipt_, game_) {
	const announcedNftOwners_ = new Map();
	const announce_ = (nftId_, ownerAddress_, eventName_) => {
		expect(announcedNftOwners_.has(nftId_), `NFT ${nftId_} announced again by ${eventName_}`).equal(false);
		announcedNftOwners_.set(nftId_, ownerAddress_);
	};
	let numRandomWalkNftStakerPrizes_ = 0;
	for (const log_ of receipt_.logs) {
		if (log_.address !== game_.target) {
			continue;
		}
		const parsedLog_ = game_.interface.parseLog(log_);
		const args_ = parsedLog_?.args;
		switch (parsedLog_?.name) {
			case "MainPrizeClaimed": {
				for (let nftIndex_ = 0n; nftIndex_ < args_.prizeNumCosmicSignatureNfts; ++ nftIndex_) {
					announce_(args_.prizeFirstCosmicSignatureNftId + nftIndex_, args_.beneficiaryAddress, parsedLog_.name);
				}
				break;
			}
			case "RaffleWinnerPrizePaid": {
				announce_(args_.prizeCosmicSignatureNftId, args_.winnerAddress, parsedLog_.name);
				if (args_.winnerIsRandomWalkNftStaker) {
					++ numRandomWalkNftStakerPrizes_;
				}
				break;
			}
			case "ChronoWarriorPrizePaid": {
				announce_(args_.prizeCosmicSignatureNftId, args_.chronoWarriorAddress, parsedLog_.name);
				break;
			}
			case "EnduranceChampionPrizePaid": {
				announce_(args_.prizeCosmicSignatureNftId, args_.enduranceChampionAddress, parsedLog_.name);
				break;
			}
			case "LastCstBidderPrizePaid": {
				announce_(args_.prizeCosmicSignatureNftId, args_.lastCstBidderAddress, parsedLog_.name);
				break;
			}
		}
	}
	return { announcedNftOwners_, numRandomWalkNftStakerPrizes_, };
}

describe("CosmicSignatureGameV3-MainPrizeNftIds", function () {
	it("announces every minted Cosmic Signature NFT exactly once, with its actual owner", async function () {
		for (const hasCstBid_ of [false, true,]) {
			for (const hasRandomWalkNftStakers_ of [false, true,]) {
				const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
				const game_ = contracts_.cosmicSignatureGameV3Proxy;
				const [bidder1_, bidder2_, bidder3_, staker1_, staker2_,] = contracts_.signers.slice(1, 6);
				if (hasRandomWalkNftStakers_) {
					await stakeRandomWalkNfts(contracts_, staker1_, 2);
					await stakeRandomWalkNfts(contracts_, staker2_, 1);
				}
				await activateCurrentRound(game_, contracts_.ownerSigner);
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 1n);
				await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 1n);
				if (hasCstBid_) {
					// Bid when the CST bid price is zero, so the bidder needs no CST.
					const cstDutchAuctionEndTimeStamp_ =
						(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(cstDutchAuctionEndTimeStamp_ + 1n),]);
					await waitForTransactionReceipt(game_.connect(bidder3_).bidWithCst((1n << 255n), "", 0n));
				}
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 1n);
				const nftTotalSupplyBefore_ = await contracts_.cosmicSignatureNft.totalSupply();
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
				const receipt_ = await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
				const nftTotalSupplyAfter_ = await contracts_.cosmicSignatureNft.totalSupply();

				const { announcedNftOwners_, numRandomWalkNftStakerPrizes_, } = getAnnouncedNftOwners(receipt_, game_);
				const scenarioName_ = `hasCstBid=${hasCstBid_}, hasRandomWalkNftStakers=${hasRandomWalkNftStakers_}`;
				expect(BigInt(announcedNftOwners_.size), scenarioName_).equal(nftTotalSupplyAfter_ - nftTotalSupplyBefore_);
				expect(numRandomWalkNftStakerPrizes_ > 0, scenarioName_).equal(hasRandomWalkNftStakers_);
				for (const [nftId_, announcedOwnerAddress_,] of announcedNftOwners_) {
					expect(nftId_, scenarioName_).greaterThanOrEqual(nftTotalSupplyBefore_);
					expect(nftId_, scenarioName_).lessThan(nftTotalSupplyAfter_);
					expect(await contracts_.cosmicSignatureNft.ownerOf(nftId_), `${scenarioName_}, NFT ${nftId_}`).equal(announcedOwnerAddress_);
				}
			}
		}
	});
});
