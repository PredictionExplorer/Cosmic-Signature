const hre = require("hardhat");

async function main() {
  //const [deployer] = await hre.ethers.getSigners();

  //console.log("Deploying contracts with the account:", deployer.address);

  //console.log("Account balance:", (await deployer.getBalance()).toString());

  const BiddingWar = await hre.ethers.getContractFactory("BidW");
  const biddingWar = await BiddingWar.deploy();
  await biddingWar.deployed();
  console.log("BiddingWar address:", biddingWar.address);
  await biddingWar.setActivationTime(0);

  const CosmicSignatureToken = await hre.ethers.getContractFactory("CosmicSignatureToken");
  const cosmicSignatureToken = await CosmicSignatureToken.deploy();
  cosmicSignatureToken.deployed();
  await cosmicSignatureToken.transferOwnership(biddingWar.address);
  console.log("CosmicSignatureToken address:", cosmicSignatureToken.address);

  const CosmicSignatureNFT = await hre.ethers.getContractFactory("CosmicSignatureNFT");
  const cosmicSignatureNFT = await CosmicSignatureNFT.deploy(biddingWar.address);
  cosmicSignatureNFT.deployed();
  console.log("Cosmic Signature NFT address:", cosmicSignatureNFT.address);

  const CosmicSignatureDAO = await hre.ethers.getContractFactory("CosmicSignatureDAO");
  const cosmicSignatureDAO = await CosmicSignatureDAO.deploy(cosmicSignatureToken.address);
  await cosmicSignatureDAO.deployed();
  console.log("Cosmic Signature DAO address", cosmicSignatureDAO.address);

  const CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
  const charityWallet = await CharityWallet.deploy();
  charityWallet.deployed();
  await charityWallet.transferOwnership(cosmicSignatureDAO.address);
  console.log("Charity Wallet address:", charityWallet.address);

  const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT = await RandomWalkNFT.deploy();
  randomWalkNFT.deployed();
  console.log("randomWalkNFT address:", randomWalkNFT.address);

  const RandomWalkNFT2 = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT2 = await RandomWalkNFT2.deploy();
  randomWalkNFT2.deployed();
  console.log("randomWalkNFT2 address:", randomWalkNFT2.address);

  await biddingWar.setTokenContract(cosmicSignatureToken.address);
  await biddingWar.setNftContract(cosmicSignatureNFT.address);
  await biddingWar.setCharity(charityWallet.address);
  await biddingWar.setRandomWalk(randomWalkNFT.address);

  console.log("Addresses set");

  let donationAmount = hre.ethers.utils.parseEther('10');
  await biddingWar.donate({value: donationAmount});

  console.log("Donation complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
