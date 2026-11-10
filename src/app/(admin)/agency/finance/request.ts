/** Bound reads and writes so a dropped connection cannot leave finance controls locked. */
export async function requestFinance(url: string, body?: object | FormData, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(45_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await fetch(url, {
      cache: 'no-store', signal: requestSignal,
      ...(body ? { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) } : {}),
    });
    const json = await response.json().catch(() => null);
    requestSignal.throwIfAborted();
    if (!response.ok) throw new Error(json?.error || 'The request could not be completed. Your inputs are preserved.');
    if (!json || typeof json !== 'object') throw new Error('The response could not be verified. Reload before retrying.');
    return json;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (deadline.aborted) throw new Error(body ? 'The request timed out. Your inputs are preserved. Reload to check whether the change was saved before retrying.' : 'Finance took too long to load. Please retry.');
    throw error;
  }
}
