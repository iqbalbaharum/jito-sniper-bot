import { GrpcGenerator } from "../generators/grpc";
import { BotLiquidity, BotLookupTable, setupWSOLTokenAccount } from "../library";
import { CopyTrades, ExistingRaydiumMarketStorage } from "../storage";
import { ArbIdea, LookupIndex, TxInstruction, TxPool } from "../types";
import { logger } from "../utils/logger";
import { config as SystemConfig } from "../utils/config";
import { payer } from "../adapter/payer";
import { fuseGenerators } from "../generators";
import { KeyedAccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeysV4, LiquidityStateV4 } from "@raydium-io/raydium-sdk";
import { submitBundle } from "../library/bundle";
import { BN } from "bn.js";
import { mainSearcherClient } from "../adapter/jito";
import { RaydiumLiquidityGenerator } from "../generators/state";
import { connection } from "../adapter/rpc";
import { SnipeList } from "../library/snipe-list";
import { redisClient } from "../adapter/redis";

let lookupTable: BotLookupTable
let existingMarkets: ExistingRaydiumMarketStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const onBundleResult = () => {
  mainSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      
      if (isAccepted) {
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`,
        );
      }

      if (isRejected) {
        logger.warn(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, blockhash?: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      {
        compute: {
          microLamports: 10000,
          units: 101337
        },
        blockhash,
        alts: []
      }
    );
    
    const arb: ArbIdea = {
      vtransaction: transaction,
      expectedProfit: new BN(0)
    }
    
    return await submitBundle(arb)
  } catch(e: any) {
    logger.error(e.toString())
    return ''
  }
}

const processBuy = async (ammId: PublicKey, ata: PublicKey, blockhash: string) => {

  const poolKeys = await BotLiquidity.getAccountPoolKeys(ammId)
	if(!poolKeys) { return }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${ammId.toBase58()} | ${info.mint.toBase58()}`)
  
  let signature = await buyToken(
    poolKeys, 
    ata,
    SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    blockhash
  )

  if(!signature) { return }
  
  logger.info(`Buy TX send: ${signature}`)
	existingMarkets.add(ammId)
  return signature
}

const processTx = async (accountInfo: KeyedAccountInfo, ata: PublicKey) => {
	try {
		let state = LIQUIDITY_STATE_LAYOUT_V4.decode(
			accountInfo.accountInfo.data
		);

		if(state.swapBaseInAmount.isZero()) {
			let shouldSnipe = false
			let mint

			if(state.baseMint.toBase58() === WSOL_ADDRESS) {
				mint = state.quoteMint
			} else {
				mint = state.baseMint
			}

			shouldSnipe = await SnipeList.isTokenListed(mint)

			if(shouldSnipe && !existingMarkets.isExisted(state.marketId)) {
				await processBuy(accountInfo.accountId, ata, '')
			}
		}

	} catch(e) {
		console.log(e)
	}
}

(async () => {
    try {
  
      const { ata } = await setupWSOLTokenAccount(true, 0.3)
      
      if(!ata) { 
        logger.error('No WSOL Account initialize')
        return 
      }
  
      lookupTable = new BotLookupTable(redisClient, true)
			existingMarkets = new ExistingRaydiumMarketStorage(redisClient, true)
  
      const generators: AsyncGenerator<any>[] = [];
  
      const liquidityState: RaydiumLiquidityGenerator = new RaydiumLiquidityGenerator(
        'raydium',
				connection,
				new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)
    	)
  
      try {
        generators.push(liquidityState.listen())
      } catch(e: any) {
        console.log(e.toString())
      }
  
      const updates = fuseGenerators(generators)
  
      if(SystemConfig.get('mode') === 'development') {
        onBundleResult()
      }
  
      for await (const update of updates) {
        if(update) {
          processTx(update, ata)
        }
      }
  
    } catch(e) {
      console.log(e)
    }
  })();