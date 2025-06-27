// SPDX-License-Identifier: CC0-1.0
methods {
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function getDonatedTokenAmount(uint256, address) external returns (uint256) envfree;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
	function game() external returns (address) envfree;
}

// Ghost to track total donated amount changes
ghost mathint totalDonationChanges;

persistent ghost mapping(mathint => mapping(address => mathint)) gDonatedERC20Unclaimed;
persistent ghost mapping(mathint => mapping(address => mathint)) gDonatedERC20Withdrawn;

hook Sstore currentContract._donatedTokens[INDEX uint256 idx].amount uint256 newValue (uint256 oldValue) {
	bytes32 numeric_addr = to_bytes32(idx >> 64);
	address addr = assert_address(numeric_addr);
	mathint round = to_mathint(idx & 0xFFFFFFFFFFFFFFFF);
	if (newValue != oldValue) {
		if (newValue == 0) {
			gDonatedERC20Withdrawn[round][addr] = to_mathint(oldValue);
			assert gDonatedERC20Unclaimed[round][addr] == gDonatedERC20Withdrawn[round][addr];
		} else {
			if (newValue> oldValue) {
				gDonatedERC20Unclaimed[round][addr] = 
					gDonatedERC20Unclaimed[round][addr] + (to_mathint(newValue) - to_mathint(oldValue));
			 else {
				assert oldValue < newValue;		// amount of donated tokens can only increase or set to 0
			}
		}
	}
}
hook LOG4(uint offset, uint length, bytes32 t1,bytes32 t2, bytes32 t3, bytes32 t4) {
	// check for DonatedNftClaimed
	// implementation pending for Certora's team, they have to explain (in corresponding HelpDesk ticket) how to fetch Log.Data field inside a hook '
}
rule genericMethodMatcher1Step() {

    require currentContract == e0.msg.sender;
    // Step 0
    method f0; env e0; calldataarg args0;
    if (f0.selector == sig:PrizesWallet.registerRoundEnd(uint256,address).selector
     || f0.selector == sig:PrizesWallet.depositEth(uint256,address).selector
     || f0.selector == sig:PrizesWallet.donateToken(uint256,address,address,uint256).selector
     || f0.selector == sig:PrizesWallet.donateNft(uint256,address,address,uint256).selector) {
		//require e0.msg.sender=0x0101010101010101010101010101010101010101;
    	require currentContract.game() == e0.msg.sender;
    }
	
    f0(e0, args0);

	satisfy true;
}
