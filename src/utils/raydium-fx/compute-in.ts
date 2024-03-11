import {
	CurrencyAmount,
	LIQUIDITY_FEES_DENOMINATOR,
	LIQUIDITY_FEES_NUMERATOR,
	Liquidity,
	LiquidityComputeAmountInParams,
	ONE,
	Percent,
	Price,
	Token,
	TokenAmount,
	ZERO,
} from '@raydium-io/raydium-sdk'

// copied (no change) from raydium sdk's Liquidity.computeAmountIn
export function computeAmountIn({
	poolKeys,
	poolInfo,
	amountOut,
	currencyIn,
	slippage,
}: LiquidityComputeAmountInParams):
	| {
			amountIn: CurrencyAmount
			maxAmountIn: CurrencyAmount
			currentPrice: Price
			executionPrice: Price | null
			priceImpact: Percent
	  }
	| {
			amountIn: TokenAmount
			maxAmountIn: TokenAmount
			currentPrice: Price
			executionPrice: Price | null
			priceImpact: Percent
	  } {
	const { baseReserve, quoteReserve } = poolInfo

	const currencyOut =
		amountOut instanceof TokenAmount ? amountOut.token : amountOut.currency

	const reserves = [baseReserve, quoteReserve]

	// output is fixed
	const output = Liquidity._getAmountSide(amountOut, poolKeys)
	if (output === 'base') {
		reserves.reverse()
	}

	const [reserveIn, reserveOut] = reserves

	const currentPrice = new Price(currencyIn, reserveIn, currencyOut, reserveOut)

	let amountInRaw = ZERO
	let amountOutRaw = amountOut.raw
	if (!amountOutRaw.isZero()) {
		// if out > reserve, out = reserve - 1
		if (amountOutRaw.gt(reserveOut)) {
			amountOutRaw = reserveOut.sub(ONE)
		}

		const denominator = reserveOut.sub(amountOutRaw)
		const amountInWithoutFee = reserveIn.mul(amountOutRaw).div(denominator)

		amountInRaw = amountInWithoutFee
			.mul(LIQUIDITY_FEES_DENOMINATOR)
			.div(LIQUIDITY_FEES_DENOMINATOR.sub(LIQUIDITY_FEES_NUMERATOR))
	}

	const _slippage = new Percent(ONE).add(slippage)
	const maxAmountInRaw = _slippage.mul(amountInRaw).quotient

	const amountIn =
		currencyIn instanceof Token
			? new TokenAmount(currencyIn, amountInRaw)
			: new CurrencyAmount(currencyIn, amountInRaw)
	const maxAmountIn =
		currencyIn instanceof Token
			? new TokenAmount(currencyIn, maxAmountInRaw)
			: new CurrencyAmount(currencyIn, maxAmountInRaw)

	let executionPrice: Price | null = null
	if (!amountInRaw.isZero() && !amountOutRaw.isZero()) {
		executionPrice = new Price(
			currencyIn,
			amountInRaw,
			currencyOut,
			amountOutRaw
		)
	}

	const priceImpact = Liquidity._computePriceImpact(
		currentPrice,
		amountInRaw,
		amountOutRaw
	)

	return {
		amountIn,
		maxAmountIn,
		currentPrice,
		executionPrice,
		priceImpact,
	}
}
