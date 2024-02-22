import { Commitment, KeyedAccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection } from "./adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "./utils/const";
import { config } from "./utils/config";
import { getWSOLTokenAccount } from "./controller/tokenaccount";
import { getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet, swap } from "./controller";
import sleep from "atomic-sleep";
import { onBundleResult, submitBundle } from "./controller/bundle";
import { fastTrackSearcherClient } from "./adapter/jito";
import { BotLiquidityState } from "./types";
import { getTokenMintFromSignature } from "./controller/transaction";
import { logger } from "./utils/logger";

let trackedLiquidityPool: Set<string> = new Set<string>()
let removedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();
let tokenBalances: Map<string, BN> = new Map<string, BN>()

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

const listenToLPRemoved = () => {
  const subscriptionId = connection.onLogs(
    new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    async (logs, context) => {
      if (logs.err) {
        return;
      }

      let logSequence = [];

      for (const l of logs.logs) {
        // Remove LP
        if (l.includes('Transfer')) {
          logSequence.push('T');
        } else if (l.includes('Burn')) {
          logSequence.push('B');
        }
      }

      if (logSequence.join(',') === 'T,T,B') {
        const tokenMint = await getTokenMintFromSignature(logs.signature)
        if(tokenMint) {
          removedLiquidityPool.add(tokenMint)
        }
      }
    },
    config.get('default_commitment') as Commitment
  );
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish) => {
  const { transaction: inTx } = await swap(
    keys,
    'in',
    ata,
    amount
  );

  await submitBundle(inTx)
}

const sellToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish) => {
  const { transaction: inTx } = await swap(
    keys,
    'out',
    ata,
    amount
  );

  await submitBundle(inTx)
}

const runListener = async () => {
  const { ata } = await getWSOLTokenAccount(true)

  const subscriptionId = connection.onProgramAccountChange(
    new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    async (updatedAccountInfo: KeyedAccountInfo) => {
      let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
        updatedAccountInfo.accountInfo.data
      );
      
      // 
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

        const poolOpenTime = accountData.poolOpenTime.toNumber();
        if(new Date().getTime() / 1000 < poolOpenTime) {
          return
        }
        
        if(SOLIn.isZero()) {
          if(!trackedLiquidityPool.has(state.mint.toBase58())) {
            trackedLiquidityPool.add(state.mint.toBase58())
            const poolKeys = await getAccountPoolKeysFromAccountDataV4(
              updatedAccountInfo.accountId,
              accountData
            )
            
            logger.info(new Date(), `BUY ${state.mint.toBase58()}`)
            await buyToken(poolKeys, ata, config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL)
            
            trackedPoolKeys.set(state.mint.toBase58(), poolKeys)
            mints.set(state.mint.toBase58(), state)
          }
        } else {
          let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint
          if(removedLiquidityPool.has(tokenMint.toBase58())) {

            let botState = mints.get(tokenMint.toBase58())
            if(botState?.mint) {
              let solInDiff =
                parseFloat(SOLIn.sub(botState.lastWSOLInAmount).toString()) /
                parseFloat(SOLDenominator.toString());
              
              const key = trackedPoolKeys.get(tokenMint.toBase58())
              const balance = await getBalance(tokenMint, key!)
              if(solInDiff > config.get('min_sol_trigger')) {
                logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
                await sellToken(key as LiquidityPoolKeysV4, ata, balance.mul(new BN(10 ** state.mintDecimal))) 
              }

              botState.lastWSOLInAmount = new BN(SOLIn.toString());
              botState.lastWSOLOutAmount = new BN(SOLOut.toString());
              botState.lastTokenInAmount = new BN(tokenIn.toString());
              botState.lastTokenOutAmount = new BN(tokenOut.toString());
            }
          }
        }
      } catch(e: any) {
        // console.log(e.toString())
      }
    },
    config.get('default_commitment') as Commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_V1_ADDRESS,
        },
      }
    ]
  );

  console.log('Starting web socket, subscription ID: ', subscriptionId);
}


(async () => {
  runListener()
  listenToLPRemoved()
  onBundleResult()
})();