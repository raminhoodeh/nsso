type RecoveryBudget = { finish: () => Promise<void> };

/** Only retry an explicit unavailable response before a response stream exists. */
export async function startChatWithRecovery<T>(options: {
  generate: () => Promise<T>;
  budget: RecoveryBudget;
  reserveRetry: () => Promise<void>;
  deadline: number;
  pause?: () => Promise<void>;
}) {
  try { return await options.generate(); }
  catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (status !== 503 || Date.now() > options.deadline - 50_000) throw error;
    // Keep the first attempt's conservative charge. The retry must acquire its own
    // reservation; a failed request never makes a second paid call for free.
    await options.budget.finish();
    await (options.pause ? options.pause() : new Promise(resolve => setTimeout(resolve, 1000 + Math.floor(Math.random() * 300))));
    await options.reserveRetry();
    // Deliberately outside the try block: a second failure is never retried.
    return options.generate();
  }
}
