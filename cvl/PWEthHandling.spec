methods {
	function game() external returns (address) envfree;
	function getUserEthBalance(address) external returns (uint256) envfree;
}

persistent ghost bool g_captureNextCall;
persistent ghost uint256 g_capturedCallValue;
persistent ghost address g_winnerAddr;

hook CALL(uint g, address addr, uint value, uint argsOffset, uint argsLength, uint retOffset, uint retLength) uint rc {
	if (g_captureNextCall && executingContract == currentContract && value > 0 && argsLength == 0 && addr==g_winnerAddr) {
		g_capturedCallValue = value;
		g_captureNextCall = false;   // record only the first matching CALL for this phase
	}
}

rule balanceChangesCorrectly() {
	// fresh actors
	address winner;
	address other;
	require winner != other;
	require winner != currentContract;
	require winner != currentContract.game();
	require winner != 0;
	require currentContract != currentContract.game();
	require currentContract.getUserEthBalance(winner) == 0;
	require currentContract.getUserEthBalance(other) == 0;

	// positive amounts so we see meaningful transfers
	uint256 amount1;
	uint256 amount2;
	require amount1 > 0;
	require amount2 > 0;

	// choose rounds
	uint256 round1;
	uint256 round2;
	require round2 == round1 + 1;

	/* -------------------------
	   Case A: winner withdraws
	   ------------------------- */

	env eA1;
	require eA1.msg.sender == currentContract.game();
	require eA1.msg.value  == 0;
	uint256 timeout1 = registerRoundEnd(eA1, round1, winner);

	env eA2;
	require eA2.msg.sender == currentContract.game();
	require eA2.msg.value  == amount1;
	depositEth(eA2, round1, winner);

	// enable capture for low-level transfer in withdrawEth()
	g_captureNextCall   = true;
	g_capturedCallValue = 0;
	g_winnerAddr = winner;

	env eA3;
	uint256 balanceBeforeW1;
	require balanceBeforeW1 == nativeBalances[currentContract];
	require eA3.msg.sender == winner;
	require eA3.msg.value  == 0;
	withdrawEth(eA3);

	assert !g_captureNextCall, "withdraw #1: CALL message was not captured";                           // hook fired
	assert g_capturedCallValue == amount1, "withdraw #1: call value mismatch";
	assert (nativeBalances[currentContract] + amount1) == balanceBeforeW1, "withdraw #1 PrizesWallet balance incorrect";

	/* -------------------------------------------------
	   Case B: third-party withdraw after timeout passes
	   ------------------------------------------------- */

	env eB1;
	require eB1.msg.sender == currentContract.game();
	require eB1.msg.value  == 0;
	uint256 timeout2 = registerRoundEnd(eB1, round2, winner);

	env eB2;
	require eB2.msg.sender == currentContract.game();
	require eB2.msg.value  == amount2;
	depositEth(eB2, round2, winner);

	// enable capture for low-level transfer in withdrawEth(address)
	g_captureNextCall   = true;
	g_capturedCallValue = 0;
	g_winnerAddr =  other;

	env eB3;
	uint256 balanceBeforeW2;
	require balanceBeforeW2 == nativeBalances[currentContract];
	require eB3.msg.sender      == other;
	require eB3.msg.value       == 0;
	require eB3.block.timestamp >= timeout2;
	withdrawEth(eB3, winner);

	assert !g_captureNextCall, "withdraw #2: CALL message was not captured";                           // hook fired
	assert g_capturedCallValue == amount2, "withdraw #2: call value mismatch";
	assert (nativeBalances[currentContract] + amount2) == balanceBeforeW2, "withdraw #xi21 PrizesWallet balance incorrect";
}
