import { Commitment, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getJitoTipAccount } from "./jito";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { config } from "../utils/config";
import { mainSearcherClient } from "../adapter/jito";
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { logger } from "../utils/logger";
import { ArbIdea } from "../types";
import { BN } from "bn.js";
import { BundleInTransit } from "../types/bundleInTransit";

export class BotBundle {

  static async submitBundle(arb: ArbIdea) {
    const tipAddress = await getJitoTipAccount()
    const tipAccount = new PublicKey(tipAddress)
    
    const resp = await connection.getLatestBlockhash('confirmed');
  
    const bundle = new Bundle([arb.vtransaction], 5)
  
    const TIP_PERCENT_MIN = config.get('tip_percent_min')
    const TIP_PERCENT_MAX = config.get('tip_percent_max')
    const MAX_TIP_IN_SOL = config.get('max_tip_in_sol')
    const MIN_TIP_IN_SOL = config.get('min_tip_in_sol')
  
    let expectedTipLamport: number = MIN_TIP_IN_SOL * LAMPORTS_PER_SOL 
    let tipPercentage = TIP_PERCENT_MIN
  
    if(!arb.expectedProfit.isZero() && arb.expectedProfit.toNumber() > config.get('min_sol_trigger')) {
      if(arb.expectedProfit.gte(new BN(0.1 * LAMPORTS_PER_SOL))) {
        tipPercentage = TIP_PERCENT_MAX
      }
  
      expectedTipLamport = parseFloat(arb.expectedProfit.mul(new BN(tipPercentage)).div(new BN(100)).toString()) * LAMPORTS_PER_SOL
      // Because of buying initially from any market
      // it would spike the tips to maximum. To prevent excessive tipping
      // set maximum tips
      if(expectedTipLamport > MAX_TIP_IN_SOL) {
        expectedTipLamport = MAX_TIP_IN_SOL * LAMPORTS_PER_SOL
      }
  
      if(expectedTipLamport < MIN_TIP_IN_SOL) {
        expectedTipLamport = MIN_TIP_IN_SOL * LAMPORTS_PER_SOL
      }
    }
  
    // This parameter would override any other tip amount specified
    if(!arb.tipAmount.isZero()) {
      expectedTipLamport = parseFloat(arb.tipAmount.toString()) * LAMPORTS_PER_SOL
    }
  
    bundle.addTipTx(
        payer,
        expectedTipLamport,
        tipAccount,
        resp.blockhash
    )
    
    const bundleId = await mainSearcherClient.sendBundle(bundle)
    
    return bundleId
  }
}

const submitBundleDefaultTip = async (arbIdeas: ArbIdea[]) => {
  const tipAddress = await getJitoTipAccount()
  const tipAccount = new PublicKey(tipAddress)
  
  const resp = await connection.getLatestBlockhash('confirmed');

  const bundle = new Bundle(arbIdeas.map(idea => idea.vtransaction), 5)

  let tip: number = config.get('min_tip_in_sol') * LAMPORTS_PER_SOL

  bundle.addTipTx(
      payer,
      tip,
      tipAccount,
      resp.blockhash
  )
  
  const bundleId = await mainSearcherClient.sendBundle(bundle)
  logger.info(`Sending bundle ${bundleId}`)
  return bundleId
}

const onDefaultBundleResult = () => {
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
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

export { submitBundleDefaultTip, onDefaultBundleResult }