import { AddressLookupTableAccount, AddressLookupTableProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { LookupTableStorage } from "../storage";
import { LookupIndex, TxAddressLookupTable } from "../types";
import { connection } from "../adapter/rpc";
import { payer } from "../adapter/payer";
import { lookupTableStore } from "../adapter/storage";

export class BotLookupTable {

  static async getLookupTable(lutAddress: PublicKey) : Promise<AddressLookupTableAccount | undefined> {
    
    let lut = await lookupTableStore.get(lutAddress)
    if(lut) {
      return lut
    }

    const res = await connection.getAddressLookupTable(lutAddress, {
      commitment: 'confirmed'
    });

    if (!res || !res.value) {
      return undefined;
    }

    lookupTableStore.set(lutAddress, res.value);

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

  static async initializeRaydiumLookupTable(ata: PublicKey, blockhash: string) {
		const [lookupTableInst, lookupTableAddress] =
			AddressLookupTableProgram.createLookupTable({
				authority: payer.publicKey,
				payer: payer.publicKey,
				recentSlot: await connection.getSlot('finalized'),
			});
		
		const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable({
			payer: payer.publicKey,
			authority: payer.publicKey,
			lookupTable: lookupTableAddress,
			addresses: [
				new PublicKey("11111111111111111111111111111111"),
				new PublicKey("So11111111111111111111111111111111111111112"),
				new PublicKey("SysvarS1otHashes111111111111111111111111111"),
				new PublicKey("SysvarRent111111111111111111111111111111111"),
				new PublicKey("SysvarC1ock11111111111111111111111111111111"),
				new PublicKey("Sysvar1nstructions1111111111111111111111111"),
				new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), // Metaplex Token Address
				new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Token program
				new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), // Associated Token Account
				new PublicKey("Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g"), // Candy Guard
				new PublicKey("CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR"), // Candy Machine Core
				payer.publicKey, // payer account
				ata, // Associated Token account of payer
				new PublicKey("auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg"), // Metaplex Authorization Rules program
				new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"), // Raydium Program
				new PublicKey("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"), // Openbook V1
				new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"), // Raydium Authority
			  ],
		});

    console.log([
      lookupTableInst,
      addAddressesInstruction
    ])
		const messageV0 = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: [
        lookupTableInst,
				addAddressesInstruction
			],
		}).compileToV0Message()
		
		const transaction = new VersionedTransaction(messageV0)
		transaction.sign([payer])

		let signature = await connection.sendRawTransaction(transaction.serialize())
    return {signature, lookupTableAddress}
	}
}