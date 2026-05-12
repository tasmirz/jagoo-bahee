export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'hard!to-guess_secret',
  signOptions: { expiresIn: '30d' },
  challengeExpiresIn: process.env.CHALLENGE_EXPIRES_IN || '2m'
}
