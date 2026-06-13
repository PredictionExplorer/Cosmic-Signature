// todo-0 We use Hardhat, not Anvil.
// todo-0 Get rid of any mentiongs of Anvil and remove it from this file name.

"use strict";

const hre = require("hardhat");

const GAME_PROXY_ADDRESS = "0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2";
const TIMESTAMP_9000_01_01 = 221845392000n;
const BIG_BALANCE = "0x100000000000000000000000000";

// Storage slots from `solc --storage-layout` (see scripts/verify-v1-v2-storage-layouts.js).
// These are the slots the V2 upgrade repurposes; raw-slot reads here cross-check the compiler
// layout against the real migrated proxy state, independently of `unsafeSkipStorageCheck`.
const SLOT_CST_DUTCH_AUCTION_DURATION = 277n;       // V1 cstDutchAuctionDurationDivisor -> V2 cstDutchAuctionDuration
const SLOT_BID_CST_REWARD = 283n;                   // V1 (cst)RewardAmountForBidding -> V2 bidCstRewardAmountMultiplier
const SLOT_CST_DURATION_CHANGE_DIVISOR = 307n;      // old persistent gap slot -> V2 cstDutchAuctionDurationChangeDivisor
const SLOT_ROUND_NUM = 267n;
const SLOT_TOKEN = 297n;
const SLOT_CHARITY_ADDRESS = 305n;

async function readSlot(address_, slot_) {
	const raw_ = await hre.ethers.provider.getStorage(address_, slot_);
	return BigInt(raw_);
}

// todo-0 This function exists in another JavaScript file. Why can't you simply import it from there? Do not duplicate existing code.
async function waitForTransactionReceipt(transactionResponsePromise_) {
	const transactionResponse_ = await transactionResponsePromise_;
	return await transactionResponse_.wait();
}

async function impersonateAccount(address_) {
	try {
		await hre.network.provider.request({
			method: "anvil_impersonateAccount",
			params: [address_],
		});
	} catch {
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [address_],
		});
	}
}

async function setForkBalance(address_) {
	try {
		await hre.network.provider.request({
			method: "anvil_setBalance",
			params: [address_, BIG_BALANCE],
		});
	} catch {
		await hre.network.provider.request({
			method: "hardhat_setBalance",
			params: [address_, BIG_BALANCE],
		});
	}
}

async function main() {
	if (hre.network.name != "hardhat_on_localhost") {
		throw new Error("Run this against an Anvil fork with: npx hardhat --network hardhat_on_localhost run scripts/rehearse-v2-upgrade-on-anvil-fork.js");
	}

	const [funder_] = await hre.ethers.getSigners();
	await setForkBalance(funder_.address);

	const cosmicSignatureGameFactory_ = await hre.ethers.getContractFactory("CosmicSignatureGame");
	const gameV1_ = cosmicSignatureGameFactory_.attach(GAME_PROXY_ADDRESS);

	const ownerAddress_ = await gameV1_.owner();
	console.info("owner", ownerAddress_);
	console.info("round before", (await gameV1_.roundNum()).toString());
	const implementationSlot_ = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
	// todo-0 Call `hre.upgrades.erc1967.getImplementationAddress` instead. It will make this call internally.
	const implementationBefore_ = await hre.ethers.provider.getStorage(GAME_PROXY_ADDRESS, implementationSlot_);
	console.info("implementation before", "0x" + implementationBefore_.slice(26));

	const tokenAddressBefore_ = await gameV1_.token();
	const nftAddressBefore_ = await gameV1_.nft();
	const prizesWalletAddressBefore_ = await gameV1_.prizesWallet();
	const ethDutchAuctionBeginningBidPriceBefore_ = await gameV1_.ethDutchAuctionBeginningBidPrice();
	if (ethDutchAuctionBeginningBidPriceBefore_ <= 0n) {
		throw new Error("ethDutchAuctionBeginningBidPrice is zero; V2 must not be activated in this state.");
	}

	if ((await gameV1_.roundNum()) == 0n) {
		const lastBidderAddress_ = await gameV1_.lastBidderAddress();
		if (lastBidderAddress_ == hre.ethers.ZeroAddress) {
			throw new Error("Round 0 has no bidder; the live upgrade precondition is not met.");
		}
		console.info("last bidder", lastBidderAddress_);
		await impersonateAccount(lastBidderAddress_);
		await setForkBalance(lastBidderAddress_);
		const lastBidderSigner_ = await hre.ethers.getSigner(lastBidderAddress_);
		const mainPrizeTime_ = await gameV1_.mainPrizeTime();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		if (BigInt(latestBlock_.timestamp) < mainPrizeTime_) {
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_)]);
		}
		console.info("claiming round 0");
		await waitForTransactionReceipt(gameV1_.connect(lastBidderSigner_).claimMainPrize({ gasLimit: 2_000_000_000_000n }));
	}
	if ((await gameV1_.roundNum()) != 1n) {
		throw new Error(`Expected round 1 before upgrade, got round ${await gameV1_.roundNum()}.`);
	}
	console.info("round after claim", (await gameV1_.roundNum()).toString());

	await impersonateAccount(ownerAddress_);
	await setForkBalance(ownerAddress_);
	const ownerSigner_ = await hre.ethers.getSigner(ownerAddress_);
	await waitForTransactionReceipt(gameV1_.connect(ownerSigner_).setRoundActivationTime(TIMESTAMP_9000_01_01));
	console.info("frozen activation", (await gameV1_.roundActivationTime()).toString());

	const cosmicSignatureGameV2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", funder_);
	const gameV2Implementation_ = await cosmicSignatureGameV2Factory_.deploy();
	await gameV2Implementation_.waitForDeployment();
	const gameV2ImplementationAddress_ = await gameV2Implementation_.getAddress();
	console.info("deployed V2 implementation", gameV2ImplementationAddress_);

	// Raw storage slots immediately BEFORE the upgrade (deployed-V1 semantics still in the proxy).
	const slotDurationBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CST_DUTCH_AUCTION_DURATION);
	const slotRewardBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_BID_CST_REWARD);
	const slotChangeDivisorBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CST_DURATION_CHANGE_DIVISOR);
	const slotRoundNumBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_ROUND_NUM);
	const slotTokenBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_TOKEN);
	const slotCharityBefore_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CHARITY_ADDRESS);
	console.info("raw slot 277 (duration divisor) before:", slotDurationBefore_.toString());
	console.info("raw slot 283 (bid CST reward) before:", slotRewardBefore_.toString());
	console.info("raw slot 307 (old gap) before:", slotChangeDivisorBefore_.toString());
	if (slotChangeDivisorBefore_ != 0n) {
		throw new Error("Old persistent gap slot 307 is not zero before upgrade; it must be empty to receive the new variable.");
	}

	const upgradeInterface_ = new hre.ethers.Interface(["function upgradeToAndCall(address newImplementation, bytes data) payable"]);
	const initializeV2CallData_ = cosmicSignatureGameV2Factory_.interface.encodeFunctionData("initializeV2", []);
	await waitForTransactionReceipt(
		ownerSigner_.sendTransaction({
			to: GAME_PROXY_ADDRESS,
			data: upgradeInterface_.encodeFunctionData("upgradeToAndCall", [gameV2ImplementationAddress_, initializeV2CallData_]),
			gasLimit: 30_000_000n,
		})
	);

	// Raw storage slots AFTER the upgrade. They must reconcile with both the getters and the layout.
	const slotDurationAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CST_DUTCH_AUCTION_DURATION);
	const slotRewardAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_BID_CST_REWARD);
	const slotChangeDivisorAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CST_DURATION_CHANGE_DIVISOR);
	const slotRoundNumAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_ROUND_NUM);
	const slotTokenAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_TOKEN);
	const slotCharityAfter_ = await readSlot(GAME_PROXY_ADDRESS, SLOT_CHARITY_ADDRESS);
	console.info("raw slot 277 (cstDutchAuctionDuration) after:", slotDurationAfter_.toString());
	console.info("raw slot 283 (bidCstRewardAmountMultiplier) after:", slotRewardAfter_.toString());
	console.info("raw slot 307 (cstDutchAuctionDurationChangeDivisor) after:", slotChangeDivisorAfter_.toString());

	// Preserved slots must be byte-identical across the upgrade transaction itself.
	if (slotRoundNumAfter_ != slotRoundNumBefore_) throw new Error("roundNum slot changed during the upgrade.");
	if (slotTokenAfter_ != slotTokenBefore_) throw new Error("token slot changed during the upgrade.");
	if (slotCharityAfter_ != slotCharityBefore_) throw new Error("charityAddress slot changed during the upgrade.");

	const gameV2_ = cosmicSignatureGameV2Factory_.attach(GAME_PROXY_ADDRESS);
	const implementationAfter_ = await hre.ethers.provider.getStorage(GAME_PROXY_ADDRESS, implementationSlot_);
	if (("0x" + implementationAfter_.slice(26)).toLowerCase() != gameV2ImplementationAddress_.toLowerCase()) {
		throw new Error("Implementation slot does not point to the deployed V2 implementation.");
	}
	if ((await gameV2_.owner()).toLowerCase() != ownerAddress_.toLowerCase()) throw new Error("Owner changed.");
	if ((await gameV2_.token()).toLowerCase() != tokenAddressBefore_.toLowerCase()) throw new Error("Token address changed.");
	if ((await gameV2_.nft()).toLowerCase() != nftAddressBefore_.toLowerCase()) throw new Error("NFT address changed.");
	if ((await gameV2_.prizesWallet()).toLowerCase() != prizesWalletAddressBefore_.toLowerCase()) throw new Error("PrizesWallet address changed.");
	if ((await gameV2_.ethDutchAuctionBeginningBidPrice()) != ethDutchAuctionBeginningBidPriceBefore_) throw new Error("ETH Dutch auction beginning price changed.");

	console.info("round after upgrade", (await gameV2_.roundNum()).toString());
	console.info("cstDutchAuctionDuration", (await gameV2_.cstDutchAuctionDuration()).toString());
	console.info("cstDutchAuctionDurationChangeDivisor", (await gameV2_.cstDutchAuctionDurationChangeDivisor()).toString());
	console.info("bidCstRewardAmountMultiplier", (await gameV2_.bidCstRewardAmountMultiplier()).toString());
	console.info("timeoutDurationToClaimMainPrize", (await gameV2_.timeoutDurationToClaimMainPrize()).toString());
	if ((await gameV2_.cstDutchAuctionDuration()) != 43200n) throw new Error("Bad cstDutchAuctionDuration.");
	if ((await gameV2_.cstDutchAuctionDurationChangeDivisor()) != 250n) throw new Error("Bad cstDutchAuctionDurationChangeDivisor.");
	if ((await gameV2_.timeoutDurationToClaimMainPrize()) != 172800n) throw new Error("Bad timeoutDurationToClaimMainPrize.");

	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	const round1ActivationTime_ = BigInt(latestBlock_.timestamp) + 2n;
	await waitForTransactionReceipt(gameV2_.connect(ownerSigner_).setRoundActivationTime(round1ActivationTime_));
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(round1ActivationTime_)]);
	await hre.ethers.provider.send("evm_mine");
	const nextEthBidPrice_ = await gameV2_.getNextEthBidPrice();
	console.info("next ETH bid price", nextEthBidPrice_.toString());
	if (nextEthBidPrice_ <= 0n) throw new Error("Next ETH bid price is not positive.");

	// Reconcile raw slots against the V2 getters (the layout is correct only if these agree).
	if (slotDurationAfter_ != (await gameV2_.cstDutchAuctionDuration())) throw new Error("slot 277 != cstDutchAuctionDuration() getter.");
	if (slotRewardAfter_ != (await gameV2_.bidCstRewardAmountMultiplier())) throw new Error("slot 283 != bidCstRewardAmountMultiplier() getter.");
	if (slotChangeDivisorAfter_ != (await gameV2_.cstDutchAuctionDurationChangeDivisor())) throw new Error("slot 307 != cstDutchAuctionDurationChangeDivisor() getter.");
	if (slotDurationAfter_ != 43200n) throw new Error("slot 277 did not become 43200 after initializeV2.");
	if (slotChangeDivisorAfter_ != 250n) throw new Error("slot 307 did not become 250 after initializeV2.");
	console.info("raw-slot/getter reconciliation OK");

	// Full V2 round on the migrated real state: ETH bids, a CST bid, then claim.
	const bidder_ = funder_;
	const bidder2_ = (await hre.ethers.getSigners())[1];
	await setForkBalance(bidder2_.address);

	const ethPrice1_ = await gameV2_.getNextEthBidPrice();
	await waitForTransactionReceipt(gameV2_.connect(bidder_).bidWithEth(-1n, "fork v2 round", 0n, { value: ethPrice1_, gasLimit: 30_000_000n }));
	const ethPrice2_ = await gameV2_.getNextEthBidPrice();
	await waitForTransactionReceipt(gameV2_.connect(bidder2_).bidWithEth(-1n, "fork v2 round 2", 0n, { value: ethPrice2_, gasLimit: 30_000_000n }));
	console.info("placed 2 V2 ETH bids; last bidder", await gameV2_.lastBidderAddress());

	// Advance past the CST auction so a CST bid is cheap, then place one if affordable.
	const cstDuration_ = await gameV2_.cstDutchAuctionDuration();
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number((await gameV2_.cstDutchAuctionBeginningTimeStamp()) + cstDuration_ + 1n)]);
	await hre.ethers.provider.send("evm_mine");
	const cstPrice_ = await gameV2_.getNextCstBidPrice();
	const bidder2CstBalance_ = await (await hre.ethers.getContractAt("CosmicSignatureToken", await gameV2_.token())).balanceOf(bidder2_.address);
	if (bidder2CstBalance_ >= cstPrice_) {
		await waitForTransactionReceipt(gameV2_.connect(bidder2_).bidWithCst(hre.ethers.MaxUint256, "fork v2 cst", 0n, { gasLimit: 30_000_000n }));
		console.info("placed a V2 CST bid at price", cstPrice_.toString());
	} else {
		console.info("skipped CST bid (insufficient CST); price was", cstPrice_.toString());
	}

	// Claim the V2 round with the current last bidder, proving a full round completes on migrated state.
	const lastBidder_ = await gameV2_.lastBidderAddress();
	const lastBidderSigner2_ = lastBidder_.toLowerCase() === bidder_.address.toLowerCase() ? bidder_ : bidder2_;
	const mainPrizeTime2_ = await gameV2_.mainPrizeTime();
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime2_) + 1]);
	await waitForTransactionReceipt(gameV2_.connect(lastBidderSigner2_).claimMainPrize({ gasLimit: 2_000_000_000_000n }));
	const roundAfterClaim2_ = await gameV2_.roundNum();
	console.info("round after V2 claim", roundAfterClaim2_.toString());
	if (roundAfterClaim2_ != 2n) throw new Error("V2 round did not complete (roundNum should be 2).");

	console.info("ANVIL_FORK_REHEARSAL_OK");
}

main().catch((errorObject_) => {
	console.error("ANVIL_FORK_REHEARSAL_FAIL", errorObject_);
	process.exitCode = 1;
});
