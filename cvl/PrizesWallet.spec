// SPDX-License-Identifier: CC0-1.0
methods {
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function getDonatedTokenAmount(uint256, address) external returns (uint256) envfree;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
}

// Ghost to track total donated amount changes
ghost mathint totalDonationChanges;

ghost mapping(mathint => mapping(address => mathint)) gDonatedERC20Unclaimed;
ghost mapping(mathint => mapping(address => mathint)) gDonatedERC20Withdrawn;
persistent ghost mathint curRound;
persistent ghost address curERC20Addr;

hook Sstore currentContract._donatedTokens[INDEX uint256 idx].amount uint256 newValue (uint256 oldValue) {
	bytes32 numeric_addr = to_bytes32(idx >> 64);
	address addr = assert_address(numeric_addr);
	mathint round = to_mathint(idx & 0xFFFFFFFFFFFFFFFF);
	curRound = round;
	curERC20Addr = addr;
	if (newValue == 0) {
		gDonatedERC20Withdrawn[round][addr] = to_mathint(oldValue);
		assert oldValue > 0;
		if (oldValue > 0) {
			assert gDonatedERC20Unclaimed[round][addr] == gDonatedERC20Unclaimed[round][addr];
		}
	} else {
		if (newValue> oldValue) {
			gDonatedERC20Unclaimed[round][addr] = 
				gDonatedERC20Unclaimed[round][addr] + (to_mathint(newValue) - to_mathint(oldValue));
		}
		if (oldValue > newValue) {
			gDonatedERC20Unclaimed[round][addr ] =
				 gDonatedERC20Unclaimed[round][addr] - (to_mathint(oldValue) - to_mathint(newValue));
		}
	}
}
hook CALL(uint g, address addr, uint value, uint argsOffset, uint argsLength, uint retOffset, uint retLength) uint rc {
	if (selector == sig:CosmicSignatureToken.transfer(address, uint256).selector) {
		assert gDonatedERC20Unclaimed[curRound][curERC20Addr] == gDonatedERC20Withdrawn[curRound][curERC20Addr];
	}
}
hook LOG4(uint offset, uint length, bytes32 t1,bytes32 t2, bytes32 t3, bytes32 t4) {
	// check for DonatedNftClaimed
	// implementation pending for Certora's team, they have to explain (in corresponding HelpDesk ticket) how to fetch Log.Data field inside a hook '
}
rule genericMethodMatcher() {

    method f; env e; calldataarg args;
    f(e, args);

	satisfy true;
}
