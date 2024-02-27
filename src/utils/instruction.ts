import { TokenInstruction } from "@solana/spl-token";

export const UnpackRaydiumMessageToTokenInstruction = (data: Uint8Array) : TokenInstruction | undefined => {
	switch(data[0]) {
		case TokenInstruction.InitializeAccount2:
			return TokenInstruction.InitializeAccount2
	}
}