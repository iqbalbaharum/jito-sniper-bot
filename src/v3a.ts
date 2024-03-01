import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "./services/tokenaccount";
import { BotLiquidity, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "./services";
import sleep from "atomic-sleep";
import { submitBundle } from "./services/bundle";
import { fastTrackSearcherClient } from "./adapter/jito";
import { ArbIdea, BotLiquidityState, LookupIndex } from "./types";
import { BotTransaction, getAmmIdFromSignature } from "./services/transaction";
import { logger } from "./utils/logger";
import { RaydiumAmmCoder } from "./utils/coder";
import raydiumIDL from './idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BotError } from "./types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { IxSwapBaseIn } from "./utils/coder/layout";
import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { BotgRPC } from "./services/grpc";
import { LookupTableProvider } from "./services";

type V3BundleInTransit = {
  timestamp: number,
  poolKeys: LiquidityPoolKeysV4
  state: BotLiquidityState
}

let trackedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();
let tokenBalances: Map<string, BN> = new Map<string, BN>()
let bundleInTransit: Map<string, V3BundleInTransit> = new Map<string, V3BundleInTransit>()
let botgRPC: BotgRPC
let lookupTable: LookupTableProvider

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const getBalance = async (mint: PublicKey, poolKeys: LiquidityPoolKeysV4): Promise<BN> => {
  let balance = tokenBalances.get(mint.toBase58())
  if(!balance) {
    const taBalance = await getTokenInWallet(poolKeys)
    if(taBalance && taBalance.length > 0) {
      if(taBalance[0].balance > 0) {
        balance = new BN(taBalance[0].balance)
        tokenBalances.set(mint.toBase58(), balance)
      }
    }

    sleep(1000)
  }

  return balance!
}

const onBundleResult = () => {
  fastTrackSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      if (isAccepted) {
        if(bundleInTransit.has(bundleId)) {
          const bundle = bundleInTransit.get(bundleId)
          if(!bundle) { return }
          logger.info(`Listening for token ${bundle!.state.mint.toBase58()} activities`)
          // trackedLiquidityPool.add(bundle!.state.ammId.toBase58())
          // trackedPoolKeys.set(bundle!.state.ammId.toBase58(), bundle!.poolKeys)
          // mints.set(bundle!.state.mint.toBase58(), bundle!.state)

          // to make the request faster, initialize token balance after purchase confirm
          getBalance(bundle.state.mint, bundle.poolKeys)
        }
      }

      if (isRejected) {
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const processBuy = async (ammId: PublicKey, ata: PublicKey) => {
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)

  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)
  const block = await connection.getLatestBlockhash({
    commitment: 'confirmed'
  })

  if(!poolKeys) { return }
  
  let bundleId = await buyToken(
    poolKeys, 
    ata,
    config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    new BN(0 * LAMPORTS_PER_SOL),
    block.blockhash
  )

  trackedLiquidityPool.add(ammId.toBase58())
  trackedPoolKeys.set(ammId.toBase58(), poolKeys)
  mints.set(info.mint.toBase58(), {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  bundleInTransit.set(bundleId, {
    timestamp: new Date().getTime(),
    poolKeys,
    state: {
      ammId,
      mint: info.mint,
      mintDecimal: info.decimal,
      isMintBase: info.isMintBase
    }
  })
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string): Promise<string> => {
  const transaction = await BotLiquidity.makeSimpleSwapInstruction(
    keys,
    'in',
    ata,
    amount,
    blockhash,
    {
      compute: {
        microLamports: 100000,
        units: 101337
      }
    }
  );
  
  let expected = new BN(0)
  if(!expectedProfit.isZero()) {
    expected = expectedProfit
  }

  const arb: ArbIdea = {
    vtransaction: transaction,
    expectedProfit: expected
  }

  return await submitBundle(arb)
}

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN, expectedProfit: BN, blockhash: string) => {
  const transaction = await BotLiquidity.makeSimpleSwapInstruction(
    keys,
    'out',
    ata,
    amount.div(new BN(2)),
    blockhash,
    {
      compute: {
        microLamports: 1000000,
        units: 101337
      }
    }
  );
  
  let expected = new BN(0)
  if(!expectedProfit.isZero()) {
    expected = expectedProfit
  }

  const arb: ArbIdea = {
    vtransaction: transaction,
    expectedProfit: expected
  }

  return await submitBundle(arb)
}

const execution = async (accountData: LiquidityStateV4, accountId: PublicKey, ata: PublicKey) => {
  try {
    let state = await getLiquidityMintState(accountData)
    let SOLIn: BN
    let SOLOut: BN
    let tokenIn: BN
    let tokenOut: BN
    let SOLDenominator: BN
    let tokenDenominator: BN

    if(!state.isMintBase) {
      SOLIn = accountData.swapBaseInAmount
      SOLOut = accountData.swapBaseOutAmount
      tokenIn = accountData.swapQuoteInAmount
      tokenOut = accountData.swapQuoteOutAmount
      SOLDenominator = new BN(10).pow(accountData.baseDecimal);
      tokenDenominator = new BN(10).pow(accountData.quoteDecimal);
    } else {
      SOLIn = accountData.swapQuoteInAmount
      SOLOut = accountData.swapQuoteOutAmount
      tokenIn = accountData.swapBaseInAmount
      tokenOut = accountData.swapBaseOutAmount
      SOLDenominator = new BN(10).pow(accountData.quoteDecimal);
      tokenDenominator = new BN(10).pow(accountData.baseDecimal);
    }
    
    let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint
    if(trackedLiquidityPool.has(state.ammId.toBase58())) {
      let botState = mints.get(tokenMint.toBase58())
      if(botState && botState?.mint) {
        let solInDiff =
          parseFloat(SOLIn.sub(botState.lastWSOLInAmount!).toString()) /
          parseFloat(SOLDenominator.toString());
        
        const key = trackedPoolKeys.get(tokenMint.toBase58())
        const balance = await getBalance(tokenMint, key!)
        logger.info(`Test: ${solInDiff}`)
        if(
            !botState.lastWSOLInAmount!.isZero() && 
            !SOLIn.sub(botState.lastWSOLInAmount!).isZero() && 
            solInDiff > config.get('min_sol_trigger')
          ) {
          logger.info(`Someone purchase ${state.mint.toBase58()} with ${solInDiff} | min: ${config.get('min_sol_trigger')}`)
          logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
          // await sellToken(key as LiquidityPoolKeysV4, ata, balance.mul(new BN(10 ** state.mintDecimal)), new BN(solInDiff * LAMPORTS_PER_SOL))
        }

        botState.lastWSOLInAmount = new BN(SOLIn.toString());
        botState.lastWSOLOutAmount = new BN(SOLOut.toString());
        botState.lastTokenInAmount = new BN(tokenIn.toString());
        botState.lastTokenOutAmount = new BN(tokenOut.toString());
      }
    }
  } catch(e: any) {
    // console.log(e.toString())
  }
}

/**
 * 
 * @param ata 
 */
const runGeyserListener = async (ata: PublicKey) => {
  botgRPC.listen(
    (d) => { // account
    },
    async (d) => { // transaction
      const message = d.transaction.transaction.message
      const raydiumAddressBuffer = bs58.decode(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)
      for(const ins of message.instructions) {
        const programId = message.accountKeys[ins.programIdIndex]
        if(raydiumAddressBuffer.equals(programId)) {
          let ammId: PublicKey | undefined
          const decodedIx = coder.instruction.decode(Buffer.from(ins.data))

          if(decodedIx.hasOwnProperty('withdraw')) { // remove liquidity
            const accountIndexes: number[] = Array.from(ins.accounts)
            const lookupsForAccountKeyIndex: LookupIndex[] = LookupTableProvider.generateTableLookup(message.addressTableLookups)
            
            // What we care about is only ammId from the Raydium instruction
            // For LP withdrawal instruction, the location of "ammId" is at position #1
            const accountIndex = accountIndexes[1]
            if(accountIndex >= message.accountKeys.length) {
              const lookupIndex = accountIndex - message.accountKeys.length
              const lookup = lookupsForAccountKeyIndex[lookupIndex]
              const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
              ammId = table?.state.addresses[lookup?.lookupTableIndex]
            } else {
              ammId = new PublicKey(message.accountKeys[accountIndex])
            }

            if(!ammId) { return }
            logger.info(`ammId: ${ammId.toBase58()}`)
            // processBuy(ammId, ata)
          } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
            // Find the transaction is buy or sell?
          }
        }
      }
    })
}

const process = async (ata: PublicKey, ammId: PublicKey, signature: string) => {
  try {
    const poolKeys = await BotTransaction.generatePoolKeysFromSignature(signature)
    if(!poolKeys) { return }

    const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)

    // Cancel process if pair is not WSOL
    if(info.mint === undefined) { return }

    logger.info(new Date(), `BUY ${info.mint.toBase58()}`)
    const block = await connection.getLatestBlockhash({
      commitment: 'confirmed'
    })

    let bundleId = await buyToken(
      poolKeys, 
      ata,
      config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
      new BN(0 * LAMPORTS_PER_SOL),
      block.blockhash
    )

    trackedLiquidityPool.add(ammId.toBase58())
    trackedPoolKeys.set(ammId.toBase58(), poolKeys)
    mints.set(info.mint.toBase58(), {
      ammId,
      mint: info.mint,
      mintDecimal: info.decimal,
      isMintBase: info.isMintBase
    })

    bundleInTransit.set(bundleId, {
      timestamp: new Date().getTime(),
      poolKeys,
      state: {
        ammId,
        mint: info.mint,
        mintDecimal: info.decimal,
        isMintBase: info.isMintBase
      }
    })
  } catch(e: any) {
    console.log(e)
  }
}


(async () => {
  const { ata } = await setupWSOLTokenAccount(true, 0.01)
  
  if(!ata) { 
    logger.error('No WSOL Account initialize')
    return 
  }

  botgRPC = new BotgRPC()
  lookupTable = new LookupTableProvider()

  // Only read from Raydium pool for now
  // Exclude: 
  //  - Jupiter, Raydium AMM Routing
  botgRPC.addTransaction('raydium_tx', {
    vote: false,
    failed: false,
    accountInclude: [RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS],
    accountExclude: [JUPITER_ADDRESS, 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS'],
    accountRequired: [],
  })

  runGeyserListener(ata)
  onBundleResult()
})();