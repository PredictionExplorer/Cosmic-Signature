/* ===================== Ghosts ===================== */
/* custody inside PrizesWallet per (round, token) */
persistent ghost mapping(uint256 => mapping(address => mathint)) gHeld;
/* receipts per (token, receiver) */
persistent ghost mapping(address => mapping(address => mathint)) gRecv;

/* ghost updates */
function cvlPWDonate(uint256 round, address token, uint256 amount) {
	gHeld[round][token] = gHeld[round][token] + amount;
}

/* timing-aware claim:
   - if to == prizeWinner → allowed regardless of time
   - else                 → allowed only if timeout>0 and now >= timeout */
function cvlPWClaimTimed(uint256 round, address token, uint256 amount, address to, uint now, address prizeWinner, uint timeout) {
	require to == prizeWinner || (timeout > 0 && now >= timeout), "claim timing";
	require gHeld[round][token] >= amount, "claim: insufficient custody";
	gHeld[round][token] = gHeld[round][token] - amount;
	gRecv[token][to] = gRecv[token][to] + amount;
}

/* ================================ Methods ================================= */
/* Summaries use EVM types so they match ABI even if Solidity uses IERC20. */
methods {
	function PrizesWallet.donateToken(uint256 roundNum_, address donorAddress_, address tokenAddress_, uint256 amount_) external
		=> cvlPWDonate(roundNum_, tokenAddress_, amount_);

	function PrizesWallet.claimDonatedToken(uint256 roundNum_, address tokenAddress_, uint256 amount_) external with(env e)
		=> cvlPWClaimTimed(
			roundNum_,
			tokenAddress_,
			amount_,
			e.msg.sender,
			e.block.timestamp,
			currentContract.mainPrizeBeneficiaryAddresses(roundNum_),
			currentContract.roundTimeoutTimesToWithdrawPrizes(roundNum_)
		);

	/* read-only helpers we reference in summaries/rules */
	function PrizesWallet.game() external returns (address) envfree;
	function PrizesWallet.mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
	function PrizesWallet.roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
}

/* ===== Case A: prizeWinner claims before timeout (original flow, timing-safe) ===== */
rule donate_then_claim_preserves_amount {
	address donor;
	address prizeWinner;
	address token;
	uint round;
	uint donation;

	env eGame;
	env ePrize;

	require donor != 0x0, "donor!=0";
	require prizeWinner != 0x0, "prizeWinner!=0";
	require donor != prizeWinner, "donor!=prizeWinner";
	require donation > 0, "donation>0";

	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require ePrize.msg.sender == prizeWinner, "claimer is prizeWinner";

	/* baselines */
	mathint custody_before = gHeld[round][token];
	mathint prize_before_mi = gRecv[token][prizeWinner];

	/* 1) donate */
	currentContract.donateToken(eGame, round, donor, token, donation);

	/* observed deposit */
	mathint custody_after_donate = gHeld[round][token];
	require custody_after_donate > custody_before, "donation must increase custody";
	mathint deposit_mi = custody_after_donate - custody_before;
	require deposit_mi >= 0, "deposit>=0";
	uint deposit; require deposit == deposit_mi, "cast deposit";

	/* 2) close round (sets prizeWinner + timeout in storage) */
	currentContract.registerRoundEnd(eGame, round, prizeWinner);

	/* 3) prizeWinner claims (timing satisfied: claimer==prizeWinner) */
	currentContract.claimDonatedToken(ePrize, round, token, deposit);

	/* custody back to baseline */
	assert gHeld[round][token] == custody_before,
		"custody not back to baseline (withdrawn != deposited)";

	/* prizeWinner received exactly the deposit */
	mathint prize_after_mi = gRecv[token][prizeWinner];
	mathint prize_gain_mi = prize_after_mi - prize_before_mi;
	require prize_gain_mi >= 0, "prize gain>=0";
	uint prize_gain; require prize_gain == prize_gain_mi, "cast prize gain";
	assert prize_gain == deposit, "prizeWinner did not receive the deposited amount";
}

/* ===== Case B: timeout path — anyPlayer (≠ prizeWinner) claims after timeout ===== */
rule donate_then_late_claim_preserves_amount {
	address donor;
	address prizeWinner;
	address anyPlayer;
	address token;
	uint round;
	uint donation;

	env eGame;
	env eAny;

	require donor != 0x0, "donor!=0";
	require prizeWinner != 0x0, "prizeWinner!=0";
	require anyPlayer != 0x0, "anyPlayer!=0";
	require donor != prizeWinner, "donor!=prizeWinner";
	require anyPlayer != prizeWinner, "anyPlayer!=prizeWinner";
	require donation > 0, "donation>0";

	require eGame.msg.sender == currentContract.game(), "only game may donate/register";
	require eAny.msg.sender == anyPlayer, "claimer is anyPlayer";

	/* baselines */
	mathint custody_before = gHeld[round][token];
	mathint any_before_mi = gRecv[token][anyPlayer];

	/* 1) donate */
	currentContract.donateToken(eGame, round, donor, token, donation);

	/* compute deposit */
	mathint custody_after_donate = gHeld[round][token];
	require custody_after_donate > custody_before, "donation must increase custody";
	mathint deposit_mi = custody_after_donate - custody_before;
	require deposit_mi >= 0, "deposit>=0";
	uint deposit; require deposit == deposit_mi, "cast deposit";

	/* 2) close round + capture timeout */
	currentContract.registerRoundEnd(eGame, round, prizeWinner);
	uint timeout = currentContract.roundTimeoutTimesToWithdrawPrizes(round);
	require timeout > 0, "timeout set";

	/* ensure the late claim happens AFTER timeout */
	require eAny.block.timestamp >= timeout, "late claim must be after timeout";

	/* 3) anyPlayer withdraws deposit (timing checked in summary) */
	currentContract.claimDonatedToken(eAny, round, token, deposit);

	/* custody back to baseline */
	assert gHeld[round][token] == custody_before,
		"custody not back to baseline after late claim";

	/* anyPlayer received exactly the deposit */
	mathint any_after_mi = gRecv[token][anyPlayer];
	mathint any_gain_mi = any_after_mi - any_before_mi;
	require any_gain_mi >= 0, "any gain>=0";
	uint any_gain; require any_gain == any_gain_mi, "cast any gain";
	assert any_gain == deposit, "anyPlayer did not receive the deposited amount";
}

