import { MemberStatus } from './schemas/subreddit-member.schema'

describe('subreddit member status flags', () => {
  it('keeps federated persisted bit positions stable', () => {
    expect(MemberStatus.MEMBER).toBe(1)
    expect(MemberStatus.MUTED).toBe(2)
    expect(MemberStatus.BANNED).toBe(4)
    expect(MemberStatus.MODERATOR).toBe(8)
    expect(MemberStatus.CONTRIBUTOR).toBe(16)
  })
})
