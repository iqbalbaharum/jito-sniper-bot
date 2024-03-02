export type GeyserAddressTableLookup = {
    accountKey: Buffer,
    writableIndexes: Buffer,
    readonlyIndexes: Buffer
}

export type LookupIndex = {
    lookupTableIndex: number
    lookupTableKey: Buffer
}

export type GeyserInstruction = {
    programIdIndex: number,
    accounts: Uint8Array | Buffer
    data: Buffer
}

export type GeyserMessage = {
    accountKeys: Buffer[],
    instructions: GeyserInstruction[],
    addressTableLookups: GeyserAddressTableLookup[]
}