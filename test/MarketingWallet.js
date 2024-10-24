const hre = require("hardhat");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("MarketingWallet", function () {
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(contractDeployerAcct, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		return {
			cosmicGameProxy: cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGameImplementation
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	it("setTokenContract() emits CosmicTokenAddressChanged event correctly()", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		await expect(marketingWallet.setTokenContract(hre.ethers.ZeroAddress)).to.revertedWithCustomError(contractErrors, "ZeroAddress");
		await expect(marketingWallet.connect(addr1).setTokenContract(addr1.address)).to.revertedWithCustomError(marketingWallet,"OwnableUnauthorizedAccount");
		expect(marketingWallet.setTokenContract(addr2.address)).to.emit(cosmicSignature, "CosmicTokenAddressChanged").withArgs(addr1.address);
	});
	it("MarketinWallet properly send()s accumulated funds", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		const marketingReward = hre.ethers.parseEther('15');
		await expect(marketingWallet.send(marketingReward,hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(marketingWallet.send(0n,addr1.address)).to.be.revertedWithCustomError(contractErrors,"NonZeroValueRequired");
		await expect(marketingWallet.connect(addr1).send(0n,await cBidder.getAddress())).to.be.revertedWithCustomError(marketingWallet,"OwnableUnauthorizedAccount");
		await marketingWallet.send(marketingReward,addr1);
		await marketingWallet.setTokenContract(await cBidder.getAddress());
		await expect(marketingWallet.connect(addr1).setTokenContract(await cBidder.getAddress())).to.be.revertedWithCustomError(marketingWallet,"OwnableUnauthorizedAccount");

		// note : following call reverts because of unknown selector, not because of require() in the fallback function of BidderContract
		// so no need to use startBlockingSeposits() function in this case
		await expect(marketingWallet.send(marketingReward,await cBidder.getAddress())).to.be.reverted;

		let balanceAfter = await cosmicToken.balanceOf(addr1);
		expect(balanceAfter).to.equal(marketingReward);
	});
});
