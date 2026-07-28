/**
 * The projected read model for posts.
 *
 * ── Projections are DERIVED, never authoritative ────────────────────────────────────
 * The envelope log is the only backup-critical dataset. Every field here must be
 * reconstructible from the log alone, byte-identically (P1-G3). If a projection carries
 * something the log cannot regenerate — a server-assigned ID, a wall-clock timestamp read
 * at projection time — that is a defect in this file, not a reason to back projections up.
 *
 * Which is why `contentId` is the primary key and `createdAtMs` comes from the signed
 * envelope rather than from the clock.
 */

export interface PostDoc {
  /** jb1… — content-addressed, stable on every node forever (VIS-03). */
  readonly contentId: string;
  /** Raw author public key, hex. Identity IS the key (VIS-02). */
  readonly authorKey: string;
  /** `<name>@<origin_fingerprint>` — never a row ID (ID-01). */
  readonly community: string;
  readonly title: string;
  readonly kind: number;
  readonly bodyMarkdown: string;
  readonly url: string;
  readonly attachments: readonly string[];
  readonly flair: string;
  /** From the SIGNED envelope, not from the projector's clock. */
  readonly createdAtMs: number;
  readonly editedAtMs: number | null;
  /**
   * Tombstone. Removal never deletes the row: content ID, author, timestamp, acting
   * moderator and reason stay publicly visible and only the body is withheld. Every
   * censorship action is itself evidence.
   */
  readonly removed: boolean;
  readonly removedReason: string | null;
  readonly score: number;
  readonly commentCount: number;
}

export const POSTS_COLLECTION = 'forum_posts';
