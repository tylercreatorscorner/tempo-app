/** A mounted view accepts results only from its newest request. */
export class LatestRequest {
  private controller: AbortController | null = null;

  cancel() {
    this.controller?.abort();
    this.controller = null;
  }

  async run<T>(
    load: (signal: AbortSignal) => Promise<T>,
    handlers: { success: (value: T) => void; error: (error: unknown) => void; settled: () => void },
  ): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const current = () => this.controller === controller && !controller.signal.aborted;
    try {
      const value = await load(controller.signal);
      if (current()) handlers.success(value);
    } catch (error) {
      if (current()) handlers.error(error);
    } finally {
      if (current()) handlers.settled();
    }
  }
}
