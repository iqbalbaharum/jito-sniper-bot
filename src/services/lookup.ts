import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import { connection } from "../adapter/rpc";
import { GeyserAddressTableLookup, LookupIndex } from "../types";

class LookupTableProvider {
	lookupTables: Map<string, AddressLookupTableAccount>;
	addressesForLookupTable: Map<string, Set<string>>;
	lookupTablesForAddress: Map<string, Set<string>>

	constructor() {
		this.lookupTables = new Map()
		this.addressesForLookupTable = new Map()
		this.lookupTablesForAddress = new Map()
	}

	async getLookupTable(lutAddress: PublicKey) : Promise<AddressLookupTableAccount | undefined> {
		const lutAddressStr = lutAddress.toBase58();
		if (this.lookupTables.has(lutAddressStr)) {
      return this.lookupTables.get(lutAddressStr);
    }

		const lut = await connection.getAddressLookupTable(lutAddress);
    if (!lut.value) {
      return undefined;
    }

		this.updateCache(lutAddress, lut.value);

    return lut.value;
	}

	private updateCache(
    lutAddress: PublicKey,
    lutAccount: AddressLookupTableAccount,
  ) {
    this.lookupTables.set(lutAddress.toBase58(), lutAccount);

    this.addressesForLookupTable.set(lutAddress.toBase58(), new Set());

    for (const address of lutAccount.state.addresses) {
      const addressStr = address.toBase58();
      this.addressesForLookupTable.get(lutAddress.toBase58())?.add(addressStr);
      if (!this.lookupTablesForAddress.has(addressStr)) {
        this.lookupTablesForAddress.set(addressStr, new Set());
      }

      this.lookupTablesForAddress.get(addressStr)?.add(lutAddress.toBase58());
    }
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

export { LookupTableProvider }