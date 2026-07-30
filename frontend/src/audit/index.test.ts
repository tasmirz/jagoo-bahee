import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  configureAuditIssueReporting,
  reportProvenanceIssue,
} from './index';
import type { ProvenanceJson } from '../verify';

const evidence: ProvenanceJson = {
  contentId: 'jb1failed-proof',
  authorKey: 'jbk1failed-key',
  keyAlg: 'ED25519',
  signature: 'AAAA',
  canonicalBytes: 'AAAA',
  receipt: null,
};

describe('audit issue reporting', () => {
  beforeEach(async () => {
    configureAuditIssueReporting([]);
    await AsyncStorage.clear();
  });

  it('durably deduplicates a failed verification before forwarding', async () => {
    const verification = {
      contentId: false,
      authorSignature: false,
      publicationReceipt: false,
      verified: false,
    };
    const first = await reportProvenanceIssue(evidence, verification);
    const second = await reportProvenanceIssue(evidence, verification);
    const keys = await AsyncStorage.getAllKeys();

    expect(first?.report.issues).toEqual([
      'CONTENT_IDENTIFIER',
      'AUTHOR_SIGNATURE',
      'PUBLICATION_RECEIPT',
    ]);
    expect(second?.report.reportId).toBe(first?.report.reportId);
    expect(keys.filter((key) => key.startsWith('jb.audit-issue.v1:'))).toHaveLength(1);
  });

  it('does not report verified content', async () => {
    await expect(
      reportProvenanceIssue(evidence, {
        contentId: true,
        authorSignature: true,
        publicationReceipt: true,
        verified: true,
      }),
    ).resolves.toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
