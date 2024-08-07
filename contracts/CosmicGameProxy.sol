// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./CosmicGameStorage.sol";

contract CosmicGameProxy is UUPSUpgradeable, CosmicGameStorage {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _implementation) public initializer {
        __UUPSUpgradeable_init();
        CosmicGameStorage.initialize();
        _upgradeTo(_implementation);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
