import { Commitment, KeyedAccountInfo, PublicKey } from "@solana/web3.js"
import { connection, connectionAlt1 } from "../adapter/rpc"
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config as SystemConfig } from "../utils"
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";
import { redisClient } from "../adapter/redis";
import { RaydiumStateBlock } from "../types";
import { BN } from "bn.js";
import { logger } from "../utils/logger";

async function processRaydiumState (account: KeyedAccountInfo) {

	const KEY = `marketstate:${account.accountId.toBase58()}`

	const d = LIQUIDITY_STATE_LAYOUT_V4.decode(account.accountInfo.data);
	const lastTimestamp = await redisClient.hGet(KEY, 'lastestTimestamp')

	let tokenOut = new BN(0);
	let tokenIn = new BN(0);
	let denominator = new BN(0);

	if(d.baseMint.toString() !== WSOL_ADDRESS && d.quoteMint.toString() !== WSOL_ADDRESS) { return }
	
	if (d.baseMint.toString() === WSOL_ADDRESS) {
		tokenOut = d.swapBaseOutAmount;
		tokenIn = d.swapBaseInAmount;
		denominator = new BN(10).pow(d.baseDecimal);
	} else {
		tokenOut = d.swapQuoteOutAmount;
		tokenIn = d.swapQuoteInAmount;
		denominator = new BN(10).pow(d.quoteDecimal);
	}
	
	const BLOCK_TIME = SystemConfig.get('block_time_range')

	if(lastTimestamp) {
		const block = await redisClient.hGetAll(KEY)

		// If current time is more than block time, then rewrite the state data
		// else only update the lastestTimestamp, latestWSOLIn, latestWSOLOut fields
		console.log(new Date().getTime(), parseInt(lastTimestamp), new Date().getTime() - parseInt(lastTimestamp), new Date().getTime() - parseInt(lastTimestamp) < BLOCK_TIME)
		if(new Date().getTime() - parseInt(lastTimestamp) < BLOCK_TIME) {
			storeInRedis({
				ammId: account.accountId.toBase58(),
				lastestTimestamp: new Date().getTime(),
				timeRangeInBlock: BLOCK_TIME,
				blockTimestamp: new Date().getTime(),
				firstWSOLInBlock: new BN(block.firstWSOLInBlock),
				firstWSOLOutBlock: new BN(block.firstWSOLOutBlock),
				latestWSOLIn: tokenIn,
				latestWSOLOut: tokenOut
			})

			if(account.accountId.toBase58() === '7ZMbMhCVGtGfGuDo5YnQBceKaHDxr93FQii8Q3zHNahd') {
				let diffTokenIn = tokenIn.sub(new BN(block.firstWSOLInBlock))
				let diffTokenOut = tokenOut.sub(new BN(block.firstWSOLOutBlock))
				console.log(diffTokenIn, diffTokenOut)
			}

		} else {
			storeInRedis({
				ammId: block.ammId,
				lastestTimestamp: new Date().getTime(),
				timeRangeInBlock: BLOCK_TIME,
				blockTimestamp: parseInt(block.blockTimestamp),
				firstWSOLInBlock: tokenIn,
				firstWSOLOutBlock: tokenOut,
				latestWSOLIn: tokenIn,
				latestWSOLOut: tokenOut
			})

			if(account.accountId.toBase58() === '7ZMbMhCVGtGfGuDo5YnQBceKaHDxr93FQii8Q3zHNahd') {
				console.log(`NEW BLOCK`)
			}
		}

	} else {
		// new data
		storeInRedis({
			ammId: account.accountId.toBase58(),
			lastestTimestamp: new Date().getTime(),
			timeRangeInBlock: BLOCK_TIME,
			blockTimestamp: new Date().getTime(),
			firstWSOLInBlock: tokenIn,
			firstWSOLOutBlock: tokenOut,
			latestWSOLIn: tokenIn,
			latestWSOLOut: tokenOut
		})
	}
}

function storeInRedis(data: RaydiumStateBlock) {
	let k = `marketstate:${data.ammId}`
	redisClient.hSet(k, 'ammId', data.ammId)
	redisClient.hSet(k, 'lastestTimestamp', data.lastestTimestamp)
	redisClient.hSet(k, 'timeRangeInBlock', data.timeRangeInBlock)
	redisClient.hSet(k, 'blockTimestamp', data.blockTimestamp)
	redisClient.hSet(k, 'firstWSOLInBlock', data.firstWSOLInBlock.toString())
	redisClient.hSet(k, 'firstWSOLOutBlock', data.firstWSOLOutBlock.toString())
	redisClient.hSet(k, 'latestWSOLIn', data.latestWSOLIn.toString())
	redisClient.hSet(k, 'latestWSOLOut', data.latestWSOLOut.toString())
}

function main() {
	connectionAlt1.onProgramAccountChange(
		new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
		processRaydiumState,
		SystemConfig.get('default_commitment') as Commitment
	)
	
	// connection.onProgramAccountChange(
	// 	new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
	// 	processRaydiumState,
	// 	SystemConfig.get('default_commitment') as Commitment
	// )
}

main()