import { Idl, InstructionCoder } from "@coral-xyz/anchor";
import { option, publicKey, struct, u16, u64, u8, union } from "@raydium-io/raydium-sdk";
import { IX_INITIALIZE2_LAYOUT, IX_SWAP_BASE_IN_LAYOUT, IX_SWAP_BASE_OUT_LAYOUT } from "./layout";

export class RaydiumAmmInstructionCoder implements InstructionCoder {
  constructor(_idl: Idl) {}

  encode(ixName: string, ix: any): Buffer {
    switch (ixName) {
      case "initialize": {return encodeInitialize(ix);}
			case "initialize2": {return encodeInitialize2(ix);}
			case "monitorStep": {return encodeMonitorStep(ix);}
			case "deposit": {return encodeDeposit(ix);}
			case "withdraw": {return encodeWithdraw(ix);}
			case "migrateToOpenBook": {return encodeMigrateToOpenBook(ix);}
			case "setParams": {return encodeSetParams(ix);}
			case "withdrawPnl": {return encodeWithdrawPnl(ix);}
			case "withdrawSrm": {return encodeWithdrawSrm(ix);}
			case "swapBaseIn": {return encodeSwapBaseIn(ix);}
			case "preInitialize": {return encodePreInitialize(ix);}
			case "swapBaseOut": {return encodeSwapBaseOut(ix);}
			case "simulateInfo": {return encodeSimulateInfo(ix);}
			case "adminCancelOrders": {return encodeAdminCancelOrders(ix);}
			case "createConfigAccount": {return encodeCreateConfigAccount(ix);}
			case "updateConfigAccount": {return encodeUpdateConfigAccount(ix);}

      default: {
        throw new Error(`Invalid instruction: ${ixName}`);
      }
    }
  }

  public decode(ix: Buffer): Object {
    return decodeData(ix)
  }

  encodeState(_ixName: string, _ix: any): Buffer {
    throw new Error("RaydiumAmm does not have state");
  }
}

function encodeInitialize({nonce,openTime,}: any): Buffer {return encodeData({initialize: {nonce,openTime,}}, 1+ 1+ 8);}

function encodeInitialize2({nonce,openTime,initPcAmount,initCoinAmount,}: any): Buffer {return encodeData({initialize2: {nonce,openTime,initPcAmount,initCoinAmount,}}, 1+ 1+ 8+ 8+ 8);}

function encodeMonitorStep({planOrderLimit,placeOrderLimit,cancelOrderLimit,}: any): Buffer {return encodeData({monitorStep: {planOrderLimit,placeOrderLimit,cancelOrderLimit,}}, 1+ 2+ 2+ 2);}

function encodeDeposit({maxCoinAmount,maxPcAmount,baseSide,}: any): Buffer {return encodeData({deposit: {maxCoinAmount,maxPcAmount,baseSide,}}, 1+ 8+ 8+ 8);}

function encodeWithdraw({amount,}: any): Buffer {return encodeData({withdraw: {amount,}}, 1+ 8);}

function encodeMigrateToOpenBook({}: any): Buffer {return encodeData({migrateToOpenBook: {}}, 1);}

function encodeSetParams({param,value,newPubkey,fees,lastOrderDistance,needTakeAmounts,}: any): Buffer {return encodeData({setParams: {param,value,newPubkey,fees,lastOrderDistance,needTakeAmounts,}}, 1+ 1+1 + (value === null ? 0 : 8)+1 + (newPubkey === null ? 0 : 32)+1 + (fees === null ? 0 : 64)+1 + (lastOrderDistance === null ? 0 : 16)+1 + (needTakeAmounts === null ? 0 : 16));}

function encodeWithdrawPnl({}: any): Buffer {return encodeData({withdrawPnl: {}}, 1);}

function encodeWithdrawSrm({amount,}: any): Buffer {return encodeData({withdrawSrm: {amount,}}, 1+ 8);}

function encodeSwapBaseIn({amountIn,minimumAmountOut,}: any): Buffer {return encodeData({swapBaseIn: {amountIn,minimumAmountOut,}}, 1+ 8+ 8);}

function encodePreInitialize({nonce,}: any): Buffer {return encodeData({preInitialize: {nonce,}}, 1+ 1);}

function encodeSwapBaseOut({maxAmountIn,amountOut,}: any): Buffer {return encodeData({swapBaseOut: {maxAmountIn,amountOut,}}, 1+ 8+ 8);}

function encodeSimulateInfo({param,swapBaseInValue,swapBaseOutValue,}: any): Buffer {return encodeData({simulateInfo: {param,swapBaseInValue,swapBaseOutValue,}}, 1+ 1+1 + (swapBaseInValue === null ? 0 : 16)+1 + (swapBaseOutValue === null ? 0 : 16));}

function encodeAdminCancelOrders({limit,}: any): Buffer {return encodeData({adminCancelOrders: {limit,}}, 1+ 2);}

function encodeCreateConfigAccount({}: any): Buffer {return encodeData({createConfigAccount: {}}, 1);}

function encodeUpdateConfigAccount({param,owner,}: any): Buffer {return encodeData({updateConfigAccount: {param,owner,}}, 1+ 1+ 32);}



const LAYOUT = union(u8("instruction"));
LAYOUT.addVariant(0, struct([u8("nonce"),u64("openTime"),]), "initialize");
LAYOUT.addVariant(1, IX_INITIALIZE2_LAYOUT, "initialize2");

LAYOUT.addVariant(2, struct([u16("planOrderLimit"),u16("placeOrderLimit"),u16("cancelOrderLimit"),]), "monitorStep");
LAYOUT.addVariant(3, struct([u64("maxCoinAmount"),u64("maxPcAmount"),u64("baseSide"),]), "deposit");
LAYOUT.addVariant(4, struct([u64("amount"),]), "withdraw");
LAYOUT.addVariant(5, struct([]), "migrateToOpenBook");
LAYOUT.addVariant(6, struct([u8("param"),option(u64(), "value"),option(publicKey(), "newPubkey"),option(struct([u64("minSeparateNumerator"),u64("minSeparateDenominator"),u64("tradeFeeNumerator"),u64("tradeFeeDenominator"),u64("pnlNumerator"),u64("pnlDenominator"),u64("swapFeeNumerator"),u64("swapFeeDenominator"),], ), "fees"),option(struct([u64("lastOrderNumerator"),u64("lastOrderDenominator"),], ), "lastOrderDistance"),option(struct([u64("needTakePc"),u64("needTakeCoin"),], ), "needTakeAmounts"),]), "setParams");
LAYOUT.addVariant(7, struct([]), "withdrawPnl");
LAYOUT.addVariant(8, struct([u64("amount"),]), "withdrawSrm");
LAYOUT.addVariant(9, IX_SWAP_BASE_IN_LAYOUT, "swapBaseIn");
LAYOUT.addVariant(10, struct([u8("nonce"),]), "preInitialize");
LAYOUT.addVariant(11, IX_SWAP_BASE_OUT_LAYOUT, "swapBaseOut");
LAYOUT.addVariant(12, struct([u8("param"),option(struct([u64("amountIn"),u64("minimumAmountOut"),], ), "swapBaseInValue"),option(struct([u64("maxAmountIn"),u64("amountOut"),], ), "swapBaseOutValue"),]), "simulateInfo");LAYOUT.addVariant(13, struct([u16("limit"),]), "adminCancelOrders");
LAYOUT.addVariant(14, struct([]), "createConfigAccount");
LAYOUT.addVariant(15, struct([u8("param"),publicKey("owner"),]), "updateConfigAccount");


function encodeData(ix: any, span: number): Buffer {
  const b = Buffer.alloc(span);
  LAYOUT.encode(ix, b);
  return b;
}

function decodeData(b: Buffer): Object {
  return LAYOUT.decode(b);
}
