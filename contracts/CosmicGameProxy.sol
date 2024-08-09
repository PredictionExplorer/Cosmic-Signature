// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// Comment-202408113 applies.
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "./CosmicGameStorage.sol";

contract CosmicGameProxy is UUPSUpgradeable, CosmicGameStorage {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	function initialize(address _implementation) public initializer {
		// todo-0 I commented out this call.
		// todo-0 See Comment-202408113.
		// todo-0 If we imported the other "UUPSUpgradeable.sol" this would compile.
		// __UUPSUpgradeable_init();

		CosmicGameStorage.initialize();

		// todo-0 `_upgradeTo` no longer exists. Calling `upgradeToAndCall` instead. Make sense?
		// todo-0 I dislike it that `_upgradeTo` probably was `internal`, but `upgradeToAndCall` is `public`.
		// _upgradeTo(_implementation);
		upgradeToAndCall(_implementation, "");
	}

	function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
	}
}
