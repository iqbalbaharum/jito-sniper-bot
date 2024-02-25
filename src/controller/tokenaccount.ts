import Spl, { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, NATIVE_MINT, createSyncNativeInstruction } from '@solana/spl-token'
import { connection } from '../adapter/rpc';
import { Commitment, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { payer } from '../adapter/payer';
import { SPL_ACCOUNT_LAYOUT } from '@raydium-io/raydium-sdk';
import { config } from '../utils/config';

const getOrCreateTokenAccount = async (
    mint: PublicKey,
    create = false
  ) : Promise<{ ata: PublicKey, instructions: TransactionInstruction[], error: String }> => {
    let instructions: TransactionInstruction[] = [];
    let ata = await getAssociatedTokenAddress(
        mint,
        payer.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
  
      const ataInfo = await connection.getAccountInfo(ata);
  
      if (create && !ataInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            ata,
            payer.publicKey,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
  
      return {
        ata,
        instructions,
        error: '',
      };
  };

  const setupWSOLTokenAccount = async (check = true, amount: number) : Promise<{ ata: PublicKey }> => {
    let ata = await getAssociatedTokenAddress(
        NATIVE_MINT,
        payer.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
  
    if (check) {
      const ataInfo = await connection.getAccountInfo(ata);
  
      if (ataInfo === null) {
        let ataTx = new Transaction();
        ataTx.add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            ata,
            payer.publicKey,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        ataTx.feePayer = payer.publicKey;
    
        await sendAndConfirmTransaction(connection, ataTx, [payer]);
      }
    }

    let balance = await connection.getBalance(ata);
    if (balance < amount * LAMPORTS_PER_SOL) {
      let solTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: ata,
          lamports: (amount - balance / LAMPORTS_PER_SOL) * LAMPORTS_PER_SOL,
        }),
        createSyncNativeInstruction(ata)
      );
  
      await sendAndConfirmTransaction(connection, solTx, [payer]);
    }
  
    return { ata };
  };

  const getTokenAccountsByOwner = async () => {
    const tokenResp = await connection.getTokenAccountsByOwner(
      payer.publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      },
      config.get('default_commitment') as Commitment
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

  export { 
    getOrCreateTokenAccount,
    setupWSOLTokenAccount,
    getTokenAccountsByOwner 
  }