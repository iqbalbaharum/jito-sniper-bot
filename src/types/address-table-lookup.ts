export type GeyserAddressTableLookup = {
    accountKey: Buffer,
    writableIndexes: Buffer,
    readonlyIndexes: Buffer
}

export type LookupIndex = {
    lookupTableIndex: number
    lookupTableKey: Buffer
}