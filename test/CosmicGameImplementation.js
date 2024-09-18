const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("CosmicGameImplementation", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		};
	}
	it("Fallback function is executing bid", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		const [owner, otherAccount] = await hre.ethers.getSigners();
		await owner.sendTransaction({
			to: await cosmicGameProxy.getAddress(),
			value: bidPrice,
		});
		let bidPriceAfter = await cosmicGameProxy.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(0);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors, "ERC20Mint");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails (second mint)", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(1);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors, "ERC20Mint");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await hre.ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });
	 	for (let i=0; i<numIterationsMain; i++) {
			let b = await hre.ethers.provider.getBalance(owner.address);
			let j=0;
			while (true) {
				bidPrice = await cosmicGameProxy.getBidPrice();
				balance = await cosmicToken.balanceOf(owner.address);
				cstPrice = await cosmicGameProxy.getCurrentBidPriceCST();
				await cosmicGameProxy.bid(params, { value: bidPrice });
				if (balance > cstPrice) {
					break;
				}
				j++;
				if (j>= numIterationsSecondary) {
					break;
				}
			}
			try {
				await cosmicGameProxy.bidWithCST("");
			} catch (e) {
				console.log(e);
				let balanceEth = await hre.ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await hre.ethers.provider.send("evm_increaseTime", [timeBump]);
			await hre.ethers.provider.send("evm_mine");
			let CSTAuctionLength = await cosmicGameProxy.CSTAuctionLength();
		}
	})
});
