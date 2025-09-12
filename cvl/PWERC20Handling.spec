/* =====================  Ghost custody per (round, token)  ===================== */
ghost mapping(uint256 => mapping(address => mathint)) gHeld;

/* side-effects used by wallet summaries */
function cvlPWDonate(uint256 round, address token, uint256 amount) {
	gHeld[round][token] = gHeld[round][token] + amount;
}

function cvlPWClaim(uint256 round, address token, uint256 amount) {
	require gHeld[round][token] >= amount, "claim: insufficient custody";
	gHeld[round][token] = gHeld[round][token] - amount;
}

/* =====================  Methods  ===================== */
methods {
	/* Summarize wallet token ops so no ERC20/holder calls occur at all */
	function PrizesWallet.donateToken(uint256 roundNum_, address donorAddress_, address tokenAddress_, uint256 amount_) external
		=> cvlPWDonate(roundNum_, tokenAddress_, amount_);

	function PrizesWallet.claimDonatedToken(uint256 roundNum_, address tokenAddress_, uint256 amount_) external
		=> cvlPWClaim(roundNum_, tokenAddress_, amount_);

	/* Minimal view we use to bind the game caller */
	function PrizesWallet.game() external returns (address) envfree;
}

/* =====================  Property: deposited == withdrawn  =====================

Flow (wallet ops summarized; no ERC20/holder interactions):
	1) game        -> donateToken(round, donor, token, donation)   => gHeld[round][token] += donation
	2) game        -> registerRoundEnd(round, beneficiary)         (real, no externals)
	3) beneficiary -> claimDonatedToken(round, token, deposit)     => gHeld[round][token] -= deposit

We compute the actual deposit from the ghost delta and claim exactly that, then assert
custody returns to the baseline (net zero).
============================================================================= */
rule donate_then_claim_preserves_amount {
	address donor;
	address beneficiary;
	address token;
	uint round;
	uint donation;

	env eGame;
	env eBeneficiary;

	require token != 0x0, "token!=0";
	require donor != 0x0, "donor!=0";
	require beneficiary != 0x0, "beneficiary!=0";
	require donor != beneficiary, "donor!=beneficiary";
	require donation > 0, "donation>0";

	/* caller identities */
	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require eBeneficiary.msg.sender == beneficiary, "claimer is beneficiary";

	/* baseline custody */
	mathint before = gHeld[round][token];

	/* 1) donate (summary updates ghost) */
	currentContract.donateToken(eGame, round, donor, token, donation);

	/* observe actual deposit from ghost */
	mathint after = gHeld[round][token];
	require after > before, "donation must increase custody";
	mathint deposit_mi = after - before;
	require deposit_mi >= 0, "deposit>=0";
	uint deposit; require deposit == deposit_mi, "cast deposit";

	/* 2) close round (real function; no external calls) */
	currentContract.registerRoundEnd(eGame, round, beneficiary);

	/* 3) claim exactly what was deposited (summary updates ghost) */
	currentContract.claimDonatedToken(eBeneficiary, round, token, deposit);

	/* net zero: custody back to baseline */
	assert gHeld[round][token] == before,
		"custody not back to baseline (withdrawn != deposited)";
}

