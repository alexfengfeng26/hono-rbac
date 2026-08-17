import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/**
 * 密码策略：≥8 位，且同时包含字母与数字。
 * 返回 null 表示通过；否则返回中文错误提示。
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return '密码至少 8 位'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return '密码需同时包含字母和数字'
  return null
}
