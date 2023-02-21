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

    await biddingWar.setTokenContract(orbitalToken.address);
    await biddingWar.setNftContract(orbitals.address);

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
      await expect(biddingWar.connect(addr1).bid({value: bidPrice.sub(1)})).to.be.revertedWith("The value submitted with this transaction is too low.");

      let withdrawalTime = await biddingWar.timeUntilWithdrawal();
      expect(withdrawalTime).to.equal(0);

      // check that if we sent too much, we get our money back
      await biddingWar.connect(addr1).bid({value: bidPrice.add(1000)}); // this works
      const contractBalance = await ethers.provider.getBalance(biddingWar.address);
      expect(contractBalance).to.equal(donationAmount.add(bidPrice));

      let nanoSecondsExtra = await biddingWar.nanoSecondsExtra();
      withdrawalTime = await biddingWar.timeUntilWithdrawal();
      expect(withdrawalTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      withdrawalTime = await biddingWar.timeUntilWithdrawal();
      expect(withdrawalTime).to.equal(nanoSecondsExtra.div(1000000000).mul(2).add(24 * 3600 - 1));

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      withdrawalTime = await biddingWar.timeUntilWithdrawal();
      expect(withdrawalTime).to.equal(nanoSecondsExtra.div(1000000000).mul(3).add(24 * 3600 - 2)); // not super clear why we are subtracting 2 here and 1 above

      await expect(biddingWar.connect(addr1).withdraw()).to.be.revertedWith("Not enough time has elapsed.");
      await expect(biddingWar.connect(addr2).withdraw()).to.be.revertedWith("Only last bidder can withdraw.");

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr2).bid({value: bidPrice});
      await expect(biddingWar.connect(addr2).withdraw()).to.be.revertedWith("Not enough time has elapsed.");

      withdrawalTime = await biddingWar.timeUntilWithdrawal();
      await ethers.provider.send("evm_increaseTime", [withdrawalTime.sub(100).toNumber()]);
      await ethers.provider.send("evm_mine");
      await expect(biddingWar.connect(addr2).withdraw()).to.be.revertedWith("Not enough time has elapsed.");

      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine");

      await expect(biddingWar.connect(addr1).withdraw()).to.be.revertedWith("Only last bidder can withdraw.");

      let withdrawalAmount = await biddingWar.withdrawalAmount();
      await biddingWar.connect(addr2).withdraw();
      let withdrawalAmount2 = await biddingWar.withdrawalAmount();
      expect(withdrawalAmount2).to.equal(withdrawalAmount.div(2));

      // after the withdrawal, let's bid again!

      await expect(biddingWar.connect(addr2).withdraw()).to.be.revertedWith("Only last bidder can withdraw.");

      bidPrice = await biddingWar.getBidPrice();
      await biddingWar.connect(addr1).bid({value: bidPrice});
      await expect(biddingWar.connect(addr1).withdraw()).to.be.revertedWith("Not enough time has elapsed.");

      withdrawalTime = await biddingWar.timeUntilWithdrawal();
      expect(withdrawalTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

      await ethers.provider.send("evm_increaseTime", [withdrawalTime.toNumber()]);
      await ethers.provider.send("evm_mine");

      withdrawalAmount = await biddingWar.withdrawalAmount();
      await biddingWar.connect(addr1).withdraw();
      withdrawalAmount2 = await biddingWar.withdrawalAmount();
      expect(withdrawalAmount2).to.equal(withdrawalAmount.div(2));
    });

  });
})
