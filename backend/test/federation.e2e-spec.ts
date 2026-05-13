import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { Connection } from 'mongoose'
import { getConnectionToken } from '@nestjs/mongoose'
import { AppModule } from './../src/app.module'
import { canonicalJson } from '../src/federation/federation.service'
import { getServerPublicKeyBase64, serverKeyId, signServerMessage } from '../src/common/server-sign.util'
import { createHash } from 'crypto'

describe('FederationController (e2e)', () => {
  let app: INestApplication
  let connection: Connection

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
    connection = app.get(getConnectionToken())
  })

  afterEach(async () => {
    if (connection) {
      await connection.collection('federationservers').deleteMany({ baseUrl: 'https://remote-a.example' })
      await connection.collection('federationactivities').deleteMany({ actorServerId: 'https://remote-a.example' })
      await (connection as any).client.db(`${connection.name}-federation-remote`).dropDatabase()
    }
    if (app) await app.close()
  })

  it('exposes discovery and nodeinfo documents', async () => {
    const wellKnown = await request(app.getHttpServer() as any).get('/.well-known/jagoo-bahee').expect(200)
    expect(wellKnown.body.software).toBe('jagoo-bahee')
    expect(wellKnown.body.publicKey).toBeTruthy()

    const nodeInfo = await request(app.getHttpServer() as any).get('/nodeinfo/2.1').expect(200)
    expect(nodeInfo.body.protocols).toContain('jagoo-bahee')
  })

  it('accepts signed approved activities once and treats replay as duplicate', async () => {
    await connection.collection('federationservers').insertOne({
      name: 'remote-a',
      baseUrl: 'https://remote-a.example',
      publicKey: getServerPublicKeyBase64(),
      keyId: serverKeyId,
      status: 'approved',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const object = { title: 'Federated hello', body: 'Remote markdown post' }
    const unsigned = {
      activityId: 'https://remote-a.example/activities/test-1',
      type: 'post.created',
      actorServerId: 'https://remote-a.example',
      actorKeyId: serverKeyId,
      object,
      objectHash: createHash('sha256').update(canonicalJson(object)).digest('hex'),
      createdAt: new Date().toISOString()
    }
    const activity = { ...unsigned, signature: signServerMessage(canonicalJson(unsigned)) }

    const accepted = await request(app.getHttpServer() as any).post('/federation/inbox').send(activity).expect(201)
    expect(accepted.body).toMatchObject({ accepted: true, duplicate: false })

    const replay = await request(app.getHttpServer() as any).post('/federation/inbox').send(activity).expect(201)
    expect(replay.body).toMatchObject({ accepted: true, duplicate: true })
  })

  it('rejects tampered activity hashes', async () => {
    await connection.collection('federationservers').insertOne({
      name: 'remote-a',
      baseUrl: 'https://remote-a.example',
      publicKey: getServerPublicKeyBase64(),
      keyId: serverKeyId,
      status: 'approved',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const unsigned = {
      activityId: 'https://remote-a.example/activities/test-2',
      type: 'post.created',
      actorServerId: 'https://remote-a.example',
      actorKeyId: serverKeyId,
      object: { title: 'Tampered' },
      objectHash: 'bad-hash',
      createdAt: new Date().toISOString()
    }
    const activity = { ...unsigned, signature: signServerMessage(canonicalJson(unsigned)) }

    await request(app.getHttpServer() as any).post('/federation/inbox').send(activity).expect(400)
  })

  it('rejects oversized inbox activities before storing them', async () => {
    const previousLimit = process.env.FEDERATION_INBOX_MAX_BODY_BYTES
    process.env.FEDERATION_INBOX_MAX_BODY_BYTES = '300'
    try {
      const activity = {
        activityId: 'https://remote-a.example/activities/oversized',
        type: 'post.created',
        actorServerId: 'https://remote-a.example',
        actorKeyId: serverKeyId,
        object: { title: 'Oversized', body: 'x'.repeat(1000) },
        objectHash: 'not-checked-for-oversized-payload',
        createdAt: new Date().toISOString(),
        signature: 'not-checked-for-oversized-payload'
      }

      await request(app.getHttpServer() as any).post('/federation/inbox').send(activity).expect(413)
      await expect(connection.collection('federationactivities').countDocuments({ activityId: activity.activityId })).resolves.toBe(0)
    } finally {
      if (previousLimit === undefined) delete process.env.FEDERATION_INBOX_MAX_BODY_BYTES
      else process.env.FEDERATION_INBOX_MAX_BODY_BYTES = previousLimit
    }
  })

  it('supports same MongoDB server with separate databases for federation nodes', async () => {
    const localDb = (connection as any).client.db(connection.name)
    const remoteDb = (connection as any).client.db(`${connection.name}-federation-remote`)

    await localDb.collection('federation_topology_probe').insertOne({ node: 'local' })
    await remoteDb.collection('federation_topology_probe').insertOne({ node: 'remote' })

    await expect(localDb.collection('federation_topology_probe').countDocuments({ node: 'remote' })).resolves.toBe(0)
    await expect(remoteDb.collection('federation_topology_probe').countDocuments({ node: 'local' })).resolves.toBe(0)
  })
})
