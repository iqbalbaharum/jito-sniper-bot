export class BlockHashStorage {
	block: string;

    constructor() {
        this.block = ''
    }

    set(block: string) {
        this.block = block
    }

    get() {
        this.block
    }
}