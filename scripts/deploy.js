const hre = require("hardhat");

async function main() {
  //const [deployer] = await hre.ethers.getSigners();

  //console.log("Deploying contracts with the account:", deployer.address);

  //console.log("Account balance:", (await deployer.getBalance()).toString());

  const BiddingWar = await hre.ethers.getContractFactory("BiddingWar");
  const biddingWar = await BiddingWar.deploy();
  await biddingWar.deployed();
  console.log("BiddingWar address:", biddingWar.address);

  const CosmicSignatureToken = await hre.ethers.getContractFactory("CosmicSignatureToken");
  const cosmicSignatureToken = await CosmicSignatureToken.deploy(biddingWar.address);
  cosmicSignatureToken.deployed();
  console.log("CosmicSignatureToken address:", CosmicSignatureToken.address);

  const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
  const cosmicSignature = await CosmicSignature.deploy(biddingWar.address);
  cosmicSignature.deployed();
  console.log("Cosmic Signature address:", cosmicSignature.address);

  const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT = await RandomWalkNFT.deploy();
  randomWalkNFT.deployed();
  console.log("randomWalkNFT address:", randomWalkNFT.address);

  await biddingWar.setTokenContract(CosmicSignatureToken.address);
  await biddingWar.setNftContract(cosmicSignature.address);
  await biddingWar.setRandomWalk(randomWalkNFT.address);
  console.log("Addresses set");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
