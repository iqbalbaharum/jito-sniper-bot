import { AddressLookupTableAccount, AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class LookupTableStorage extends BaseStorage {
	lookupTables: Map<string, AddressLookupTableAccount>;
	addressesForLookupTable: Map<string, Set<string>>;
	lookupTablesForAddress: Map<string, Set<string>>

	// Redis client
    client: any
    useRedis: boolean

	constructor(client: any, useRedis: boolean) {
		super(StorageKeys.KEY_LOOKUPTABLE)

		this.lookupTables = new Map()
		this.addressesForLookupTable = new Map()
		this.lookupTablesForAddress = new Map()
		this.client = client
        this.useRedis = useRedis
	}

	public async get(lutAddress: PublicKey) : Promise<AddressLookupTableAccount | undefined> {
		if(this.useRedis) {
            let data = await this.client.hGet(`${lutAddress.toBase58()}`, this.key)
			if(data) {
				return this.deserialize(data)
			} else {
				return undefined
			}
        } else {
            this.lookupTables.get(lutAddress.toBase58());
        }

		return undefined
	}

	public set(
		lutAddress: PublicKey,
		lutAccount: AddressLookupTableAccount,
	) {

		if(this.useRedis) {
            this.client.hSet(`${lutAddress.toBase58()}`, this.key, this.serialize(lutAccount))
        } else {
            this.lookupTables.set(lutAddress.toBase58(), lutAccount);
        }

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

	private serialize(state: AddressLookupTableAccount) : string {
        let str = JSON.stringify(state, (key, value) => {
			if(key === 'deactivationSlot') {
				return value.toString()
			}
			return value
		})

		return str
    }

    private deserialize(lutString: string) : AddressLookupTableAccount | undefined {
        if(!lutString) { return }

		let d = JSON.parse(lutString)
		
		return new AddressLookupTableAccount({
			key: new PublicKey(d.key),
			state: {
				deactivationSlot: BigInt(d.state.deactivationSlot),
				lastExtendedSlot: d.state.lastExtendedSlot,
				lastExtendedSlotStartIndex: d.state.lastExtendedSlotStartIndex,
				authority: new PublicKey(d.state.authority),
				addresses: d.state.addresses.map((e:any) => new PublicKey(e))
			}
		})
    }
}