import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import { LookupTableStorage } from "../storage";
import { LookupIndex, TxAddressLookupTable } from "../types";
import { connection } from "../adapter/rpc";

export class BotLookupTable {

  storage: LookupTableStorage

  constructor(client: any, useRedis: boolean) {
    this.storage = new LookupTableStorage(client, useRedis)
  }

  async getLookupTable(lutAddress: PublicKey) : Promise<AddressLookupTableAccount | undefined> {
    
    let lut = await this.storage.get(lutAddress)
    if(lut) {
      return lut
    }

    const res = await connection.fetchAddressLookupTable(lutAddress, {
      commitment: 'confirmed'
    });
    
    if (!res.value) {
      return undefined;
    }

    this.storage.set(lutAddress, res.value);

    return res.value;
  }

  static generateTableLookup(addressTableLookups: TxAddressLookupTable[]) : LookupIndex[] {
    return [
      ...addressTableLookups.flatMap((lookup: TxAddressLookupTable) => {
        return lookup.writableIndexes.map(index => ({
          lookupTableIndex: index,
          lookupTableKey: lookup.accountKey
        }))
      }),
      ...addressTableLookups.flatMap((lookup: TxAddressLookupTable) => {
        return lookup.readonlyIndexes.map(index => ({
          lookupTableIndex: index,
          lookupTableKey: lookup.accountKey
        }))
      }),
    ];
  }
}