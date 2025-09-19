export const attachmentsConfig = {
  unconfirmedTtlSec: Number(process.env.UNCONFIRMED_TTL_SEC ?? 60 * 60 * 24),
  orphanTtlSec: Number(process.env.ORPHAN_TTL_SEC ?? 60 * 60 * 24 * 7)
}

export default attachmentsConfig
