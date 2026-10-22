"use strict";

// Default: read-only inspection. The opt-in rehearsal changes only an in-process Hardhat fork.
const assert = require("node:assert/strict");
const { inspectV4Upgrade, baseline } = require("./inspect-v4-art-auction-upgrade.js");
let completedRehearsal = false;
let rehearsalStage = "configuration";
const safeConfigurationDetails = new Set([
	"A V4 rehearsal is permitted only on the in-process hardhat network.",
	"Use the production build without preprocessing for the fork rehearsal.",
	"Use --config hardhat.art-auction-fork.config.js to initialize the pinned fork before provider creation.",
]);

process.on("exit", () => {
	if (process.env.RUN_V4_FORK_REHEARSAL === "1" && !completedRehearsal) {
		console.error("V4 fork rehearsal did not complete; no successful result may be inferred from the runner.");
		process.exitCode = 1;
	}
});

async function rehearseV4Upgrade() {
	if (process.env.RUN_V4_FORK_REHEARSAL !== "1") {
		rehearsalStage = "read-only deployment inspection";
		console.log(JSON.stringify({ ...await inspectV4Upgrade(), rehearsal: "Not enabled. Set RUN_V4_FORK_REHEARSAL=1 on the hardhat network to rehearse locally." }, null, 2));
		return;
	}
	// Load Hardhat inside the guarded entry point: initialization errors can also
	// contain the endpoint, including credentials in its path or query string.
	const hre = require("hardhat");
	const { readValidations } = require("@openzeppelin/hardhat-upgrades/dist/utils/validations");
	const { getUnlinkedBytecode, getVersion, getStorageLayout, getStorageUpgradeReport, withValidationDefaults } = require("@openzeppelin/upgrades-core");
	if (hre.network.name !== "hardhat") throw new Error("A V4 rehearsal is permitted only on the in-process hardhat network.");
	if (process.env.ENABLE_HARDHAT_PREPROCESSOR === "true") throw new Error("Use the production build without preprocessing for the fork rehearsal.");
	const blockNumber_ = baseline.observation.blockNumber;
	if (hre.network.config.forking?.blockNumber !== blockNumber_) {
		throw new Error("Use --config hardhat.art-auction-fork.config.js to initialize the pinned fork before provider creation.");
	}
	rehearsalStage = "verify deployed V3 baseline";
	assert.equal(await hre.ethers.provider.getCode(baseline.implementationAddress), baseline.runtimeBytecode);
	assert.equal(await hre.upgrades.erc1967.getImplementationAddress(baseline.proxyAddress), baseline.implementationAddress);
	const initialBlock_ = await hre.ethers.provider.getBlock(blockNumber_);
	assert.equal(initialBlock_.hash, baseline.observation.blockHash);
	// Execute calls in a local block with the configured EVM semantics. EDR cannot
	// infer Arbitrum's hardfork history when executing directly in the remote block.
	await hre.network.provider.send("evm_mine");
	rehearsalStage = "prepare local Arbitrum precompile shims";
	// Arbitrum exposes 0xfe marker bytecode at native precompile addresses. An
	// Ethereum EVM executes that marker as INVALID instead of the native handler.
	// Use the repository's explicit test shims for these entropy-only calls.
	const precompileShims_ = [
		["0x0000000000000000000000000000000000000064", "FakeArbSys"],
		["0x000000000000000000000000000000000000006c", "FakeArbGasInfo"],
	];
	for (const [address_, contractName_] of precompileShims_) {
		assert.equal(await hre.ethers.provider.getCode(address_), "0xfe");
		const artifact_ = await hre.artifacts.readArtifact(contractName_);
		await hre.network.provider.send("hardhat_setCode", [address_, artifact_.deployedBytecode]);
	}
	const gameV3_ = await hre.ethers.getContractAt("CosmicSignatureGameV3", baseline.proxyAddress);
	rehearsalStage = "prepare local owner and existing cycle";
	const ownerAddress_ = await gameV3_.owner();
	await hre.network.provider.send("hardhat_impersonateAccount", [ownerAddress_]);
	await hre.network.provider.send("hardhat_setBalance", [ownerAddress_, hre.ethers.toQuantity(100n * 10n ** 18n)]);
	const owner_ = await hre.ethers.getSigner(ownerAddress_);
	const nftAddress_ = await gameV3_.nft();
	const nft_ = await hre.ethers.getContractAt("CosmicSignatureNft", nftAddress_);
	const sourceCycle_ = await gameV3_.roundNum();
	let priorFinalizationGas_ = null;
	let latest_ = await hre.ethers.provider.getBlock("latest");
	if (BigInt(latest_.timestamp) >= await gameV3_.roundActivationTime()) {
		const lastBidder_ = await gameV3_.lastBidderAddress();
		if (lastBidder_ !== hre.ethers.ZeroAddress) {
			await hre.network.provider.send("hardhat_impersonateAccount", [lastBidder_]);
			await hre.network.provider.send("hardhat_setBalance", [lastBidder_, hre.ethers.toQuantity(100n * 10n ** 18n)]);
			const signer_ = await hre.ethers.getSigner(lastBidder_);
			const deadline_ = await gameV3_.mainPrizeTime();
			await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(deadline_ > BigInt(latest_.timestamp) ? deadline_ : BigInt(latest_.timestamp) + 1n)]);
			rehearsalStage = "finalize existing V3 cycle on local fork";
			priorFinalizationGas_ = (await (await gameV3_.connect(signer_).claimMainPrize({ gasLimit: 16_777_216 })).wait()).gasUsed.toString();
		} else {
			await (await gameV3_.connect(owner_).setRoundActivationTime(BigInt(latest_.timestamp) + 86400n)).wait();
		}
	}
	const firstV4Cycle_ = await gameV3_.roundNum();
	const scalarSlots_ = [...new Set(baseline.layout.storage.filter(item_ => item_.label !== "__gap_persistent").map(item_ => item_.slot))];
	async function snapshot_() {
		const result_ = {};
		for (let index_ = 0; index_ < scalarSlots_.length; index_ += 8) {
			await Promise.all(scalarSlots_.slice(index_, index_ + 8).map(async slot_ => { result_[slot_] = await hre.ethers.provider.getStorage(baseline.proxyAddress, slot_); }));
		}
		return result_;
	}
	rehearsalStage = "deploy auction and V4 on local fork";
	const auctionFactory_ = await hre.ethers.getContractFactory("CosmicSignatureArtAuction", owner_);
	const auction_ = await auctionFactory_.deploy(baseline.proxyAddress, nftAddress_);
	await auction_.waitForDeployment();
	const v4Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4", owner_);
	const validations_ = await readValidations(hre);
	const layout_ = getStorageLayout(validations_, getVersion(getUnlinkedBytecode(validations_, v4Factory_.bytecode), v4Factory_.bytecode));
	const layoutReport_ = getStorageUpgradeReport(baseline.layout, layout_, withValidationDefaults({}));
	assert(layoutReport_.ok, layoutReport_.explain());
	const implementation_ = await v4Factory_.deploy();
	await implementation_.waitForDeployment();
	const before_ = await snapshot_();
	const supplyBeforeUpgrade_ = await nft_.totalSupply();
	rehearsalStage = "upgrade local proxy and verify preserved state";
	const upgrade_ = await (await gameV3_.connect(owner_).upgradeToAndCall(implementation_, v4Factory_.interface.encodeFunctionData("initializeV4", [await auction_.getAddress()]))).wait();
	const game_ = v4Factory_.attach(baseline.proxyAddress);
	assert.deepEqual(await snapshot_(), before_);
	assert.equal(await game_.owner(), ownerAddress_);
	assert.equal(await nft_.totalSupply(), supplyBeforeUpgrade_);
	assert.equal(await game_.artAuction(), await auction_.getAddress());
	assert.equal(await auction_.registeredRounds(sourceCycle_), false);
	rehearsalStage = "finalize first V4 cycle and verify auction batch";
	latest_ = await hre.ethers.provider.getBlock("latest");
	const bidTime_ = BigInt(latest_.timestamp) + 4n;
	await (await game_.setRoundActivationTime(bidTime_)).wait();
	latest_ = await hre.ethers.provider.getBlock("latest");
	const bidPrice_ = await game_.getNextEthBidPriceAdvanced(bidTime_ - BigInt(latest_.timestamp));
	await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(bidTime_)]);
	await (await game_.bidWithEth(-1n, "V4 local fork rehearsal", 0n, { value: bidPrice_ })).wait();
	await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime())]);
	const finalization_ = await (await game_.claimMainPrize()).wait();
	const finalizationTime_ = BigInt((await finalization_.getBlock()).timestamp);
	const batch_ = finalization_.logs.filter(log_ => log_.address === auction_.target).map(log_ => auction_.interface.parseLog(log_)).find(event_ => event_?.name === "AuctionBatchRegistered");
	assert(batch_);
	assert.equal(batch_.args.roundNum, firstV4Cycle_);
	assert.equal(batch_.args.count, 8n);
	assert.equal(batch_.args.eligibleAt, finalizationTime_ + 604800n);
	const firstNft_ = batch_.args.firstNftId;
	assert.equal(await nft_.totalSupply(), firstNft_ + 8n);
	for (let index_ = 0n; index_ < 8n; ++index_) assert.equal(await nft_.ownerOf(firstNft_ + index_), await auction_.getAddress());
	rehearsalStage = "exercise bidding, forwarding and NFT delivery";
	await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(batch_.args.eligibleAt)]);
	const winningPayment_ = 10n ** 13n;
	await (await auction_.bid(firstNft_, winningPayment_, { value: winningPayment_ })).wait();
	await hre.network.provider.send("evm_setNextBlockTimestamp", [Number((await auction_.getAuction(firstNft_)).endAt)]);
	await (await auction_.settle(firstNft_)).wait();
	const beforeFunding_ = await snapshot_();
	const reserve_ = await hre.ethers.provider.getBalance(baseline.proxyAddress);
	const forward_ = await (await auction_.forwardProceeds(firstNft_)).wait();
	assert.deepEqual(await snapshot_(), beforeFunding_);
	assert.equal(await hre.ethers.provider.getBalance(baseline.proxyAddress), reserve_ + winningPayment_);
	await (await auction_.claimNft(firstNft_, ownerAddress_)).wait();
	assert.equal(await nft_.ownerOf(firstNft_), ownerAddress_);
	console.log(JSON.stringify({
		mode: "local-hardhat-fork-only", blockNumber: blockNumber_, blockHash: baseline.observation.blockHash,
		arbitrumPrecompiles: "Repository FakeArbSys and FakeArbGasInfo test shims; native Arbitrum handlers are unavailable in EDR.",
		deployedV3RuntimeVerified: true, storageValidation: "passed", scalarStatePreserved: true,
		originalCycle: sourceCycle_.toString(), firstV4Cycle: firstV4Cycle_.toString(),
		auctionAddressOnFork: await auction_.getAddress(), implementationAddressOnFork: await implementation_.getAddress(),
		upgradeGas: upgrade_.gasUsed.toString(), priorV3FinalizationGas: priorFinalizationGas_,
		v4FinalizationGas: finalization_.gasUsed.toString(), forwardGas: forward_.gasUsed.toString(),
		firstAuctionNftId: firstNft_.toString(), auctionNfts: 8,
		eligibilityFromSuccessfulFinalization: true, winningPaymentForwardedWithoutBid: true, nftDelivered: true,
		limitation: "Hardhat gas is an execution measurement; Arbitrum L1 data fees and future worst-case configuration are not represented. No transaction was sent to Arbitrum.",
	}, null, 2));
	completedRehearsal = true;
}

async function main() {
	try {
		await rehearseV4Upgrade();
	} catch (error_) {
		console.error("V4 fork rehearsal failed.");
		console.error(`Stage: ${rehearsalStage}.`);
		// Only exact, locally authored configuration hints may be printed. Provider
		// messages, stack traces and revert data can contain a secret-bearing RPC URL.
		if (safeConfigurationDetails.has(error_?.message)) console.error(error_.message);
		process.exitCode = 1;
	}
}

if (require.main === module) void main();
module.exports = { main };
