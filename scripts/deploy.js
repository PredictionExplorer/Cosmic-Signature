const hre = require("hardhat");

async function main() {
  //const [deployer] = await hre.ethers.getSigners();

  //console.log("Deploying contracts with the account:", deployer.address);

  //console.log("Account balance:", (await deployer.getBalance()).toString());

  const CosmicGame = await hre.ethers.getContractFactory("CosmicGame");
  const cosmicGame = await CosmicGame.deploy();
  await cosmicGame.deployed();
  console.log("CosmicGame address:", cosmicGame.address);

  const CosmicToken = await hre.ethers.getContractFactory("CosmicToken");
  const cosmicToken = await CosmicToken.deploy();
  cosmicToken.deployed();
  await cosmicToken.transferOwnership(cosmicGame.address);
  console.log("CosmicToken address:", cosmicToken.address);

  const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
  const cosmicSignature = await CosmicSignature.deploy(cosmicGame.address);
  cosmicSignature.deployed();
  console.log("CosmicSignature address:", cosmicSignature.address);

  const CosmicDAO = await hre.ethers.getContractFactory("CosmicDAO");
  const cosmicDAO = await CosmicDAO.deploy(cosmicToken.address);
  await cosmicDAO.deployed();
  console.log("CosmicDAO address", cosmicDAO.address);

  const CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
  const charityWallet = await CharityWallet.deploy();
  charityWallet.deployed();
  await charityWallet.transferOwnership(cosmicDAO.address);
  console.log("CharityWallet address:", charityWallet.address);

  const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
  const raffleWallet = await RaffleWallet.deploy();
  raffleWallet.deployed();
  console.log("RaffleWallet address:", raffleWallet.address);

  const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT = await RandomWalkNFT.deploy();
  randomWalkNFT.deployed();
  console.log("randomWalkNFT address:", randomWalkNFT.address);

  const RandomWalkNFT2 = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT2 = await RandomWalkNFT2.deploy();
  randomWalkNFT2.deployed();
  console.log("randomWalkNFT2 address:", randomWalkNFT2.address);

  await cosmicGame.setTokenContract(cosmicToken.address);
  await cosmicGame.setNftContract(cosmicSignature.address);
  await cosmicGame.setCharity(charityWallet.address);
  await cosmicGame.setRaffleWallet(raffleWallet.address);
  await cosmicGame.setRandomWalk(randomWalkNFT.address);

  console.log("Addresses set");

  let donationAmount = hre.ethers.utils.parseEther('10');
  await cosmicGame.donate({value: donationAmount});

  console.log("Donation complete");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
