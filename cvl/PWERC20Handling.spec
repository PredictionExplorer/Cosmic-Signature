/* ---------- Ghost custody per (round, token) ---------- */
ghost mapping(uint256 => mapping(address => mathint)) gHeld;

/* Safe conversion from mathint to uint */
function asUint(mathint x) returns (uint256) {
	require x >= 0;
	return x;
}

/* Side-effect helpers for summarized wallet methods */
function cvlDonate(uint256 round, address token, uint256 amount) returns (bool) {
	gHeld[round][token] = gHeld[round][token] + amount;
	return true;
}
function cvlClaim(uint256 round, address token, uint256 amount) returns (bool) {
	require gHeld[round][token] >= amount;
	gHeld[round][token] = gHeld[round][token] - amount;
	return true;
}

/* ---------- Methods ---------- */
methods {
	/* Read-only helper */
	function PrizesWallet.game() external returns (address) envfree;

	/* Return custody directly from ghost (no ERC20 needed) */
	function PrizesWallet.getDonatedTokenBalanceAmount(uint256 roundNum_, address tokenAddress_) external returns (uint256) envfree
		=> asUint(gHeld[roundNum_][tokenAddress_]) expect uint ALL;

	/* Summarize mutations to update the ghost custody */
	function PrizesWallet.donateToken(uint256 roundNum_, address donorAddress_, address tokenAddress_, uint256 amount_) external
		=> cvlDonate(roundNum_, tokenAddress_, amount_);

	function PrizesWallet.claimDonatedToken(uint256 roundNum_, address tokenAddress_, uint256 amount_) external
		=> cvlClaim(roundNum_, tokenAddress_, amount_);

	/* IMPORTANT: match the real signature (it RETURNS uint256) */
	function PrizesWallet.registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external returns (uint256) optional;
}

/*
Flow (as requested):
	1) game -> donateToken(round, donor, token, amount)
	2) game -> registerRoundEnd(round, beneficiary)
	3) beneficiary -> claimDonatedToken(round, token, amount)

Check:
	getDonatedTokenBalanceAmount(round, token) goes +amount after donate,
	then returns to baseline after claim (tokens_deposited == tokens_withdrawn).
*/
rule donate_then_claim_preserves_amount {
	// symbols
	address donor;
	address beneficiary;
	address token;
	uint256 round;
	uint256 amount;

	env eGame;
	env eBeneficiary;

	require token != 0x0;
	require donor != 0x0;
	require beneficiary != 0x0;
	require donor != beneficiary;
	require amount > 0;

	// onlyGame guard honored by the env
	require eGame.msg.sender == currentContract.game();
	require eBeneficiary.msg.sender == beneficiary;

	// snapshot custody before any movement
	uint256 before_amt = currentContract.getDonatedTokenBalanceAmount(round, token);

	// 1) donate (onlyGame) → custody +amount
	currentContract.donateToken(eGame, round, donor, token, amount);
	uint256 after_donate = currentContract.getDonatedTokenBalanceAmount(round, token);
	assert after_donate == before_amt + amount,
		"donation did not increase custody by the donated amount";

	// 2) end round & set beneficiary (onlyGame)
	currentContract.registerRoundEnd(eGame, round, beneficiary);

	// 3) claim (beneficiary) → custody −amount back to baseline
	currentContract.claimDonatedToken(eBeneficiary, round, token, amount);
	uint256 after_claim = currentContract.getDonatedTokenBalanceAmount(round, token);
	assert after_claim == before_amt,
		"claim did not return custody to baseline (withdrawn != deposited)";
}

