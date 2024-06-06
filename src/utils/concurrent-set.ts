export class ConcurrentSet<T> {
  private items: Map<T, number> = new Map(); // Map of items with timestamps
  private interval: number;
  private cleaning: boolean = false;

  constructor(interval: number) {
      this.interval = interval;
  } 

  async add(item: T): Promise<void> {
      this.items.set(item, Date.now());
      if (!this.cleaning) {
          this.cleaning = true;
          this.clearSetAfterInterval();
      }
  }

  private async clearSetAfterInterval(): Promise<void> {
      while (true) {
          await new Promise((resolve) => setTimeout(resolve, this.interval));

          const currentTime = Date.now();

          for (const [item, timestamp] of this.items.entries()) {
              if (currentTime - timestamp >= this.interval) {
                  this.items.delete(item);
              }
          }

          if (this.items.size === 0) {
              this.cleaning = false;
              break;
          }
      }
  }

  has(item: T): boolean {
      return this.items.has(item);
  }
}
