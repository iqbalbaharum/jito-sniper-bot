import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import { BotgRPC } from "../library/grpc"
import { BotTransaction } from "../library/transaction"
import { LookupIndex, TokenTick, TxInstruction, TxPool } from "../types"
import { RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config as SystemConfig, WSOL_ADDRESS } from "../utils"
import { logger } from "../utils/logger"
import { RaydiumAmmCoder } from "../utils/coder"
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor"
import { mints, tickStorage } from "../adapter/storage"
import { BotLiquidity, BotLookupTable } from "../library"
import { BN } from "bn.js"
import { geysers } from "../adapter/geysers"

let env = geysers[0]

const GRPC_URL = env.url
const GRPC_TOKEN = env.token

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

async function processSwapBaseIn(txPool: TxPool, instruction: TxInstruction) {
  const tx = txPool.mempoolTxns

	const accountIndexes: number[] = Array.from(instruction.accounts)
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
	
	let ammId: PublicKey | undefined

  // ammId
  const ammIdAccountIndex = accountIndexes[1]
  if(ammIdAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = ammIdAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[ammIdAccountIndex])
  }

  if(!ammId) { return }

	const poolKeys = await BotLiquidity.getAccountPoolKeys(ammId)
  if(!poolKeys) { return }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

	let txAmount = BotTransaction.getTokenBalanceFromWSOLTransaction(tx.preTokenBalances, tx.postTokenBalances)
  let txSolAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, new PublicKey(WSOL_ADDRESS))

	let price = parseFloat(txSolAmount.abs().toString()) / LAMPORTS_PER_SOL
	let noOfToken = parseFloat(txAmount.abs().toString()) / (10 ** info.decimal)

  tickStorage.set(ammId, {
		price: price / noOfToken,
		timestamp: new Date().getTime()
	})
}

async function run(tx: TxPool) {
	for(const ins of tx.mempoolTxns.instructions) {
		const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
		if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
			try {
				let dataBuffer = Buffer.from(ins.data)
				const decodedIx = coder.instruction.decode(dataBuffer)
				
				if(decodedIx.hasOwnProperty('swapBaseIn')) {
						await processSwapBaseIn(tx, ins)
				}
			} catch(e:any) {
				console.log(tx.mempoolTxns.signature, e)
			}
		}
	}
}

async function main() {

	let botGrpc = new BotgRPC(GRPC_URL, GRPC_TOKEN)
	botGrpc.addTransaction('price_tick', {
		vote: false,
		failed: false,
		accountInclude: [
			RAYDIUM_AUTHORITY_V4_ADDRESS
		],
		accountExclude: [],
		accountRequired: [],
	})

	botGrpc.listen(
		() => {},
		run,
		() => {}
	)
}



main()