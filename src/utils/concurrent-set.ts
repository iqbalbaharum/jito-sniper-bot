export class ConcurrentSet<T> {
    private items: Map<T, number> = new Map(); // Map of items with timestamps
    private lock: Promise<void> | null = null;
    private interval: number

    constructor(interval: number) {
        this.interval = interval
    } 

    async add(item: T): Promise<void> {
      if (!this.lock) {
        this.lock = this.clearSetAfterInterval();
      }
  
      await this.lock;
      this.items.set(item, Date.now());
    }
  
    private async clearSetAfterInterval(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, this.interval));
  
      const currentTime = Date.now();
  
      for (const [item, timestamp] of this.items.entries()) {
        if (currentTime - timestamp >= this.interval) {
          this.items.delete(item);
        }
      }
  
      this.lock = null;
    }
  
    has(item: T): boolean {
      return this.items.has(item);
    }
  }