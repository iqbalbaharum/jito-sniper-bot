import { TokenInstruction } from "@solana/spl-token";

export const UnpackRaydiumMessageToTokenInstruction = (data: Uint8Array) : TokenInstruction | undefined => {
	switch(data[0]) {
		case TokenInstruction.InitializeAccount2:
			return TokenInstruction.InitializeAccount2
	}
}

export const toBuffer = (arr: Buffer | Uint8Array | Array<number>): Buffer => {
	if (Buffer.isBuffer(arr)) {
	  return arr;
	} else if (arr instanceof Uint8Array) {
	  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
	} else {
	  return Buffer.from(arr);
	}
};