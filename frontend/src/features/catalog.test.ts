import { featureDestinations } from './catalog';

describe('P1-G1 feature reachability registry', () => {
  it('covers every Forum P1 feature family', () => {
    expect(featureDestinations.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'identity',
        'profile',
        'communities',
        'roles',
        'posts',
        'search',
        'moderation',
        'labels',
        'awards',
        'notifications',
        'messaging',
        'proofs',
        'admin',
        'operations',
      ]),
    );
  });

  it('has unique, actionable destinations', () => {
    const ids = featureDestinations.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(featureDestinations.every(({ title, description }) => title && description)).toBe(true);
  });
});

