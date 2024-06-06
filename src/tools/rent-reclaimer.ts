import { ComputeBudgetProgram, Connection, ParsedAccountData, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { payer } from "../adapter/payer";
import { connection } from "../adapter/rpc";
import { SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { WSOL_ADDRESS } from "../utils";
import { createBurnCheckedInstruction, createCloseAccountInstruction } from "@solana/spl-token";

let nos = parseInt(process.env.npm_config_nos as string)

if (!nos) {
  nos = 20
}

async function getTokenAccountsByOwner() {
  const tokenResp = await connection.getTokenAccountsByOwner(
    payer.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    },
    'processed'
  );

  const accounts = [];

  for (const { pubkey, account } of tokenResp.value) {
    accounts.push({
      pubkey,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data),
    });
  }

  return accounts;
};

async function sendTx(instructions: TransactionInstruction[], blockhash: string) {

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
        ...instructions
      ]
    }).compileToV0Message([])
  
    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([payer])

    connection.sendRawTransaction(
      transaction.serialize()
    )
		.then(console.log)
		.catch(console.log);
  }

async function main() {

	const accs = await getTokenAccountsByOwner()

	let recentBlockhash = (await connection.getLatestBlockhash());

  console.log('Total tokens in wallet:', `${accs.length}`);
  if (accs.length <= 0) {
    console.log(`Nothing to close anymore`);
    return;
  }

	let instructions: TransactionInstruction[] = []

	for await (const acc of accs) {

    if (
      acc.accountInfo.amount.isZero() &&
      acc.accountInfo.mint.toString() !== WSOL_ADDRESS
    ) {
      

      if(instructions.length < nos) {
        console.log('Closing:', `${acc.pubkey}`);
        instructions.push(createCloseAccountInstruction(acc.pubkey, payer.publicKey, payer.publicKey))
      }
    }

    if (
      !acc.accountInfo.amount.isZero() &&
      acc.accountInfo.mint.toString() !== WSOL_ADDRESS
    ) {
      if(instructions.length < nos) {
        let mint = await connection.getParsedAccountInfo(acc.accountInfo.mint);
				const parsedData = mint?.value?.data as ParsedAccountData
        console.log('Burning & Closing:', `${acc.pubkey} | ${parsedData.parsed.info.decimals} | ${acc.accountInfo.amount}`);
        instructions.push(createBurnCheckedInstruction(
          acc.pubkey,
          acc.accountInfo.mint,
          payer.publicKey,
          acc.accountInfo.amount.toNumber(),
          parsedData.parsed.info.decimals
        ))
        instructions.push(createCloseAccountInstruction(acc.pubkey, payer.publicKey, payer.publicKey))
      }
    }
    
    if(instructions.length >= nos) {
			const recentBlockhash = await connection.getLatestBlockhash()
      sendTx(instructions, recentBlockhash.blockhash)
      instructions = [];
    }
  }
}

main()