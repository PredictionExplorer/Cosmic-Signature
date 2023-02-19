const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("BiddingWar", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployBiddingWar() {
    const [owner, otherAccount] = await ethers.getSigners();

    const BiddingWar = await ethers.getContractFactory("BiddingWar");
    const biddingWar = await BiddingWar.deploy();

    const OrbitalToken = await ethers.getContractFactory("OrbitalToken");
    const orbitalToken = await OrbitalToken.deploy(biddingWar.address);

    const Orbitals = await ethers.getContractFactory("Orbitals");
    const orbitals = await Orbitals.deploy(biddingWar.address);

    biddingWar.setTokenContract(orbitalToken.address);
    biddingWar.setNftContract(orbitals.address);

    return {biddingWar, orbitalToken, orbitals};
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const {biddingWar, orbitalToken, orbitals} = await loadFixture(deployBiddingWar);
      expect(await biddingWar.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
      expect(await orbitalToken.totalSupply()).to.equal(0);
    });

    it("Should be possible to bid", async function () {
      [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
      const {biddingWar, orbitalToken, orbitals} = await loadFixture(deployBiddingWar);
      let donationAmount = ethers.utils.parseEther('10');
      await biddingWar.donate({value: donationAmount});
      expect(await biddingWar.withdrawalAmount()).to.equal(donationAmount.div(2));
      await expect(biddingWar.connect(addr1).bid({value: 1})).to.be.revertedWith("The value submitted with this transaction is too low.");
      let bidPrice = await biddingWar.getBidPrice();
      await expect(biddingWar.connect(addr1).bid({value: bidPrice - 1})).to.be.revertedWith("The value submitted with this transaction is too low.");
      await expect(biddingWar.connect(addr1).bid({value: donationAmount})).to.be.revertedWith("The value submitted with this transaction is too low.");
      console.log(bidPrice);
    });

  });
})
