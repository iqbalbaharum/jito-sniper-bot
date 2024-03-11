import {
	LAMPORTS_PER_SOL,
	PublicKey,
	VersionedTransaction,
} from '@solana/web3.js'
import { mainSearcherClient } from '../adapter/jito'
import { mempool } from '../generators'
import {
	BotLiquidity,
	BotLookupTable,
	BotTokenAccount,
	getJitoTipAccount,
	setupWSOLTokenAccount,
} from '../services'
import { ExistingRaydiumMarketStorage } from '../storage'
import { LookupIndex, TxInstruction, TxPool } from '../types'
import {
	RAYDIUM_AUTHORITY_V4_ADDRESS,
	RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS,
	WSOL_ADDRESS,
} from '../utils'
import { logger } from '../utils/logger'
import {
	BigNumberish,
	Liquidity,
	LiquidityPoolKeysV4,
	Percent,
	TOKEN_PROGRAM_ID,
	Token,
	TokenAmount,
} from '@raydium-io/raydium-sdk'
import BN from 'bn.js'
import { RaydiumAmmCoder } from '../utils/coder'
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from '@coral-xyz/anchor'
import { connection } from '../adapter/rpc'
import { config } from '../utils/config'
import { payer } from '../adapter/payer'
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types'
import { computeAmountIn } from '../utils/raydium-fx/compute-in'

let lookupTable: BotLookupTable
let botTokenAccount: BotTokenAccount
let existingMarkets: ExistingRaydiumMarketStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const onBundleResult = () => {
	mainSearcherClient.onBundleResult(
		(bundleResult) => {
			const bundleId = bundleResult.bundleId
			const isAccepted = bundleResult.accepted
			const isRejected = bundleResult.rejected

			if (isAccepted) {
				logger.info(
					`Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`
				)
			}

			if (isRejected) {
				logger.warn(bundleResult.rejected, `Bundle ${bundleId} rejected:`)
			}
		},
		(error) => {
			logger.error(error)
		}
	)
}

const buyTokenInstruction = async (
	keys: LiquidityPoolKeysV4,
	ata: PublicKey,
	amountIn: BigNumberish,
	amountOut: BigNumberish,
	blockhash?: string
) => {
	try {
		const transaction = await BotLiquidity.makeSimpleSwapInstruction(
			keys,
			'in',
			ata,
			amountIn,
			amountOut,
			'out',
			{
				compute: {
					microLamports: 10000,
					units: 101337,
				},
				blockhash,
			}
		)

		return transaction
	} catch (e: any) {
		logger.error(e.toString())
	}
}

const sellTokenInstruction = async (
	keys: LiquidityPoolKeysV4,
	ata: PublicKey,
	amountIn: BigNumberish,
	amountOut: BigNumberish,
	blockhash: string
) => {
	try {
		const transaction = await BotLiquidity.makeSimpleSwapInstruction(
			keys,
			'out',
			ata,
			amountIn,
			amountOut,
			'in',
			{
				compute: {
					microLamports: 10000,
					units: 101337,
				},
				blockhash,
			}
		)

		return transaction
	} catch (e) {
		console.log(e)
	}
}

const processDeposit = async (instruction: TxInstruction, txPool: TxPool) => {
	const tx = txPool.mempoolTxns

	const accountIndexes: number[] = instruction.accounts

	const lookupsForAccountKeyIndex: LookupIndex[] =
		BotLookupTable.generateTableLookup(tx.addressTableLookups)

	let ammId: PublicKey | undefined

	const accountIndex = accountIndexes[1]
	if (accountIndex >= tx.accountKeys.length) {
		const lookupIndex = accountIndex - tx.accountKeys.length
		const lookup = lookupsForAccountKeyIndex[lookupIndex]
		const table = await lookupTable.getLookupTable(
			new PublicKey(lookup?.lookupTableKey)
		)
		ammId = table?.state.addresses[lookup?.lookupTableIndex]
	} else {
		ammId = new PublicKey(tx.accountKeys[accountIndex])
	}

	return ammId
}

async function* processTx(txns: AsyncGenerator<TxPool>, ata: PublicKey) {
	for await (const { mempoolTxns, timing } of txns) {
		for (const ins of mempoolTxns.instructions) {
			const programId = mempoolTxns.accountKeys[ins.programIdIndex]
			if (programId !== RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) continue

			const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
			if (!decodedIx.hasOwnProperty('swapBaseIn')) continue

			const ammId = await processDeposit(ins, { mempoolTxns, timing })
			if (!ammId || existingMarkets.isExisted(ammId)) continue

			yield {
				mempoolTxns,
				timing,
				ammId,
				ins,
				ata,
			}
		}
	}
}

async function* buildSingleBlockTradeBundle(
	iterator: AsyncGenerator<
		TxPool & { ata: PublicKey; ammId: PublicKey; ins: TxInstruction }
	>
) {
	for await (const { mempoolTxns, ata, ammId } of iterator) {
		const poolKeys =
			await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
		const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
		const poolInfo = await Liquidity.fetchInfo({
			connection: connection,
			poolKeys,
		})
		// Cancel process if pair is not WSOL
		if (info.mint === undefined) continue

		const currentTokenPrice = BotLiquidity.getTokenPrice(
			info.mint,
			poolKeys,
			poolInfo
		)
		const tradeSize = (0.0001 / currentTokenPrice).toFixed(0)

		const slippage = new Percent(1, 100)

		let currencyOut = new Token(TOKEN_PROGRAM_ID, info.mint, info.decimal)

		const currencyIn = new Token(
			TOKEN_PROGRAM_ID,
			new PublicKey(WSOL_ADDRESS),
			9
		)

		let amountOutBN = new TokenAmount(currencyOut, tradeSize)

		// Liquidity.computeAmountIn gave '[DecimalError] Division by zero' for some Token
		const { maxAmountIn } = computeAmountIn({
			poolKeys,
			poolInfo,
			amountOut: amountOutBN,
			currencyIn,
			slippage,
		})

		const blockhash = mempoolTxns.recentBlockhash

		const fixedAmountOut = new TokenAmount(currencyIn, new BN(0)).raw

		const [buyTx, sellTx] = await Promise.all([
			buyTokenInstruction(
				poolKeys,
				ata,
				maxAmountIn.raw,
				amountOutBN.raw,
				blockhash
			),
			sellTokenInstruction(
				poolKeys,
				ata,
				amountOutBN.raw,
				fixedAmountOut,
				blockhash
			),
		])

		if (!buyTx || !sellTx) continue

		yield {
			vtransactions: [buyTx, sellTx],
			blockhash,
		}
	}
}

let tip: number = config.get('default_tip_in_sol') * LAMPORTS_PER_SOL

const sendBundle = async (
	iterator: AsyncGenerator<{
		vtransactions: VersionedTransaction[]
		blockhash: string
	}>
) => {
	for await (const { vtransactions, blockhash } of iterator) {
		const tipAddress = await getJitoTipAccount()
		const tipAccount = new PublicKey(tipAddress)

		const bundle = new Bundle(vtransactions, 5)

		bundle.addTipTx(payer, tip, tipAccount, blockhash)

		const bundleId = await mainSearcherClient.sendBundle(bundle)
		logger.info(`Sending bundle ${bundleId}`)
	}
}

;(async () => {
	const INITIAL_CAPITAL = 0.07
	const { ata } = await setupWSOLTokenAccount(true, INITIAL_CAPITAL)

	if (!ata) {
		logger.error('No WSOL Account initialize')
		return
	}

	lookupTable = new BotLookupTable()
	botTokenAccount = new BotTokenAccount()
	existingMarkets = new ExistingRaydiumMarketStorage()

	onBundleResult()

	const mempoolUpdates = mempool([RAYDIUM_AUTHORITY_V4_ADDRESS])
	const processedTx = processTx(mempoolUpdates, ata)
	const bundle = buildSingleBlockTradeBundle(processedTx)
	await sendBundle(bundle)
})()
