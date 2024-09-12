const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("Cosmic Set1", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);

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
	it("donateWithInfo() works as expected", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = hre.ethers.parseEther("10");
		let dataStr ="{'version':1,'url':'http://one.two/three'}";
		await cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: donationAmount });
		let numDonationInfoRecs = await cosmicGameProxy.donateWithInfoNumRecords();
		expect(numDonationInfoRecs).to.equal(1);
		let donationInfoRec = await cosmicGameProxy.donationInfoRecords(0);
		expect(donationInfoRec.donor).to.equal(addr1.address);
		expect(donationInfoRec.data).to.equal(dataStr);

		// check number of records is incrementing
		await cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: donationAmount });
		numDonationInfoRecs = await cosmicGameProxy.donateWithInfoNumRecords();
		expect(numDonationInfoRecs).to.equal(2);

		await expect(cosmicGameProxy.connect(addr1).donateWithInfo(dataStr,{ value: 0n})).to.be.revertedWithCustomError(cosmicGameProxy,"NonZeroValueRequired");
	});
	it("donateNFT() without making a bid works", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(owner).mint({ value: mintPrice });
		await randomWalkNFT.connect(owner).setApprovalForAll(await cosmicGameProxy.getAddress(), true);

		await cosmicGameProxy.connect(owner).donateNFT(await randomWalkNFT.getAddress(),0);
		let details = await cosmicGameProxy.getDonatedNFTDetails(0);
		expect(details[0]).to.equal(await randomWalkNFT.getAddress());
		await expect(cosmicGameProxy.getDonatedNFTDetails(1)).to.be.revertedWith("Invalid donated NFT index");
	});
});
