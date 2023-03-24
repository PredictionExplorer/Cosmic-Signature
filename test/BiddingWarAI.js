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

      await biddingWar.donate({value: INITIAL_AMOUNT});

  });

    describe("DonationEvent", function () {
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
});

  it("should emit PrizeClaimEvent and update winner on successful prize claim", async function () {
    const initialBidPrice = await biddingWar.bidPrice();
    const bidAmount = initialBidPrice.mul(1010000).div(10 ** 6);

    let mintPrice = await randomWalk.getMintPrice();
    await randomWalk.connect(donor).mint({value: mintPrice});

    await randomWalk.connect(donor).setApprovalForAll(biddingWar.address, true);

    await biddingWar.connect(donor).bidAndDonateNFT("", randomWalk.address, 0, { value: bidAmount });

    // Bid a lot more
    await biddingWar.connect(bidder1).bid("", { value: bidAmount.mul(2) });

    await expect(biddingWar.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round");
    await ethers.provider.send("evm_increaseTime", [26 * 3600]);
    await ethers.provider.send("evm_mine");

    const prizeAmountBeforeClaim = await biddingWar.prizeAmount();

    await expect(biddingWar.connect(bidder1).claimPrize())
      .to.emit(biddingWar, "PrizeClaimEvent")
      .withArgs(0, bidder1.address, prizeAmountBeforeClaim);

    const winner = await biddingWar.winners(0);
    expect(winner).to.equal(bidder1.address);

    await expect(biddingWar.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith("The donated NFT does not exist");
    await expect(biddingWar.connect(bidder2).claimDonatedNFT(0)).to.be.revertedWith("You are not the winner of the round");

    await biddingWar.connect(bidder1).claimDonatedNFT(0);
    await expect(biddingWar.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith("The NFT has already been claimed");

  });


});



