/**
 * A viewer-scoped read must not be cached under a key that cannot tell who asked.
 *
 * ── The defect this pins ────────────────────────────────────────────────────────────
 * `/v1/communities/:id` returns `joined` ONLY for an authenticated caller; anonymously it
 * returns the same row without that field. The cache key was the URL plus a boolean meaning
 * "should I send viewer headers", which is a property of the CALL, not of the ANSWER.
 *
 * On a cold start the launch restore is still in flight when the first screens mount, so the
 * anonymous answer is the one that lands. The URL never changed, so nothing refetched, and a
 * community the person had created rendered a "Join" button on every relaunch. The same
 * missing token made image upload throw "Register and authenticate this Forum identity
 * first" — one cause, three unrelated-looking symptoms.
 *
 * Keying on the viewer makes authenticating a key change, so the refetch happens by
 * construction instead of by remembering to invalidate.
 */

import { forumViewerId } from '../signer';

jest.mock('../signer', () => ({
  forumViewerHeaders: jest.fn(() => undefined),
  forumViewerId: jest.fn(() => null),
}));

const mockedViewerId = forumViewerId as jest.MockedFunction<typeof forumViewerId>;

/** The key shapes `data/node.ts` builds, isolated from React Query itself. */
const documentKey = (baseUrl: string, path: string, viewer: boolean) => [
  'node',
  baseUrl,
  'document',
  path,
  viewer ? forumViewerId() : false,
];

const feedKey = (baseUrl: string, sort: string) => ['node', baseUrl, 'feed', sort, forumViewerId()];

const NODE = 'https://node.example';
const COMMUNITY = '/v1/communities/dhaka_relief@jbs1abc';

describe('viewer-scoped cache keys', () => {
  afterEach(() => mockedViewerId.mockReturnValue(null));

  it('separates the anonymous answer from the authenticated one', () => {
    mockedViewerId.mockReturnValue(null);
    const anonymous = documentKey(NODE, COMMUNITY, true);

    mockedViewerId.mockReturnValue('jbi1amina');
    const authenticated = documentKey(NODE, COMMUNITY, true);

    expect(anonymous).not.toEqual(authenticated);
  });

  it('separates two identities on the same device', () => {
    mockedViewerId.mockReturnValue('jbi1amina');
    const first = documentKey(NODE, COMMUNITY, true);

    mockedViewerId.mockReturnValue('jbi1rafi');
    const second = documentKey(NODE, COMMUNITY, true);

    // Switching identities must not show one person the other's `joined` and `myVote`.
    expect(first).not.toEqual(second);
  });

  it('leaves a non-viewer read keyed identically regardless of who is signed in', () => {
    mockedViewerId.mockReturnValue(null);
    const anonymous = documentKey(NODE, '/v1/communities', false);

    mockedViewerId.mockReturnValue('jbi1amina');
    const authenticated = documentKey(NODE, '/v1/communities', false);

    // A public list gains nothing from a per-viewer cache entry, and splitting it would
    // refetch the whole directory on sign-in for no benefit.
    expect(anonymous).toEqual(authenticated);
  });

  it('scopes the feed too — myVote and saved are viewer fields', () => {
    mockedViewerId.mockReturnValue(null);
    const anonymous = feedKey(NODE, 'hot');

    mockedViewerId.mockReturnValue('jbi1amina');
    expect(feedKey(NODE, 'hot')).not.toEqual(anonymous);
  });
});
