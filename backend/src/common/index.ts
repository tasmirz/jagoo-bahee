export const unsafe = <T>(fn: () => T, onError?: (e: unknown) => T): T => {
  try {
    return fn()
  } catch (e) {
    if (onError) return onError(e)
    throw e
  }
}

export const unsafeAsync = async <T>(fn: () => Promise<T>, onError?: (e: unknown) => T | Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (e) {
    if (onError) return await onError(e)
    throw e
  }
}
