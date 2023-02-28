const hre = require("hardhat");

async function main() {
  //const [deployer] = await hre.ethers.getSigners();

  //console.log("Deploying contracts with the account:", deployer.address);

  //console.log("Account balance:", (await deployer.getBalance()).toString());

  const BiddingWar = await hre.ethers.getContractFactory("BiddingWar");
  const biddingWar = await BiddingWar.deploy();
  await biddingWar.deployed();
  console.log("BiddingWar address:", biddingWar.address);

  const OrbitalToken = await hre.ethers.getContractFactory("OrbitalToken");
  const orbitalToken = await OrbitalToken.deploy(biddingWar.address);
  orbitalToken.deployed();
  console.log("OrbitalToken address:", orbitalToken.address);

  const Orbitals = await hre.ethers.getContractFactory("Orbitals");
  const orbitals = await Orbitals.deploy(biddingWar.address);
  orbitals.deployed();
  console.log("Orbitals address:", orbitals.address);

  const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
  const randomWalkNFT = await RandomWalkNFT.deploy();
  randomWalkNFT.deployed();
  console.log("randomWalkNFT address:", randomWalkNFT.address);

  await biddingWar.setTokenContract(orbitalToken.address);
  await biddingWar.setNftContract(orbitals.address);
  await biddingWar.setRandomWalk(randomWalkNFT.address);
  console.log("Addresses set");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
