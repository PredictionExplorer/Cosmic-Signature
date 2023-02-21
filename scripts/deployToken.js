async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Token = await hre.ethers.getContractFactory("Token");
  const TokenHRE = await Token.deploy();
  await TokenHRE.deployed();

  console.log("TokenHRE address:", TokenHRE.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
