// #region

"use strict";

// #endregion
// #region

const hre = require("hardhat");
const { basicDeployment } = require("./Deploy.js");

// #endregion
// #region `deployContractsForTesting`

/// This function is to be passed to `loadFixture`.
async function deployContractsForTesting() {
	const signers = await hre.ethers.getSigners();
	const [owner, addr1, /*, , , , , addr7,*/] = signers;
	const contracts =
		await basicDeployment(
			owner,
			"",
			// addr7.address,
			addr1.address,
			false,
			1
		);
	contracts.signers = signers;
	return contracts;
}

// #endregion
// #region

module.exports = {
	deployContractsForTesting,
};

// #endregion
