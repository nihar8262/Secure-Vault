const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const argon2 = require('argon2')
const crypto = require('crypto')
const { MongoClient } = require('mongodb')
const { z } = require('zod')

dotenv.config()

const uri = process.env.MONGO_URI
const port = Number(process.env.PORT) || 3000
const jwtSecret = process.env.JWT_SECRET
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const nodeEnv = process.env.NODE_ENV || 'development'
const dbName = 'Secure_Vault'
const usersCollectionName = 'Users'
const passwordsCollectionName = 'Password_Collection'
const metaCollectionName = 'Vault_Metadata'
const refreshCookieName = 'secure_vault_refresh'
const accessTokenTtl = '15m'
const refreshTokenMaxAgeMs = 30 * 24 * 60 * 60 * 1000

const app = express()
const client = new MongoClient(uri)
let dbConnectionPromise

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
app.use(cors({
  origin: frontendOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}))
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
})

app.use('/api', apiLimiter)
app.use('/api/auth', authLimiter)

const connectToDatabase = async () => {
  if (!uri) {
    throw new Error('MONGO_URI is not configured')
  }

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }

  await client.connect()

  const db = client.db(dbName)
  await Promise.all([
    db.collection(usersCollectionName).createIndex({ email: 1 }, { unique: true }),
    db.collection(usersCollectionName).createIndex({ refreshTokenHash: 1 }, { sparse: true }),
    db.collection(metaCollectionName).createIndex({ userId: 1 }, { unique: true }),
    db.collection(passwordsCollectionName).createIndex({ userId: 1, id: 1 }, { unique: true }),
    db.collection(passwordsCollectionName).createIndex({ userId: 1, updatedAt: -1 }),
  ])

  return db
}

const getDb = async () => {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectToDatabase()
  }

  return dbConnectionPromise
}

const authRegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(128),
})

const authLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(128),
})

const vaultMetaSchema = z.object({
  salt: z.string().min(16).max(512),
  verifier: z.string().min(16).max(512),
  kdf: z.literal('argon2id'),
  timeCost: z.number().int().min(1).max(10),
  memoryCost: z.number().int().min(1024).max(262144),
  parallelism: z.number().int().min(1).max(8),
  hashLength: z.number().int().min(16).max(64),
})

const passwordRecordSchema = z.object({
  id: z.string().uuid(),
  site: z.string().url().max(2048),
  username: z.string().trim().min(3).max(320),
  category: z.string().trim().min(2).max(40).optional(),
  passwordCiphertext: z.string().min(16).max(8096),
  passwordIv: z.string().min(8).max(128),
  passwordStrength: z.enum(['Weak', 'Medium', 'Strong', 'Unknown']).optional(),
  hasSymbols: z.boolean().optional(),
  hasNumbers: z.boolean().optional(),
})

const normalizeTimestamp = (value) => {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate.toISOString()
}

const getLegacyTimestamp = (record) => {
  if (record._id && typeof record._id.getTimestamp === 'function') {
    return record._id.getTimestamp().toISOString()
  }

  return null
}

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  createdAt: normalizeTimestamp(user.createdAt),
  updatedAt: normalizeTimestamp(user.updatedAt),
})

const sanitizeVaultMeta = (metadata) => {
  if (!metadata) {
    return null
  }

  return {
    salt: metadata.salt,
    verifier: metadata.verifier,
    kdf: metadata.kdf,
    timeCost: metadata.timeCost,
    memoryCost: metadata.memoryCost,
    parallelism: metadata.parallelism,
    hashLength: metadata.hashLength,
    createdAt: normalizeTimestamp(metadata.createdAt),
    updatedAt: normalizeTimestamp(metadata.updatedAt),
  }
}

const sanitizePasswordRecord = (record) => {
  const fallbackTimestamp = getLegacyTimestamp(record)
  const hasEncryptedSecret = Boolean(record.passwordCiphertext && record.passwordIv)
  const hasLegacyPlaintext = typeof record.password === 'string' && record.password.length > 0

  return {
    id: record.id,
    site: record.site,
    username: record.username,
    category: record.category || 'Personal',
    passwordCiphertext: record.passwordCiphertext,
    passwordIv: record.passwordIv,
    passwordStrength: record.passwordStrength || 'Unknown',
    hasSymbols: Boolean(record.hasSymbols),
    hasNumbers: Boolean(record.hasNumbers),
    encryptionStatus: hasEncryptedSecret ? 'encrypted' : hasLegacyPlaintext ? 'legacy-plaintext' : 'missing-secret',
    createdAt: normalizeTimestamp(record.createdAt) || normalizeTimestamp(record.updatedAt) || fallbackTimestamp,
    updatedAt: normalizeTimestamp(record.updatedAt) || normalizeTimestamp(record.createdAt) || fallbackTimestamp,
  }
}

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)

  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((issue) => issue.message),
    })
  }

  req.body = result.data
  return next()
}

const createAuthToken = (user) => jwt.sign(
  { sub: user.id, email: user.email, name: user.name },
  jwtSecret,
  { expiresIn: accessTokenTtl },
)

const hashRefreshToken = (refreshToken) => crypto.createHash('sha256').update(refreshToken).digest('hex')

const buildRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: nodeEnv === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: refreshTokenMaxAgeMs,
})

const clearRefreshCookie = (res) => {
  res.clearCookie(refreshCookieName, {
    ...buildRefreshCookieOptions(),
    maxAge: undefined,
  })
}

const createRefreshSession = async (db, userId) => {
  const refreshToken = crypto.randomBytes(48).toString('base64url')
  const refreshTokenHash = hashRefreshToken(refreshToken)
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenMaxAgeMs).toISOString()

  await db.collection(usersCollectionName).updateOne(
    { id: userId },
    {
      $set: {
        refreshTokenHash,
        refreshTokenExpiresAt,
        updatedAt: new Date().toISOString(),
      },
    },
  )

  return {
    refreshToken,
    refreshTokenExpiresAt,
  }
}

const sendSessionResponse = async (db, res, user) => {
  const { refreshToken } = await createRefreshSession(db, user.id)
  res.cookie(refreshCookieName, refreshToken, buildRefreshCookieOptions())

  return res.json({
    accessToken: createAuthToken(user),
    user: sanitizeUser(user),
  })
}

const authMiddleware = async (req, res, next) => {
  const authorization = req.headers.authorization || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication is required' })
  }

  try {
    const payload = jwt.verify(token, jwtSecret)
    const db = await getDb()
    const user = await db.collection(usersCollectionName).findOne({ id: payload.sub })

    if (!user) {
      return res.status(401).json({ error: 'Authentication is invalid' })
    }

    req.user = sanitizeUser(user)
    return next()
  } catch {
    return res.status(401).json({ error: 'Authentication is invalid' })
  }
}

app.post('/api/auth/register', validateBody(authRegisterSchema), async (req, res) => {
  const { name, email, password } = req.body

  try {
    const db = await getDb()
    const normalizedEmail = email.toLowerCase()
    const existingUser = await db.collection(usersCollectionName).findOne({ email: normalizedEmail })

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const timestamp = new Date().toISOString()
    const user = {
      id: crypto.randomUUID(),
      name,
      email: normalizedEmail,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await db.collection(usersCollectionName).insertOne(user)

    res.status(201)
    return sendSessionResponse(db, res, user)
  } catch (error) {
    logServerError('auth/register', error)
    return res.status(500).json({ error: 'Unable to create the account' })
  }
})

app.post('/api/auth/login', validateBody(authLoginSchema), async (req, res) => {
  const { email, password } = req.body

  try {
    const db = await getDb()
    const user = await db.collection(usersCollectionName).findOne({ email: email.toLowerCase() })

    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }

    const isValidPassword = await argon2.verify(user.passwordHash, password)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }

    return sendSessionResponse(db, res, user)
  } catch (error) {
    logServerError('auth/login', error)
    return res.status(500).json({ error: 'Unable to sign in' })
  }
})

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies[refreshCookieName]

  if (!refreshToken) {
    clearRefreshCookie(res)
    return res.status(401).json({ error: 'Refresh session is missing' })
  }

  try {
    const db = await getDb()
    const refreshTokenHash = hashRefreshToken(refreshToken)
    const user = await db.collection(usersCollectionName).findOne({ refreshTokenHash })

    if (!user || !user.refreshTokenExpiresAt) {
      clearRefreshCookie(res)
      return res.status(401).json({ error: 'Refresh session is invalid' })
    }

    if (new Date(user.refreshTokenExpiresAt).getTime() <= Date.now()) {
      await db.collection(usersCollectionName).updateOne(
        { id: user.id },
        { $unset: { refreshTokenHash: '', refreshTokenExpiresAt: '' } },
      )
      clearRefreshCookie(res)
      return res.status(401).json({ error: 'Refresh session expired' })
    }

    return sendSessionResponse(db, res, user)
  } catch (error) {
    logServerError('auth/refresh', error)
    clearRefreshCookie(res)
    return res.status(500).json({ error: 'Unable to refresh the session' })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  const refreshToken = req.cookies[refreshCookieName]

  try {
    if (refreshToken) {
      const db = await getDb()
      await db.collection(usersCollectionName).updateOne(
        { refreshTokenHash: hashRefreshToken(refreshToken) },
        { $unset: { refreshTokenHash: '', refreshTokenExpiresAt: '' } },
      )
    }
  } catch {
    clearRefreshCookie(res)
    return res.status(500).json({ error: 'Unable to sign out' })
  }

  clearRefreshCookie(res)
  return res.json({ success: true })
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/meta', authMiddleware, async (req, res) => {
  try {
    const db = await getDb()
    const metadata = await db.collection(metaCollectionName).findOne({ userId: req.user.id })
    res.json(sanitizeVaultMeta(metadata))
  } catch {
    res.status(500).json({ error: 'Failed to load vault metadata' })
  }
})

app.post('/api/meta', authMiddleware, validateBody(vaultMetaSchema), async (req, res) => {
  try {
    const db = await getDb()
    const existing = await db.collection(metaCollectionName).findOne({ userId: req.user.id })

    if (existing) {
      return res.status(409).json({ error: 'Vault already initialized for this account' })
    }

    const timestamp = new Date().toISOString()
    const metadata = {
      userId: req.user.id,
      ...req.body,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await db.collection(metaCollectionName).insertOne(metadata)
    return res.status(201).json({ success: true, metadata: sanitizeVaultMeta(metadata) })
  } catch {
    return res.status(500).json({ error: 'Failed to initialize vault metadata' })
  }
})

app.get('/api/passwords', authMiddleware, async (req, res) => {
  try {
    const db = await getDb()
    const records = await db
      .collection(passwordsCollectionName)
      .find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .toArray()

    res.json(records.map(sanitizePasswordRecord))
  } catch {
    res.status(500).json({ error: 'Failed to load passwords' })
  }
})

app.post('/api/passwords', authMiddleware, validateBody(passwordRecordSchema), async (req, res) => {
  try {
    const db = await getDb()
    const timestamp = new Date().toISOString()
    const record = {
      userId: req.user.id,
      ...req.body,
      category: req.body.category || 'Personal',
      passwordStrength: req.body.passwordStrength || 'Unknown',
      hasSymbols: Boolean(req.body.hasSymbols),
      hasNumbers: Boolean(req.body.hasNumbers),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await db.collection(passwordsCollectionName).insertOne(record)
    return res.status(201).json({ success: true, record: sanitizePasswordRecord(record) })
  } catch {
    return res.status(500).json({ error: 'Failed to save password' })
  }
})

app.put('/api/passwords/:id', authMiddleware, validateBody(passwordRecordSchema), async (req, res) => {
  const { id } = req.params

  try {
    const db = await getDb()
    const existing = await db.collection(passwordsCollectionName).findOne({ id, userId: req.user.id })

    if (!existing) {
      return res.status(404).json({ error: 'Password not found' })
    }

    const updatedRecord = {
      ...req.body,
      userId: req.user.id,
      id,
      category: req.body.category || 'Personal',
      passwordStrength: req.body.passwordStrength || 'Unknown',
      hasSymbols: Boolean(req.body.hasSymbols),
      hasNumbers: Boolean(req.body.hasNumbers),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    await db.collection(passwordsCollectionName).updateOne({ id, userId: req.user.id }, { $set: updatedRecord })

    return res.json({ success: true, record: sanitizePasswordRecord(updatedRecord) })
  } catch {
    return res.status(500).json({ error: 'Failed to update password' })
  }
})

app.delete('/api/passwords/:id', authMiddleware, async (req, res) => {
  const { id } = req.params

  try {
    const db = await getDb()
    const result = await db.collection(passwordsCollectionName).deleteOne({ id, userId: req.user.id })

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Password not found' })
    }

    return res.json({ success: true })
  } catch {
    return res.status(500).json({ error: 'Failed to delete password' })
  }
})

if (require.main === module) {
  getDb()
    .then(() => {
      app.listen(port, () => {
        console.log(`Your app listening on port http://localhost:${port}`)
      })
    })
    .catch((error) => {
      console.error('Failed to start server', error)
      process.exit(1)
    })
} else {
  getDb().catch((error) => {
    console.error('Failed to initialize database for serverless runtime', error)
  })
}

module.exports = app
