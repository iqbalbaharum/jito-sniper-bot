import { publicKey, seq, struct, u128, u16, u64, u8, union } from "@raydium-io/raydium-sdk";
import { AccountsCoder, Idl } from "@coral-xyz/anchor";
import { IdlTypeDef } from "@coral-xyz/anchor/dist/cjs/idl";

export class RaydiumAmmAccountsCoder<A extends string = string>
  implements AccountsCoder
{
  constructor(_idl: Idl) {}

  public async encode<T = any>(accountName: A, account: T): Promise<Buffer> {
    switch (accountName) {
      case "targetOrders": {
    const buffer = Buffer.alloc(2208); 
    const len = TARGET_ORDERS_LAYOUT.encode(account, buffer);
    return buffer.slice(0, len);
}case "fees": {
    const buffer = Buffer.alloc(64); 
    const len = FEES_LAYOUT.encode(account, buffer);
    return buffer.slice(0, len);
}case "ammInfo": {
    const buffer = Buffer.alloc(752); 
    const len = AMM_INFO_LAYOUT.encode(account, buffer);
    return buffer.slice(0, len);
}
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  public decode<T = any>(accountName: A, ix: Buffer): T {
    return this.decodeUnchecked(accountName, ix);
  }

  public decodeUnchecked<T = any>(accountName: A, ix: Buffer): T {
    switch (accountName) {
      case "targetOrders": {
    return decodeTargetOrdersAccount(ix);
}case "fees": {
    return decodeFeesAccount(ix);
}case "ammInfo": {
    return decodeAmmInfoAccount(ix);
}
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  public memcmp(
    accountName: A,
    _appendData?: Buffer
  ): { dataSize?: number, offset?: number, bytes?: string } {
    switch (accountName) {
      case "targetOrders": {
    return {
        dataSize: 2208,
    };
    
}case "fees": {
    return {
        dataSize: 64,
    };
    
}case "ammInfo": {
    return {
        dataSize: 752,
    };
    
}
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  public size(idlAccount: IdlTypeDef): number {
    switch (idlAccount.name) {
      case "targetOrders": {
    return 2208 ;
}case "fees": {
    return 64 ;
}case "ammInfo": {
    return 752 ;
}
      default: {
        throw new Error(`Invalid account name: ${idlAccount.name}`);
      }
    }
  }
}

function decodeTargetOrdersAccount<T = any>(ix: Buffer): T {
    return TARGET_ORDERS_LAYOUT.decode(ix) as T;
}
function decodeFeesAccount<T = any>(ix: Buffer): T {
    return FEES_LAYOUT.decode(ix) as T;
}
function decodeAmmInfoAccount<T = any>(ix: Buffer): T {
    return AMM_INFO_LAYOUT.decode(ix) as T;
}


const TARGET_ORDERS_LAYOUT: any = struct([seq(u64(), 4, "owner"),seq(struct([u64("price"),u64("vol"),], ), 50, "buyOrders"),seq(u64(), 8, "padding1"),u128("targetX"),u128("targetY"),u128("planXBuy"),u128("planYBuy"),u128("planXSell"),u128("planYSell"),u128("placedX"),u128("placedY"),u128("calcPnlX"),u128("calcPnlY"),seq(struct([u64("price"),u64("vol"),], ), 50, "sellOrders"),seq(u64(), 6, "padding2"),seq(u64(), 10, "replaceBuyClientId"),seq(u64(), 10, "replaceSellClientId"),u64("lastOrderNumerator"),u64("lastOrderDenominator"),u64("planOrdersCur"),u64("placeOrdersCur"),u64("validBuyOrderNum"),u64("validSellOrderNum"),seq(u64(), 10, "padding3"),u128("freeSlotBits"),]);

const FEES_LAYOUT: any = struct([u64("minSeparateNumerator"),u64("minSeparateDenominator"),u64("tradeFeeNumerator"),u64("tradeFeeDenominator"),u64("pnlNumerator"),u64("pnlDenominator"),u64("swapFeeNumerator"),u64("swapFeeDenominator"),]);

const AMM_INFO_LAYOUT: any = struct([u64("status"),u64("nonce"),u64("orderNum"),u64("depth"),u64("coinDecimals"),u64("pcDecimals"),u64("state"),u64("resetFlag"),u64("minSize"),u64("volMaxCutRatio"),u64("amountWave"),u64("coinLotSize"),u64("pcLotSize"),u64("minPriceMultiplier"),u64("maxPriceMultiplier"),u64("sysDecimalValue"),struct([u64("minSeparateNumerator"),u64("minSeparateDenominator"),u64("tradeFeeNumerator"),u64("tradeFeeDenominator"),u64("pnlNumerator"),u64("pnlDenominator"),u64("swapFeeNumerator"),u64("swapFeeDenominator"),], "fees"),struct([u64("needTakePnlCoin"),u64("needTakePnlPc"),u64("totalPnlPc"),u64("totalPnlCoin"),u64("poolOpenTime"),u64("punishPcAmount"),u64("punishCoinAmount"),u64("orderbookToInitTime"),u128("swapCoinInAmount"),u128("swapPcOutAmount"),u64("swapTakePcFee"),u128("swapPcInAmount"),u128("swapCoinOutAmount"),u64("swapTakeCoinFee"),], "outPut"),publicKey("tokenCoin"),publicKey("tokenPc"),publicKey("coinMint"),publicKey("pcMint"),publicKey("lpMint"),publicKey("openOrders"),publicKey("market"),publicKey("serumDex"),publicKey("targetOrders"),publicKey("withdrawQueue"),publicKey("tokenTempLp"),publicKey("ammOwner"),u64("lpAmount"),u64("clientOrderId"),seq(u64(), 2, "padding"),]);
