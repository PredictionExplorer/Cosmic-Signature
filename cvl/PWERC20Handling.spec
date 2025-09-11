/* ---------- Ghost fungible ledger per (token, account) ---------- */
ghost mapping(address => mapping(address => mathint)) gTokenBal;

/* mathint -> uint (used in summaries only) */
function asUint(mathint x) returns (uint256) {
	require x >= 0, "asUint: negative";
	uint256 y;
	require y == x, "asUint: VM equals mathint";
	return y;
}

/* Simple ERC20 semantics in ghost */
function cvlTransferFrom(address token, address from, address to, uint amount) returns (bool) {
	/* no allowances/fees in this rule */
	gTokenBal[token][from] = gTokenBal[token][from] - amount;
	gTokenBal[token][to]   = gTokenBal[token][to]   + amount;
	return true;
}
function cvlTransfer(address token, env e, address to, uint amount) returns (bool) {
	gTokenBal[token][e.msg.sender] = gTokenBal[token][e.msg.sender] - amount;
	gTokenBal[token][to]           = gTokenBal[token][to]           + amount;
	return true;
}

/* ---------- Methods (ERC-20 via wildcards; wallet helpers real) ---------- */
methods {
	function _.transferFrom(address from, address to, uint256 amount) external
		=> cvlTransferFrom(calledContract, from, to, amount) expect bool ALL;

	function _.transfer(address to, uint256 amount) external with(env eX)
		=> cvlTransfer(calledContract, eX, to, amount) expect bool ALL;

	function _.balanceOf(address account) external
		=> asUint(gTokenBal[calledContract][account]) expect uint ALL;

	/* Wallet helpers — MUST use EVM types + envfree for views */
	function PrizesWallet.game() external returns (address) envfree;
	function PrizesWallet.registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external returns (uint256);

	function PrizesWallet.getDonatedTokenBalanceAmount(uint256 roundNum_, address tokenAddress_) external returns (uint256) envfree;
	function PrizesWallet.getBalanceOfToken(address tokenAddr, address holder) external returns (uint256) envfree;

	/* Public getter for the holder (compiler-generated) */
	function PrizesWallet.donatedTokens(uint256 roundNum_) external returns (address) envfree;
}

/*
Flow:
	1) game -> donateToken(round, donor, token, donation)
	2) game -> registerRoundEnd(round, beneficiary)
	3) beneficiary -> claimDonatedToken(round, token, deposit)

Checks:
	- deposit = custody_after_donate - custody_before
	- beneficiary gained exactly deposit
	- custody returned to custody_before
	- start clean: custody_before == 0, beneficiary == 0
	- guard aliasing: holder != beneficiary
*/
rule donate_then_claim_preserves_amount {
	address donor;
	address beneficiary;
	address token;
	uint round;
	uint donation;

	env eGame;
	env eBeneficiary;

	require token != 0x0, "token != 0";
	require donor != 0x0, "donor != 0";
	require beneficiary != 0x0, "beneficiary != 0";
	require donor != beneficiary, "donor != beneficiary";
	require donation > 0, "donation > 0";

	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require eBeneficiary.msg.sender == beneficiary, "claimer is beneficiary (scenario)";

	/* baselines */
	uint custody_before = currentContract.getDonatedTokenBalanceAmount(round, token);
	uint benef_before	= currentContract.getBalanceOfToken(token, beneficiary);

	/* keep the scenario simple & clean */
	require custody_before == 0, "first donation: custody starts at 0";
	require benef_before == 0, "beneficiary starts at 0 for this token";

	/* donate — custody must strictly increase */
	currentContract.donateToken(eGame, round, donor, token, donation);
	uint custody_after_donate = currentContract.getDonatedTokenBalanceAmount(round, token);
	require custody_after_donate > custody_before, "donation must increase custody";

	/* anti-alias: ensure holder != beneficiary */
	address holder = currentContract.donatedTokens(round);
	require holder != beneficiary, "holder must differ from beneficiary";

	/* observed deposit (mathint-safe) cast to uint via equality require */
	mathint deposit_mi = custody_after_donate - custody_before;
	require deposit_mi >= 0, "deposit non-negative";
	uint deposit;
	require deposit == deposit_mi, "cast deposit";

	/* close the round */
	currentContract.registerRoundEnd(eGame, round, beneficiary);

	/* claim exactly what was deposited */
	currentContract.claimDonatedToken(eBeneficiary, round, token, deposit);

	/* beneficiary gained exactly the deposited amount */
	uint benef_after = currentContract.getBalanceOfToken(token, beneficiary);
	mathint benef_delta_mi = benef_after - benef_before;
	require benef_delta_mi >= 0, "benef delta non-negative";
	uint benef_delta;
	require benef_delta == benef_delta_mi, "cast benef delta";

	assert benef_delta == deposit, "beneficiary did not receive the deposited tokens";

	/* custody returned to baseline */
	uint custody_after_claim = currentContract.getDonatedTokenBalanceAmount(round, token);
	assert custody_after_claim == custody_before, "custody did not return to baseline after claim";
}

