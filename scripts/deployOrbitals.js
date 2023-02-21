async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Orbitals = await hre.ethers.getContractFactory("Orbitals");
  const OrbitalsHRE = await BiddingWar.deploy();
  await OrbitalsHRE.deployed();

  console.log("OrbitalsHRE address:", OrbitalsHRE.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
