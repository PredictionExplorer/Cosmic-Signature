methods {
	function game() external returns (address) envfree;
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

	// positive amounts so we see meaningful balance changes
	uint256 amount1;
	uint256 amount2;
	require amount1 > 0;
	require amount2 > 0;

	// choose rounds
	uint256 round1;
	uint256 round2;
	require round2 == (round1 + 1);

	// -------------------------
	// Case A: winner withdraws
	// -------------------------
	env eA1;
	require eA1.msg.sender != currentContract;
	uint256 c0 = nativeBalances[currentContract];
	uint256 w0 = nativeBalances[winner];
	require currentContract.game() == eA1.msg.sender;
	require eA1.msg.value == 0;
	// register round end (must be called by game)
	require eA1.msg.sender == currentContract.game();
	// timestamp can be arbitrary here
	uint256 timeout1 = registerRoundEnd(eA1, round1, winner);

	assert nativeBalances[currentContract] == c0;

	// deposit ETH for winner (by game) with msg.value = amount1
	env eA2;
	require eA2.msg.sender == currentContract.game();
	require eA2.msg.value == amount1;
	depositEth(eA2, round1, winner);

	assert nativeBalances[currentContract] == c0 + amount1;

	// winner withdraws own ETH; make gasprice 0 for exact balance deltas
	env eA3;
	require eA3.msg.sender == winner;
	withdrawEth(eA3);

	assert nativeBalances[currentContract] == c0;
	assert nativeBalances[winner] == w0 + amount1;

	// -------------------------------------------------
	// Case B: third-party withdraw after timeout passes
	// -------------------------------------------------
	uint256 c1 = nativeBalances[currentContract];
	uint256 o0 = nativeBalances[other];

	// register next round end (by game) and capture timeout
	env eB1;
	require eB1.msg.sender == currentContract.game();
	require eB1.msg.value == 0;
	uint256 timeout2 = registerRoundEnd(eB1, round2, winner);

	// deposit ETH for the same winner in round2
	env eB2;
	require eB2.msg.sender == currentContract.game();
	require eB2.msg.value == amount2;
	depositEth(eB2, round2, winner);

	assert nativeBalances[currentContract] == c1 + amount2;

	// advance time to/after timeout and allow non-winner to withdraw on behalf
	env eB3;
	require eB3.msg.sender == other;

	// set timestamp to meet the require(block.timestamp >= timeout && timeout > 0)
	// (timeout2 is > 0 by construction in the contract)
	require eB3.block.timestamp == timeout2;
	withdrawEth(eB3, winner);

	assert nativeBalances[currentContract] == c1;
	assert nativeBalances[other] == o0 + amount2;
}

