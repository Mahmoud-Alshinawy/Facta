/** Includes stores still flushing during account changes, not only the current engine. */
export class QuitBarrier {
  private stores = new Set<{ flush(): Promise<void> }>();

  register(store: { flush(): Promise<void> }): () => void {
    this.stores.add(store);
    return () => {
      this.stores.delete(store);
    };
  }

  async flush(timeoutMs = 2000): Promise<"flushed" | "failed" | "timed-out"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.allSettled(
          [...this.stores].map((store) =>
            Promise.resolve().then(() => store.flush()),
          ),
        ).then((results) =>
          results.some((result) => result.status === "rejected")
            ? ("failed" as const)
            : ("flushed" as const),
        ),
        new Promise<"timed-out">((resolve) => {
          timer = setTimeout(() => resolve("timed-out"), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const plannerQuit = new QuitBarrier();
