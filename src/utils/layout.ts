import * as BufferLayout from '@solana/buffer-layout';

export const publicKey = (property: string = 'publicKey') => {
    return BufferLayout.blob(32, property);
};