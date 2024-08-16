// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// Comment-202408113 applies.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/proxy/Proxy.sol";
import "./CosmicGameStorage.sol";

// ToDo-202408119-0 applies.
contract CosmicGameProxy is Proxy, UUPSUpgradeable, OwnableUpgradeable, CosmicGameStorage {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	function initialize(address _implementation) public initializer {

		// todo-0 `_upgradeTo` no longer exists. Calling `upgradeToAndCall` instead. Make sense?
		// todo-0 I dislike it that `_upgradeTo` probably was `internal`, but `upgradeToAndCall` is `public`.
		// _upgradeTo(_implementation);
		upgradeToAndCall(_implementation, "");
	}

	function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
	}
	function _implementation() internal view override returns (address) {
		 return ERC1967Utils.getImplementation();
	}
}
