const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BiddingWarAI", function () {
  let BiddingWar, biddingWar, CosmicSignatureToken, token, CosmicSignatureNFT, nft, RandomWalkNFT, randomWalk;
  let owner, charity, donor, bidder1, bidder2, bidder3;
  let INITIAL_AMOUNT = ethers.utils.parseEther('10');


  beforeEach(async function () {

    [owner, charity, donor, bidder1, bidder2, bidder3] = await ethers.getSigners();

    BiddingWar = await ethers.getContractFactory("BiddingWar");
    biddingWar = await BiddingWar.deploy();

    await biddingWar.deployed();

    CosmicSignatureToken = await ethers.getContractFactory("CosmicSignatureToken");
    token = await CosmicSignatureToken.deploy();
    await token.deployed();
    token.transferOwnership(biddingWar.address);

    CosmicSignatureNFT = await ethers.getContractFactory("CosmicSignatureNFT");
    nft = await CosmicSignatureNFT.deploy(biddingWar.address);
    await nft.deployed();

    RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
    randomWalk = await RandomWalkNFT.deploy();
    await randomWalk.deployed();

    // Set contracts
    await biddingWar.setTokenContract(token.address);
    await biddingWar.setNftContract(nft.address);
    await biddingWar.setRandomWalk(randomWalk.address);
    await biddingWar.setActivationTime(0);

    await biddingWar.donate({value: INITIAL_AMOUNT});

  });

  it("should emit DonationEvent on successful donation", async function () {
    const donationAmount = ethers.utils.parseEther("1");

    await expect(
      biddingWar.connect(donor).donate({ value: donationAmount })
    )
      .to.emit(biddingWar, "DonationEvent")
      .withArgs(donor.address, donationAmount);

    const contractBalance = await ethers.provider.getBalance(biddingWar.address);
    expect(contractBalance).to.equal(donationAmount.add(INITIAL_AMOUNT));
  });

  it("should emit PrizeClaimEvent and update winner on successful prize claim", async function () {
    let bidPrice = await biddingWar.getBidPrice();

    let mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});

    await randomWalk.connect(donor).setApprovalForAll(biddingWar.address, true);

    await biddingWar.connect(donor).bidAndDonateNFT("", randomWalk.address, 0, { value: bidPrice });

    bidPrice = await biddingWar.getBidPrice();
    await biddingWar.connect(bidder1).bid("", { value: bidPrice });

    await expect(biddingWar.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round");
    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");

    let prizeAmountBeforeClaim = await biddingWar.prizeAmount();

    await expect(biddingWar.connect(bidder1).claimPrize())
      .to.emit(biddingWar, "PrizeClaimEvent")
      .withArgs(0, bidder1.address, prizeAmountBeforeClaim);

    const winner = await biddingWar.winners(0);
    expect(winner).to.equal(bidder1.address);

    const prizeAmountAfterClaim = await biddingWar.prizeAmount();
    expect(prizeAmountAfterClaim).to.equal(prizeAmountBeforeClaim.mul(40).div(100));

    await expect(biddingWar.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith("The donated NFT does not exist");
    await expect(biddingWar.connect(bidder2).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round");

    await biddingWar.connect(bidder1).claimDonatedNFT(0);
    await expect(biddingWar.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("The NFT has already been claimed");

    mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});
    mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});

    bidPrice = await biddingWar.getBidPrice();
    await biddingWar.connect(bidder1).bid("", { value: bidPrice });

    await biddingWar.connect(donor).bidWithRWLKAndDonateNFT(1, "hello", randomWalk.address, 2);

    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");

    prizeAmountBeforeClaim = await biddingWar.prizeAmount();
    await expect(biddingWar.connect(donor).claimPrize())
      .to.emit(biddingWar, "PrizeClaimEvent")
      .withArgs(1, donor.address, prizeAmountBeforeClaim);

    await expect(biddingWar.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith("You are not the winner of the round");

    expect(await randomWalk.balanceOf(donor.address)).to.equal(1);
    await biddingWar.connect(donor).claimDonatedNFT(1);
    expect(await randomWalk.balanceOf(donor.address)).to.equal(2);

    expect(await biddingWar.roundNum()).to.equal(2);

  });

  it("should not be possible to bid before activation", async function () {
    const sevenDays = 7 * 24 * 60 * 60;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;

    await biddingWar.connect(owner).setActivationTime(timestampBefore + 100);

    let bidPrice = await biddingWar.getBidPrice();
    await expect(biddingWar.connect(bidder1).bid("", { value: bidPrice })).to.be.revertedWith("Not active yet.");

    await expect(bidder2.sendTransaction({
      to: biddingWar.address,
      value: bidPrice
    })).to.be.revertedWith("Not active yet.");

    await ethers.provider.send('evm_increaseTime', [100]);
    await ethers.provider.send('evm_mine');

    await biddingWar.connect(bidder1).bid("", { value: bidPrice });
    expect (await biddingWar.getBidPrice() > bidPrice);

  });

  it("should be possible to bid by sending to the contract", async function () {
    let bidPrice = await biddingWar.getBidPrice();
    await biddingWar.connect(bidder1).bid("", { value: bidPrice });
    expect(await biddingWar.getBidPrice() > bidPrice);

    bidPrice = await biddingWar.getBidPrice();
    await bidder2.sendTransaction({
      to: biddingWar.address,
      value: bidPrice
    });
    expect(await biddingWar.getBidPrice() > bidPrice);
  });

});
