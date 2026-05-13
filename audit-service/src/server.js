import cors from 'cors'
import express from 'express'
import { ReceiptStore } from './store.js'
import { verifyReceipt } from './verification.js'

const app = express()
const port = Number(process.env.AUDIT_SERVICE_PORT || process.env.PORT || 6100)
const store = new ReceiptStore(process.env.AUDIT_STORE_PATH || './data/receipts.json')

app.use(cors({ origin: process.env.AUDIT_CORS_ORIGIN || true }))
app.use(express.json({ limit: process.env.AUDIT_BODY_LIMIT || '256kb' }))

app.get('/health/live', (_req, res) => res.json({ ok: true }))
app.get('/health/ready', (_req, res) => res.json({ ok: true, records: store.records.size }))

app.post('/receipts', async (req, res) => {
  const verification = verifyReceipt(req.body)
  const record = await store.submit(req.body, verification)
  res.status(verification.ok ? 201 : 202).json({ id: record.id, verification, submittedAt: record.submittedAt })
})

app.post('/receipts/verify', (req, res) => {
  res.json(verifyReceipt(req.body.receipt || req.body))
})

app.get('/receipts/:id', (req, res) => {
  const record = store.get(req.params.id)
  if (!record) return res.status(404).json({ message: 'Receipt not found' })
  res.json(record)
})

app.get('/lookup/content-hash/:hash', (req, res) => {
  res.json({ items: store.byContentHash(req.params.hash) })
})

app.get('/lookup/server/:serverId', (req, res) => {
  res.json({ items: store.byServer(req.params.serverId) })
})

app.get('/lookup/user/:publicKey', (req, res) => {
  res.json({ items: store.byPublicKey(req.params.publicKey) })
})

await store.load()
app.listen(port, () => {
  console.log(`audit-service listening on ${port}`)
})
