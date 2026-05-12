import 'dotenv/config'
import mongoose, { Types } from 'mongoose'
import config from '../config'

import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as tinySecp from 'tiny-secp256k1'
import { createHash } from 'crypto'

import { Auth, AuthSchema } from '../auth/schemas/auth.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import { Subreddit, SubredditSchema } from '../subreddits/schemas/subreddit.schema'
import { SubredditMember, SubredditMemberSchema } from '../subreddits/schemas/subreddit-member.schema'
import { Post, PostSchema } from '../posts/schemas/post.schema'
import { Comment, CommentSchema } from '../comments/schemas/comment.schema'
import { Vote, VoteSchema } from '../votes/schemas/vote.schema'
import { Message, MessageSchema } from '../messages/schemas/message.schema'
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema'
import { AwardType, AwardTypeSchema } from '../awards/schemas/award-type.schema'
import { Award, AwardSchema } from '../awards/schemas/award.schema'
import { ModLog, ModLogSchema } from '../moderation/schemas/mod-log.schema'

const bip32 = BIP32Factory(tinySecp)

const MNEMONIC =
  process.env.SEED_MNEMONIC ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const ACCOUNT_SEEDS = [
  { passphrase: 'admin-passphrase', username: 'seed_admin', bio: 'Instance caretaker and audit reviewer.', abac: BigInt(1 << 5) },
  { passphrase: 'mod-passphrase', username: 'seed_mod', bio: 'Community moderator for privacy and local news.', abac: BigInt(0) },
  { passphrase: 'alice-passphrase', username: 'alice_keys', bio: 'Writes about pseudonymous identity and receipts.', abac: BigInt(0) },
  { passphrase: 'bob-passphrase', username: 'bob_reader', bio: 'Reads, votes, and asks careful questions.', abac: BigInt(0) },
  { passphrase: 'charlie-passphrase', username: 'charlie_builder', bio: 'Tests federation and community tooling.', abac: BigInt(0) }
]

const COMMUNITY_SEEDS = [
  {
    name: 'privacy',
    displayName: 'Privacy Lab',
    description: 'Practical discussion about anonymous identity, receipts, and accountable moderation.',
    rules: '1. No doxxing.\n2. Explain claims with reproducible evidence.\n3. Keep moderation appeals public when possible.'
  },
  {
    name: 'localnews',
    displayName: 'Local News Desk',
    description: 'Community reporting with signed submissions and visible moderation history.',
    rules: '1. Cite sources.\n2. Mark rumors clearly.\n3. No targeted harassment.'
  },
  {
    name: 'buildlog',
    displayName: 'Build Log',
    description: 'Product feedback, federation tests, UX notes, and release progress.',
    rules: '1. File bugs with steps.\n2. Keep critiques specific.\n3. Respect test data.'
  }
]

const POST_SEEDS = [
  {
    key: 'privacy-receipts',
    community: 'privacy',
    author: 'alice_keys',
    title: 'What should a useful content receipt prove?',
    content:
      'A receipt should prove the author signed a specific payload, the server accepted it at a specific time, and later moderation can be checked against that same subject.',
    flair: 'Discussion'
  },
  {
    key: 'privacy-modlog',
    community: 'privacy',
    author: 'seed_mod',
    title: 'Moderation should be strict, but inspectable',
    content:
      'Strict moderation is easier to trust when removals, restores, bans, and appeals leave a durable trail that regular users can inspect.',
    flair: 'Moderation'
  },
  {
    key: 'localnews-water',
    community: 'localnews',
    author: 'bob_reader',
    title: 'How should local reports handle unverifiable claims?',
    content:
      'I would like a flow where reports can be posted quickly, labeled as unverified, and later upgraded when sources or receipts are attached.',
    flair: 'Question'
  },
  {
    key: 'buildlog-empty-state',
    community: 'buildlog',
    author: 'charlie_builder',
    title: 'Empty states should teach the next action',
    content:
      'A new instance needs seed content and clear actions. Users should not land on a blank feed with developer infrastructure notes.',
    flair: 'UX'
  },
  {
    key: 'buildlog-federation',
    community: 'buildlog',
    author: 'seed_admin',
    title: 'Federation testing needs friendly fixtures',
    content:
      'Two local servers should exchange signed activities with enough seeded data to test accepted, rejected, replayed, and restored states.',
    flair: 'Federation'
  }
]

type SeedAccount = {
  username: string
  authId: Types.ObjectId
  publicKey: Buffer
  privateKey: Buffer
}

const hash = (payload: string) => createHash('sha256').update(payload).digest('hex')
const sign = (privateKey: Buffer, payload: string) => Buffer.from(tinySecp.sign(Buffer.from(hash(payload), 'hex'), privateKey)).toString('base64')

function deriveAccount(passphrase: string, index: number) {
  const seed = bip39.mnemonicToSeedSync(MNEMONIC, passphrase)
  const root = bip32.fromSeed(seed)
  const leaf = root.derivePath(`m/44'/0'/0'/0'/${index}'`)
  if (!leaf.privateKey || !leaf.publicKey) throw new Error(`Could not derive keypair for ${passphrase}`)
  const privateKey = Buffer.from(leaf.privateKey)
  const publicKey = Buffer.from(leaf.publicKey)
  seed.fill(0)
  return { privateKey, publicKey }
}

async function upsertAccount(AuthModel: any, UserModel: any, seed: (typeof ACCOUNT_SEEDS)[number], index: number): Promise<SeedAccount> {
  const keypair = deriveAccount(seed.passphrase, index)
  const authDoc = await AuthModel.findOneAndUpdate(
    { publicKey: keypair.publicKey },
    { $setOnInsert: { publicKey: keypair.publicKey }, $set: { abac: seed.abac } },
    { upsert: true, new: true }
  )

  await UserModel.findOneAndUpdate(
    { _id: authDoc._id },
    {
      $set: {
        username: seed.username,
        bio: seed.bio,
        avatarUrl: '',
        postKarma: 0,
        commentKarma: 0
      }
    },
    { upsert: true, new: true }
  )

  return {
    username: seed.username,
    authId: authDoc._id,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey
  }
}

async function run() {
  console.log('Seeder starting')
  console.log('Using Mongo URI:', config.mongo.uri)
  console.log('Seed mnemonic fingerprint:', hash(MNEMONIC).slice(0, 12))

  await mongoose.connect(config.mongo.uri)

  const AuthModel = mongoose.models[Auth.name] ?? mongoose.model(Auth.name, AuthSchema)
  const UserModel = mongoose.models[User.name] ?? mongoose.model(User.name, UserSchema)
  const SubredditModel = mongoose.models[Subreddit.name] ?? mongoose.model(Subreddit.name, SubredditSchema)
  const MemberModel = mongoose.models[SubredditMember.name] ?? mongoose.model(SubredditMember.name, SubredditMemberSchema)
  const PostModel = mongoose.models[Post.name] ?? mongoose.model(Post.name, PostSchema)
  const CommentModel = mongoose.models[Comment.name] ?? mongoose.model(Comment.name, CommentSchema)
  const VoteModel = mongoose.models[Vote.name] ?? mongoose.model(Vote.name, VoteSchema)
  const MessageModel = mongoose.models[Message.name] ?? mongoose.model(Message.name, MessageSchema)
  const NotificationModel = mongoose.models[Notification.name] ?? mongoose.model(Notification.name, NotificationSchema)
  const AwardTypeModel = mongoose.models[AwardType.name] ?? mongoose.model(AwardType.name, AwardTypeSchema)
  const AwardModel = mongoose.models[Award.name] ?? mongoose.model(Award.name, AwardSchema)
  const ModLogModel = mongoose.models[ModLog.name] ?? mongoose.model(ModLog.name, ModLogSchema)

  const accounts = new Map<string, SeedAccount>()
  for (let i = 0; i < ACCOUNT_SEEDS.length; i++) {
    const account = await upsertAccount(AuthModel, UserModel, ACCOUNT_SEEDS[i], i)
    accounts.set(account.username, account)
  }

  const admin = accounts.get('seed_admin')!
  const moderator = accounts.get('seed_mod')!
  const communities = new Map<string, any>()

  for (const community of COMMUNITY_SEEDS) {
    const doc = await SubredditModel.findOneAndUpdate(
      { name: community.name },
      {
        $set: {
          ...community,
          createdBy: admin.authId,
          isPrivate: false,
          isArchived: false,
          theme: {
            primary: '#ff4500',
            accent: '#0079d3',
            background: '#ffffff',
            foreground: '#1a1a1b'
          },
          settings: {
            allowTextPosts: true,
            allowLinkPosts: true,
            allowImagePosts: true,
            allowVideoPosts: true,
            requirePostApproval: false,
            allowCrossposts: true,
            minimumKarmaToPost: 0,
            minimumAccountAgeDays: 0
          }
        }
      },
      { upsert: true, new: true }
    )
    communities.set(community.name, doc)

    for (const account of accounts.values()) {
      const isAdmin = account.username === 'seed_admin'
      const isMod = account.username === 'seed_mod'
      const isContributor = account.username === 'charlie_builder'
      const flags = BigInt(1) | (isAdmin || isMod ? BigInt(8) : BigInt(0)) | (isContributor ? BigInt(16) : BigInt(0))
      await MemberModel.findOneAndUpdate(
        { subredditId: doc._id, userId: account.authId },
        { $set: { statusFlags: flags } },
        { upsert: true, new: true }
      )
    }
  }

  const posts = new Map<string, any>()
  for (const item of POST_SEEDS) {
    const community = communities.get(item.community)
    const author = accounts.get(item.author)!
    const canonical = JSON.stringify({
      title: item.title,
      content: item.content,
      type: 'text',
      subredditId: String(community._id),
      authorId: String(author.authId)
    })
    const contentHash = hash(canonical)
    const userSignature = sign(author.privateKey, canonical)

    const post = await PostModel.findOneAndUpdate(
      { contentHash },
      {
        $set: {
          subredditId: community._id,
          authorId: author.authId,
          title: item.title,
          type: 'text',
          content: item.content,
          attachmentIds: [],
          flair: item.flair,
          userSignature,
          contentHash,
          statusFlags: BigInt(1),
          viewCount: 25 + posts.size * 11
        }
      },
      { upsert: true, new: true }
    )
    posts.set(item.key, post)
  }

  const commentSeeds = [
    { post: 'privacy-receipts', author: 'bob_reader', content: 'The receipt should include the canonical payload, not just a hash.' },
    { post: 'privacy-receipts', author: 'seed_mod', content: 'Moderator actions should reference the same subject id and previous state.' },
    { post: 'privacy-modlog', author: 'alice_keys', content: 'Strict is fine when users can verify what happened later.' },
    { post: 'localnews-water', author: 'seed_admin', content: 'A visible unverified label would help readers judge urgency without treating it as fact.' },
    { post: 'buildlog-empty-state', author: 'alice_keys', content: 'Seed data should include comments and votes so the first page feels alive.' },
    { post: 'buildlog-federation', author: 'charlie_builder', content: 'The test should include replay and forged signature cases.' }
  ]

  const comments = new Map<string, any>()
  for (const item of commentSeeds) {
    const post = posts.get(item.post)
    const author = accounts.get(item.author)!
    const attachmentIds: string[] = []
    const canonical = JSON.stringify({
      content: item.content,
      postId: post._id,
      parentId: null,
      attachmentIds,
      authorId: author.authId
    })
    const contentHash = hash(canonical)
    const userSignature = sign(author.privateKey, canonical)
    const comment = await CommentModel.findOneAndUpdate(
      { contentHash },
      {
        $set: {
          postId: post._id,
          subredditId: post.subredditId,
          authorId: author.authId,
          content: item.content,
          attachmentIds: [],
          depth: 0,
          path: `${post._id}/seed-${contentHash.slice(0, 10)}`,
          userSignature,
          contentHash,
          statusFlags: BigInt(1)
        }
      },
      { upsert: true, new: true }
    )
    comments.set(contentHash, comment)
  }

  for (const post of posts.values()) {
    const postComments = await CommentModel.find({ postId: post._id })
    await PostModel.updateOne({ _id: post._id }, { $set: { commentCount: postComments.length } })
  }

  const voteTargets = [
    ...Array.from(posts.values()).map((target) => ({ target, targetType: 'post' })),
    ...Array.from(comments.values()).slice(0, 4).map((target) => ({ target, targetType: 'comment' }))
  ]

  for (const { target, targetType } of voteTargets) {
    let upvoteCount = 0
    let downvoteCount = 0
    for (const account of accounts.values()) {
      if (String(account.authId) === String(target.authorId)) continue
      const value = account.username === 'bob_reader' && targetType === 'post' && upvoteCount > 1 ? -1 : 1
      if (value > 0) upvoteCount += 1
      else downvoteCount += 1
      await VoteModel.findOneAndUpdate(
        { userId: account.authId, targetId: target._id, targetType },
        { $set: { value } },
        { upsert: true, new: true }
      )
    }
    const update = { upvoteCount, downvoteCount, score: upvoteCount - downvoteCount }
    if (targetType === 'post') await PostModel.updateOne({ _id: target._id }, { $set: update })
    else await CommentModel.updateOne({ _id: target._id }, { $set: update })
  }

  const helpful = await AwardTypeModel.findOneAndUpdate(
    { name: 'Helpful Receipt' },
    { $set: { iconUrl: '/jagoo-bahee.svg', cost: 25, description: 'Awarded for useful, verifiable context.', isActive: true } },
    { upsert: true, new: true }
  )

  const firstPost = posts.get('privacy-receipts')
  await AwardModel.findOneAndUpdate(
    { awardTypeId: helpful._id, giverId: admin.authId, targetId: firstPost._id, targetType: 'post' },
    { $set: { isAnonymous: false, message: 'Good audit framing.' } },
    { upsert: true, new: true }
  )

  const firstMessageCanonical = JSON.stringify({
    senderId: String(admin.authId),
    recipientId: String(moderator.authId),
    subject: 'Seed moderation review',
    content: 'Please review the seeded privacy thread and verify the moderation copy reads clearly.',
    attachmentIds: [],
    parentMessageId: null
  })
  await MessageModel.findOneAndUpdate(
    { contentHash: hash(firstMessageCanonical) },
    {
      $set: {
        senderId: admin.authId,
        recipientId: moderator.authId,
        subject: 'Seed moderation review',
        content: 'Please review the seeded privacy thread and verify the moderation copy reads clearly.',
        contentHash: hash(firstMessageCanonical),
        attachmentIds: [],
        senderSignature: sign(admin.privateKey, firstMessageCanonical),
        isRead: false,
        isDeleted: false
      }
    },
    { upsert: true, new: true }
  )

  await NotificationModel.findOneAndUpdate(
    { userId: admin.authId, targetId: firstPost._id, type: 'award' },
    {
      $set: {
        actorId: moderator.authId,
        targetType: 'post',
        message: 'Your seeded post received a Helpful Receipt award.',
        isRead: false
      }
    },
    { upsert: true, new: true }
  )

  await ModLogModel.findOneAndUpdate(
    { subredditId: communities.get('privacy')._id, action: 'seed.review', targetId: firstPost._id },
    {
      $set: {
        moderatorId: moderator.authId,
        targetType: 'post',
        reason: 'Seeded moderation log for UI and audit testing.',
        details: { seeded: true },
        moderatorSignature: sign(moderator.privateKey, `seed.review|${communities.get('privacy')._id}|${firstPost._id}`)
      }
    },
    { upsert: true, new: true }
  )

  for (const community of communities.values()) {
    const memberCount = await MemberModel.countDocuments({
      subredditId: community._id,
      statusFlags: { $bitsAllSet: 1 }
    } as any)
    const postCount = await PostModel.countDocuments({ subredditId: community._id })
    await SubredditModel.updateOne({ _id: community._id }, { $set: { memberCount, postCount } })
  }

  const counts = {
    users: await UserModel.countDocuments({ username: { $in: ACCOUNT_SEEDS.map((item) => item.username) } }),
    communities: await SubredditModel.countDocuments({ name: { $in: COMMUNITY_SEEDS.map((item) => item.name) } }),
    posts: await PostModel.countDocuments({ contentHash: { $in: Array.from(posts.values()).map((post) => post.contentHash) } }),
    comments: await CommentModel.countDocuments({ contentHash: { $in: Array.from(comments.keys()) } }),
    votes: await VoteModel.countDocuments({ targetId: { $in: voteTargets.map((item) => item.target._id) } }),
    messages: await MessageModel.countDocuments({ subject: 'Seed moderation review' })
  }

  console.log('Seeded dataset:', counts)
  console.log('Seed users:', ACCOUNT_SEEDS.map((item) => item.username).join(', '))
  console.log('Seeder finished')

  for (const account of accounts.values()) account.privateKey.fill(0)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Seeder error:', err)
  process.exit(1)
})
