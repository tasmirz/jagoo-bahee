import { useEffect, useMemo } from 'react';
import { reportProvenanceIssue } from '../audit';
import {
  sealStateFor,
  verifyProvenance,
  type ProvenanceJson,
  type SealState,
} from './index';

/**
 * UI entry point for content verification. The cryptographic result is TTL-cached, while
 * failures are durably recorded and forwarded to configured independent audit services.
 */
export function useProvenanceSeal(
  value: ProvenanceJson | null | undefined,
): SealState {
  const state = useMemo(() => sealStateFor(value), [value]);
  useEffect(() => {
    if (!value || state !== 'failed') return;
    void reportProvenanceIssue(value, verifyProvenance(value));
  }, [state, value]);
  return state;
}
