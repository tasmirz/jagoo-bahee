/**
 * Content service ports.
 *
 * All three are OPTIONAL subsystems. AR-12 requires the node to run with every one of them
 * disabled, so each binds to a null implementation by default and nothing downstream
 * learns which binding it got (ADR-002).
 */

export interface DraftContent {
  readonly text: string;
  readonly scope: string;
}

export interface LabelAdvice {
  readonly advisory: string | null;
}

export interface Label {
  readonly contentId: string;
  readonly kind: string;
  /**
   * Labels are ADDITIVE SIGNED OPINIONS that clients may honour — never a gate on
   * publishing. Server-side approval before publishing is structurally censorship:
   * withheld approval is indistinguishable from a network error.
   */
  readonly signature: Uint8Array;
}

export interface ResolvedContent {
  readonly contentId: string;
  readonly text: string;
}

export abstract class LabelProvider {
  abstract preflight(draft: DraftContent): Promise<LabelAdvice>;
  abstract label(contentId: string, content: ResolvedContent): Promise<Label>;
}

export interface UploadTicket {
  readonly url: string;
  readonly key: string;
  readonly expiresAtMs: number;
}

export abstract class BlobStore {
  abstract presignUpload(key: string, mime: string, size: number): Promise<UploadTicket>;
  abstract presignDownload(key: string): Promise<string>;
}

export interface Notification {
  readonly kind: string;
  readonly contentId: string;
}

export abstract class NotificationSink {
  abstract deliver(to: Uint8Array, notification: Notification): Promise<void>;
}
