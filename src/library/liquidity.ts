import {
	BNDivCeil,
	BigNumberish,
	Currency,
	CurrencyAmount,
	LIQUIDITY_FEES_DENOMINATOR,
	LIQUIDITY_FEES_NUMERATOR,
	LIQUIDITY_STATE_LAYOUT_V4,
	Liquidity,
	LiquidityComputeAmountInParams,
	LiquidityComputeAmountOutParams,
	LiquidityPoolInfo,
	LiquidityPoolKeys,
	LiquidityPoolKeysV4,
	LiquidityStateLayoutV4,
	LiquidityStateV4,
	MAINNET_PROGRAM_ID,
	MARKET_STATE_LAYOUT_V3,
	Market,
	MarketStateV3,
	ONE,
	Percent,
	Price,
	Token,
	TokenAmount,
	ZERO,
} from '@raydium-io/raydium-sdk'
import { connection, connectionAlt1 } from '../adapter/rpc'
import { MINIMAL_MARKET_STATE_LAYOUT_V3, MinimalMarketLayoutV3 } from '../types/market'
import { config } from '../utils/config'
import {
  AccountInfo,
	AddressLookupTableAccount,
	Commitment,
	ComputeBudgetProgram,
	LAMPORTS_PER_SOL,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js'
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from '../utils/const'
import { BotLiquidityState, MintInfo, PoolInfo } from '../types'
import { BN } from 'bn.js'
import { resolve } from 'path'
import { rejects } from 'assert'
import { payer } from '../adapter/payer'
import { BotTokenAccount } from './token-account'
import { TransactionCompute } from '../types'
import { BotError } from '../types/error'
import sleep from 'atomic-sleep'
import { redisClient } from '../adapter/redis'
import { BotMarket } from './market'
import { logger } from '../utils/logger'
import { BotTransaction } from './transaction'
import { BlockHashStorage } from '../storage'
import { lookupTable } from '../adapter/storage'
import { config as SystemConfig } from "../utils";

const getAccountPoolKeysFromAccountDataV4 = async (
	id: PublicKey,
	accountData: LiquidityStateV4
): Promise<LiquidityPoolKeys> => {
	const marketInfo = await connection.getAccountInfo(accountData.marketId, {
		commitment: config.get('default_commitment') as Commitment,
		dataSlice: {
			offset: 253, // eventQueue
			length: 32 * 3,
		},
	})

	if (!marketInfo) {
		throw new Error('Error fetching market info')
	}

	const minimalMarketData = MINIMAL_MARKET_STATE_LAYOUT_V3.decode(
		marketInfo.data
	)

	return {
		id,
		baseMint: accountData.baseMint,
		quoteMint: accountData.quoteMint,
		lpMint: accountData.lpMint,
		baseDecimals: accountData.baseDecimal.toNumber(),
		quoteDecimals: accountData.quoteDecimal.toNumber(),
		lpDecimals: 5,
		version: 4,
		programId: MAINNET_PROGRAM_ID.AmmV4,
		authority: Liquidity.getAssociatedAuthority({
			programId: MAINNET_PROGRAM_ID.AmmV4,
		}).publicKey,
		openOrders: accountData.openOrders,
		targetOrders: accountData.targetOrders,
		baseVault: accountData.baseVault,
		quoteVault: accountData.quoteVault,
		marketVersion: 3,
		marketProgramId: accountData.marketProgramId,
		marketId: accountData.marketId,
		marketAuthority: Market.getAssociatedAuthority({
			programId: accountData.marketProgramId,
			marketId: accountData.marketId,
		}).publicKey,
		marketBaseVault: accountData.baseVault,
		marketQuoteVault: accountData.quoteVault,
		marketBids: minimalMarketData.bids,
		marketAsks: minimalMarketData.asks,
		marketEventQueue: minimalMarketData.eventQueue,
		withdrawQueue: accountData.withdrawQueue,
		lpVault: accountData.lpVault,
		lookupTableAccount: PublicKey.default,
	}
}

export const getLiquidityMintState = async (
	accountData: LiquidityStateV4
): Promise<BotLiquidityState> => {
	let mint: PublicKey
	let decimal: number
	let isMintBase = true
	if (accountData.baseMint.toString() === WSOL_ADDRESS) {
		mint = accountData.quoteMint
		decimal = accountData.quoteDecimal.toNumber()
		isMintBase = false
	} else if (accountData.quoteMint.toString() === WSOL_ADDRESS) {
		mint = accountData.baseMint
		decimal = accountData.baseDecimal.toNumber()
		isMintBase = true
	} else {
		throw new Error('Pool doesnt have SOL')
	}

	return {
		ammId: accountData.marketId,
		mint,
		isMintBase,
		mintDecimal: decimal
	}
}

export { getAccountPoolKeysFromAccountDataV4 }


export class BotLiquidity {

	static async getAccountPoolKeys (ammId: PublicKey): Promise<LiquidityPoolKeysV4 & PoolInfo | undefined> {
		let stateData = await redisClient.hGet(`${ammId.toBase58()}`, 'state')

		if(stateData) {

			
			let state = LIQUIDITY_STATE_LAYOUT_V4.decode(Buffer.from(stateData, 'hex'))
			
			let mint: PublicKey
			if(state.baseMint.toBase58() === WSOL_ADDRESS) {
				mint = state.quoteMint
			} else {
				mint = state.baseMint
			}
			
			let marketData = await redisClient.hGet(`${mint.toBase58()}`, 'market')
			
			let market: MarketStateV3 | undefined
			if(marketData) {
				market = MARKET_STATE_LAYOUT_V3.decode(Buffer.from(marketData, 'hex'));
			} else {
				logger.info(`Read market from JSON RPC`)
				market = await BotMarket.getMarketV3(state.marketId)
			}

			if(market) {
				return {
					...this.createPoolKeys(ammId, state, market!),
				}
			}
		} else {
			// logger.error(`No state data`)
			return await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
		}
	}

	/**
	 * Function to know if the LP pool is a newly active
	 * If the pool is just opened in less than 5 second
	 * @param ammId 
	 * @returns 
	 */
	static async isLiquidityPoolNewlyActive(ammId: PublicKey, cutOffTime: number = 5000) : Promise<boolean> {
		let stateData = await redisClient.hGet(`${ammId.toBase58()}`, 'state')
		if(stateData) {
			let state = LIQUIDITY_STATE_LAYOUT_V4.decode(Buffer.from(stateData, 'hex'))
			return new Date().getTime() - (state.poolOpenTime.toNumber() * 1000) <= cutOffTime
		}

		return false
	}

	/**
	 *
	 * @param ammId
	 * @returns
	 */
	static getAccountPoolKeysFromAccountDataV4 = async (
		ammId: PublicKey
	): Promise<LiquidityPoolKeys & PoolInfo | undefined> => {

		let account: AccountInfo<Buffer> | null = await connection.fetchAccountInfo(ammId, {
			commitment: config.get('default_commitment') as Commitment,
		})

		if (!account) {
			return undefined
		}

		return BotLiquidity.formatAccountPoolKeysFromAccountDataV4(ammId, account.data)
	}

	/**
	 * Create pool key from onProgramChange, and MinimalMarket data
	 * @param ammId 
	 * @param accountData 
	 * @param minimalMarketLayoutV3 
	 * @returns 
	 */
	static createPoolKeys(
		ammId: PublicKey,
		accountData: LiquidityStateV4,
		marketStateLayout: MarketStateV3,
	  ): LiquidityPoolKeys & PoolInfo {

		const programId = MAINNET_PROGRAM_ID.AmmV4
		const marketId = accountData.marketId
		
		const { publicKey: authority, nonce } = Liquidity.getAssociatedAuthority({ programId })

		return {
		  id: ammId,
		  baseMint: accountData.baseMint,
		  quoteMint: accountData.quoteMint,
		  lpMint: accountData.lpMint,
		  baseDecimals: accountData.baseDecimal.toNumber(),
		  quoteDecimals: accountData.quoteDecimal.toNumber(),
		  lpDecimals: 5,
		  version: 4,
		  programId: new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
		  authority,
		  openOrders: accountData.openOrders,
		  targetOrders: accountData.targetOrders,
		  baseVault: accountData.baseVault,
		  quoteVault: accountData.quoteVault,
		  marketVersion: 3,
		  marketProgramId: accountData.marketProgramId,
		  marketId,
		  marketAuthority: authority,
		  marketBaseVault: marketStateLayout.baseVault,
		  marketQuoteVault: marketStateLayout.quoteVault,
		  marketBids: marketStateLayout.bids,
		  marketAsks: marketStateLayout.asks,
		  marketEventQueue: marketStateLayout.eventQueue,
		  withdrawQueue: accountData.withdrawQueue,
		  lpVault: accountData.lpVault,
		  lookupTableAccount: PublicKey.default,
		  poolOpenTime: accountData.poolOpenTime.toNumber()
		};
	  }

	/**
	 * formating data and generate pool keys structure
	 * @param ammId 
	 * @param data 
	 * @returns 
	 */
	static async formatAccountPoolKeysFromAccountDataV4(ammId: PublicKey, data: Buffer): Promise<LiquidityPoolKeys & PoolInfo> {
		const accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(data)
    
		const marketInfo = await connection.getAccountInfo(accountData.marketId, {
			commitment: config.get('default_commitment') as Commitment
		})

		if (!marketInfo) {
			throw new Error(BotError.MARKET_FETCH_ERROR)
		}

		const marketData = MARKET_STATE_LAYOUT_V3.decode(
			marketInfo.data
		)

		return {
			id: ammId,
			baseMint: accountData.baseMint,
			quoteMint: accountData.quoteMint,
			lpMint: accountData.lpMint,
			baseDecimals: accountData.baseDecimal.toNumber(),
			quoteDecimals: accountData.quoteDecimal.toNumber(),
			lpDecimals: 5,
			version: 4,
			programId: MAINNET_PROGRAM_ID.AmmV4,
			authority: Liquidity.getAssociatedAuthority({
				programId: MAINNET_PROGRAM_ID.AmmV4,
			}).publicKey,
			openOrders: accountData.openOrders,
			targetOrders: accountData.targetOrders,
			baseVault: accountData.baseVault,
			quoteVault: accountData.quoteVault,
			marketVersion: 3,
			marketProgramId: accountData.marketProgramId,
			marketId: accountData.marketId,
			marketAuthority: Market.getAssociatedAuthority({
				programId: accountData.marketProgramId,
				marketId: accountData.marketId,
			}).publicKey,
			marketBaseVault: marketData.baseVault,
			marketQuoteVault: marketData.quoteVault,
			marketBids: marketData.bids,
			marketAsks: marketData.asks,
			marketEventQueue: marketData.eventQueue,
			withdrawQueue: accountData.withdrawQueue,
			lpVault: accountData.lpVault,
			lookupTableAccount: PublicKey.default,
			poolOpenTime: accountData.poolOpenTime.toNumber()
		}
	}

	/**
	 * Get token mint address from LiquidityPoolKeysV4
	 * Token mint can be either in baseMint or quoteMint
	 * This called only focus on WSOL pair only
	 * @param poolKeys
	 * @returns
	 */
	static getMintInfoFromWSOLPair = (
		poolKeys: LiquidityPoolKeysV4
	): MintInfo => {
		let mint: PublicKey | undefined = undefined
		let decimal: number = 0
		let isMintBase: boolean = true
		// Check if either of is WSOL
		if (poolKeys.baseMint.toBase58() === WSOL_ADDRESS) {
			mint = poolKeys.quoteMint
			decimal = poolKeys.quoteDecimals
			isMintBase = false
		} else {
			if (poolKeys.quoteMint.toBase58() === WSOL_ADDRESS) {
				mint = poolKeys.baseMint
				decimal = poolKeys.baseDecimals
			}
		}

		return {
			mint,
			decimal,
			isMintBase,
		}
	}


	static getSourceDestinationTokenAccount = async(
		poolKeys: LiquidityPoolKeys, 
		direction: 'in' | 'out', 
		wsolTokenAccount: PublicKey
	) => {
		let sourceAccountIn
		let destinationAccountIn
		let accountInDecimal
		let startInstructions: TransactionInstruction[] = []

		if (direction === 'in') {
			let accountOut
			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountOut = poolKeys.quoteMint
			} else {
				accountOut = poolKeys.baseMint
			}

			const { ata, instructions } =
				await BotTokenAccount.getOrCreateTokenAccountInstruction(
					accountOut,
					true
				)

			sourceAccountIn = wsolTokenAccount
			destinationAccountIn = ata

			startInstructions = instructions
		} else {
			let accountIn: PublicKey

			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountIn = poolKeys.quoteMint
				accountInDecimal = poolKeys.quoteDecimals
			} else {
				accountIn = poolKeys.baseMint
				accountInDecimal = poolKeys.baseDecimals
			}

			const { ata } = await BotTokenAccount.getOrCreateTokenAccountInstruction(
				accountIn,
				false
			)

			sourceAccountIn = ata
			destinationAccountIn = wsolTokenAccount
		}

		return {sourceAccountIn, destinationAccountIn, accountInDecimal, startInstructions}
	}

	/**
	 * Create a simple signed swap instructions
	 * @param poolKeys
	 * @param direction
	 * @param wsolTokenAccount
	 * @param amount
	 * @param latestBlockHash
	 * @returns
	 */
	static makeSimpleSwapInstruction = async (
		poolKeys: LiquidityPoolKeys,
		direction: 'in' | 'out',
		wsolTokenAccount: PublicKey,
		amountIn: BigNumberish,
		amountOut: BigNumberish,
		fixedSide: 'in' | 'out',
		config?: {
			blockhash?: string,
			compute?: TransactionCompute,
			alts: AddressLookupTableAccount[]
		}
	): Promise<VersionedTransaction> => {
		let tokenAccountIn
		let tokenAccountOut
		let accountInDecimal
		let blockhash = config?.blockhash

		let startInstructions: TransactionInstruction[] = []

		if (!blockhash) {
			const block = await connection.getLatestBlockhash({
				commitment: 'confirmed',
			})
			blockhash = block.blockhash
		}

		if (direction === 'in') {
			let accountOut
			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountOut = poolKeys.quoteMint
			} else {
				accountOut = poolKeys.baseMint
			}

			const { ata, instructions } =
				await BotTokenAccount.getOrCreateTokenAccountInstruction(
					accountOut,
					true
				)

			tokenAccountIn = wsolTokenAccount
			tokenAccountOut = ata
			startInstructions = instructions
		} else {
			let accountIn: PublicKey

			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountIn = poolKeys.quoteMint
				accountInDecimal = poolKeys.quoteDecimals
			} else {
				accountIn = poolKeys.baseMint
				accountInDecimal = poolKeys.baseDecimals
			}

			const { ata } = await BotTokenAccount.getOrCreateTokenAccountInstruction(
				accountIn,
				false
			)

			tokenAccountIn = ata
			tokenAccountOut = wsolTokenAccount
		}

		const { innerTransaction } = Liquidity.makeSwapInstruction({
			poolKeys,
			userKeys: {
				tokenAccountIn,
				tokenAccountOut,
				owner: payer.publicKey,
			},
			amountIn: amountIn,
			amountOut: amountOut,
			fixedSide: fixedSide ? fixedSide : 'in',
		})
		
		// const cu = await BotTransaction.getExpectedComputeUnitFromTransactions(
		// 	connectionAlt1, 
		// 	[
		// 		...startInstructions,
		// 		...innerTransaction.instructions
		// 	],
		// 	blockhash
		// )

		// console.log(cu)

		let computeInstructions: TransactionInstruction[] = []

		if (config?.compute && config?.compute.units > 0) {
			computeInstructions.push(
				ComputeBudgetProgram.setComputeUnitLimit({
					// units: cu || 60000,
					units: config.compute.units
				})
			)
		}

		if (config?.compute && config?.compute.units > 0) {
			computeInstructions.push(
				ComputeBudgetProgram.setComputeUnitPrice({
					microLamports: config.compute.microLamports,
				})
			)
		}

		const messageV0 = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash as string,
			instructions: [
				...computeInstructions,
				...startInstructions,
				...innerTransaction.instructions,
			],
		}).compileToV0Message(config?.alts ?? [])

		const transaction = new VersionedTransaction(messageV0)

		transaction.sign([payer, ...innerTransaction.signers])

		return transaction
	}

	static makeAmmSwapAccounts = async (
		poolKeys: LiquidityPoolKeysV4,
		direction: 'in' | 'out',
		wsolTokenAccount: PublicKey,
		amountIn: BigNumberish,
		amountOut: BigNumberish,
		config?: {
			blockhash?: String
			compute?: TransactionCompute
	}) => {
		let tokenAccountIn
		let tokenAccountOut
		let accountInDecimal
		let blockhash = config?.blockhash

		if (!blockhash) {
			const block = await connection.getLatestBlockhash({
				commitment: 'confirmed',
			})
			blockhash = block.blockhash
		}

		if (direction === 'in') {
			let accountOut
			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountOut = poolKeys.quoteMint
			} else {
				accountOut = poolKeys.baseMint
			}

			const { ata, instructions } =
				await BotTokenAccount.getOrCreateTokenAccountInstruction(
					accountOut,
					true
				)

			tokenAccountIn = wsolTokenAccount
			tokenAccountOut = ata
		} else {
			let accountIn: PublicKey

			if (poolKeys.baseMint.toString() === WSOL_ADDRESS) {
				accountIn = poolKeys.quoteMint
				accountInDecimal = poolKeys.quoteDecimals
			} else {
				accountIn = poolKeys.baseMint
				accountInDecimal = poolKeys.baseDecimals
			}

			const { ata } = await BotTokenAccount.getOrCreateTokenAccountInstruction(
				accountIn,
				false
			)

			tokenAccountIn = ata
			tokenAccountOut = wsolTokenAccount
		}


	}

	/**
	 * Get token price
	 * @param mint 
	 * @param poolKeys 
	 * @param poolInfo 
	 * @returns 
	 */
	static getTokenPrice(
		mint: PublicKey,
		poolKeys: LiquidityPoolKeysV4,
		poolInfo: LiquidityPoolInfo
	) {
		const { baseReserve, quoteReserve, baseDecimals, quoteDecimals } = poolInfo

		const reserves = [baseReserve, quoteReserve]
		const decimals = [baseDecimals, quoteDecimals]

		if (mint.equals(poolKeys.quoteMint)) {
			reserves.reverse()
			decimals.reverse()
		}

		const [reserveIn, reserveOut] = reserves
		const [decimalIn, decimalOut] = decimals

		const price = new Price(
			new Currency(decimalIn),
			reserveIn,
			new Currency(decimalOut),
			reserveOut
		)
		return parseFloat(price.toSignificant(decimalIn))
	}

	static computeAmountIn({
		poolKeys,
		poolInfo,
		amountOut,
		currencyIn,
		slippage,
	}: LiquidityComputeAmountInParams):
		| {
				amountIn: CurrencyAmount
				maxAmountIn: CurrencyAmount
		  }
		| {
				amountIn: TokenAmount
				maxAmountIn: TokenAmount
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

		return {
			amountIn,
			maxAmountIn,
		}
	}
}
