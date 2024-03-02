import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import { LookupTableStorage } from "../storage";
import { GeyserAddressTableLookup, LookupIndex } from "../types";
import { connection } from "../adapter/rpc";

export class BotLookupTable {

  storage: LookupTableStorage

  constructor() {
    this.storage = new LookupTableStorage()
  }

  async getLookupTable(lutAddress: PublicKey) : Promise<AddressLookupTableAccount | undefined> {
    
    let lut = this.storage.get(lutAddress)
    if(lut) {
      return lut
    }

    const res = await connection.getAddressLookupTable(lutAddress);
    if (!res.value) {
      return undefined;
    }

    this.storage.set(lutAddress, res.value);

    return res.value;
  }

  static generateTableLookup(addressTableLookups: GeyserAddressTableLookup[]) : LookupIndex[] {
    return [
      ...addressTableLookups.flatMap((lookup: GeyserAddressTableLookup) => {
        const writeIndexes = Array.from(lookup.writableIndexes)
        return writeIndexes.map(index => ({
          lookupTableIndex: index,
          lookupTableKey: lookup.accountKey
        }))
      }),
      ...addressTableLookups.flatMap((lookup: GeyserAddressTableLookup) => {
        const readIndexes = Array.from(lookup.readonlyIndexes)
        return readIndexes.map(index => ({
          lookupTableIndex: index,
          lookupTableKey: lookup.accountKey
        }))
      }),
    ];
  }
}