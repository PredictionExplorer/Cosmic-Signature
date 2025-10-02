"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32, generateRandomUInt256, generateRandomUInt256FromSeed, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("CosmicSignatureNft", function () {
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureNftFactory.deploy(hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.cosmicSignatureNftFactory, "ZeroAddress");
	});

	it("Contract parameter setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
		}

		{
			const newValue_ = "MyNftBaseUri/";
			expect(await contracts_.cosmicSignatureNft.nftBaseUri()).not.equal(newValue_);
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setNftBaseUri(newValue_))
				.revertedWithCustomError(contracts_.cosmicSignatureNft, "OwnableUnauthorizedAccount");
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.ownerSigner).setNftBaseUri(newValue_))
				.emit(contracts_.cosmicSignatureNft, "NftBaseUriChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureNft.nftBaseUri()).equal(newValue_);
			const nftId_ = generateRandomUInt256() % await contracts_.cosmicSignatureNft.totalSupply();
			expect(await contracts_.cosmicSignatureNft.tokenURI(nftId_)).equal(newValue_ + nftId_.toString());
		}

		{
			const newValue_ = "url://";
			expect(await contracts_.cosmicSignatureNft.nftGenerationScriptUri()).not.equal(newValue_);
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setNftGenerationScriptUri(newValue_))
				.revertedWithCustomError(contracts_.cosmicSignatureNft, "OwnableUnauthorizedAccount");
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.ownerSigner).setNftGenerationScriptUri(newValue_))
				.emit(contracts_.cosmicSignatureNft, "NftGenerationScriptUriChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureNft.nftGenerationScriptUri()).equal(newValue_);
		}
	});

	it("NFT minting", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const newCosmicSignatureNft_ = await contracts_.cosmicSignatureNftFactory.deploy(contracts_.signers[0].address);
		await newCosmicSignatureNft_.waitForDeployment();
		// const newCosmicSignatureNftAddress_ = await newCosmicSignatureNft_.getAddress();
		await waitForTransactionReceipt(newCosmicSignatureNft_.transferOwnership(contracts_.ownerSigner.address));

		const pickUnauthorizedCaller_ = () => {
			return ((generateRandomUInt32() & 1) == 0) ? contracts_.ownerSigner : contracts_.signers[1];
		};

		{
			const roundNum_ = BigInt(generateRandomUInt32());
			const randomNumberSeed_ = generateRandomUInt256();
			await expect(newCosmicSignatureNft_.connect(pickUnauthorizedCaller_()).mint(roundNum_, contracts_.signers[2].address, randomNumberSeed_))
				.revertedWithCustomError(newCosmicSignatureNft_, "UnauthorizedCaller");
			await expect(newCosmicSignatureNft_.connect(contracts_.signers[0]).mint(roundNum_, hre.ethers.ZeroAddress, randomNumberSeed_))
				.revertedWithCustomError(newCosmicSignatureNft_, "ERC721InvalidReceiver");
			const nftSeed_ = generateRandomUInt256FromSeed(randomNumberSeed_);
			const nftId_ = 0n;
			await expect(newCosmicSignatureNft_.connect(contracts_.signers[0]).mint(roundNum_, contracts_.signers[2].address, randomNumberSeed_))
				.emit(newCosmicSignatureNft_, "Transfer")
				.withArgs(hre.ethers.ZeroAddress, contracts_.signers[2].address, nftId_)
				.and.emit(newCosmicSignatureNft_, "NftMinted")
				.withArgs(roundNum_, contracts_.signers[2].address, nftSeed_, nftId_);
			expect((await newCosmicSignatureNft_.getNftMetaData(nftId_)).seed).equal(nftSeed_);
			expect(await newCosmicSignatureNft_.getNftSeed(nftId_)).equal(nftSeed_);
		}

		{
			expect(await newCosmicSignatureNft_.totalSupply()).equal(1n);
			await waitForTransactionReceipt(newCosmicSignatureNft_.connect(contracts_.signers[0]).mintMany(100n, [], 0x167c41a5ddd8b94379899bacc638fe9a87929d7738bc7e1d080925709c34330en));
			expect(await newCosmicSignatureNft_.totalSupply()).equal(1n);
		}

		{
			const roundNum_ = BigInt(generateRandomUInt32());
			const nftOwnerAddresses_ = [
				contracts_.signers[2].address,
				contracts_.signers[3].address,
			];
			const randomNumberSeed_ = generateRandomUInt256();
			await expect(newCosmicSignatureNft_.connect(pickUnauthorizedCaller_()).mintMany(roundNum_, nftOwnerAddresses_, randomNumberSeed_))
				.revertedWithCustomError(newCosmicSignatureNft_, "UnauthorizedCaller");
			const firstNftId_ = 1n;
			await expect(newCosmicSignatureNft_.connect(contracts_.signers[0]).mintMany(roundNum_, nftOwnerAddresses_, randomNumberSeed_))
				.emit(newCosmicSignatureNft_, "Transfer")
				.withArgs(hre.ethers.ZeroAddress, contracts_.signers[2].address, firstNftId_)
				.and.emit(newCosmicSignatureNft_, "NftMinted")
				.withArgs(roundNum_, contracts_.signers[2].address, generateRandomUInt256FromSeed(randomNumberSeed_), firstNftId_)
				.and.emit(newCosmicSignatureNft_, "Transfer")
				.withArgs(hre.ethers.ZeroAddress, contracts_.signers[3].address, firstNftId_ + 1n)
				.and.emit(newCosmicSignatureNft_, "NftMinted")
				.withArgs(roundNum_, contracts_.signers[3].address, generateRandomUInt256FromSeed(BigInt.asUintN(256, randomNumberSeed_ + 1n)), firstNftId_ + 1n);
		}
	});

	it("The setNftName and getNftName methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
	
		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
		}
	
		{
			const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;
			expect(await contracts_.cosmicSignatureNft.getNftName(nftId_)).equal("");
	
			let newNftName_ = "123456789012345678901234567890123";
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setNftName(nftId_, newNftName_))
				.revertedWithCustomError(contracts_.cosmicSignatureNft, "TooLongNftName");
	
			do {
				newNftName_ = newNftName_.substring(1);
				await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setNftName(nftId_, newNftName_))
					.emit(contracts_.cosmicSignatureNft, "NftNameChanged")
					.withArgs(nftId_, newNftName_);
				expect((await contracts_.cosmicSignatureNft.getNftMetaData(nftId_)).name).equal(newNftName_);
				expect(await contracts_.cosmicSignatureNft.getNftName(nftId_)).equal(newNftName_);
			} while (newNftName_.length > 0);
	
			newNftName_ = "My NFT Name";
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setNftName(nftId_, newNftName_))
				.revertedWithCustomError(contracts_.cosmicSignatureNft, "ERC721InsufficientApproval");
			await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.signers[1].address, true));
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setNftName(nftId_, newNftName_))
				.emit(contracts_.cosmicSignatureNft, "NftNameChanged")
				.withArgs(nftId_, newNftName_);
			expect((await contracts_.cosmicSignatureNft.getNftMetaData(nftId_)).name).equal(newNftName_);
			expect(await contracts_.cosmicSignatureNft.getNftName(nftId_)).equal(newNftName_);
		}
	});

	it("The checkCallerIsAuthorizedFor method", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
	
		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
		}
	
		{
			const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;
			await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).checkCallerIsAuthorizedFor(nftId_))
				.revertedWithCustomError(contracts_.cosmicSignatureNft, "ERC721InsufficientApproval");
			await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.signers[1].address, true));
			await contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).checkCallerIsAuthorizedFor(nftId_);
		}
	});
});
