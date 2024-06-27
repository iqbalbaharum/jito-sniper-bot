import * as BufferLayout from '@solana/buffer-layout';
import * as Layout from '../layout'
import { u64 } from '../bigint';
import { decodeData } from '../account-data';
import { AddressLookupTableState, PublicKey } from '@solana/web3.js';

const LookupTableMetaLayout = {
	index: 1,
	layout: BufferLayout.struct<{
		typeIndex: number;
		deactivationSlot: bigint;
		lastExtendedSlot: number;
		lastExtendedStartIndex: number;
		authority: Array<Uint8Array>;
	}>([
		BufferLayout.u32('typeIndex'),
		u64('deactivationSlot'),
		BufferLayout.nu64('lastExtendedSlot'),
		BufferLayout.u8('lastExtendedStartIndex'),
		BufferLayout.u8(), // option
		BufferLayout.seq(
			Layout.publicKey(),
			BufferLayout.offset(BufferLayout.u8(), -1),
			'authority',
		),
	]),
};

const LOOKUP_TABLE_META_SIZE = 56;

export function getLookupTableAddress(accountData: Uint8Array): PublicKey[] {
	const meta = decodeData(LookupTableMetaLayout, accountData);

	const serializedAddressesLen = accountData.length - LOOKUP_TABLE_META_SIZE;

	const numSerializedAddresses = serializedAddressesLen / 32;
	const {addresses} = BufferLayout.struct<{addresses: Array<Uint8Array>}>([
		BufferLayout.seq(Layout.publicKey(), numSerializedAddresses, 'addresses'),
	]).decode(accountData.slice(LOOKUP_TABLE_META_SIZE));

	return addresses.map(address => new PublicKey(address));
}