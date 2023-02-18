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

    return {biddingWar};
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const {biddingWar} = await loadFixture(deployBiddingWar);

      expect(await biddingWar.secondsExtra()).to.equal(3600);
    });
  });
})
