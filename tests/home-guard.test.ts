import { describe, expect, it } from 'vitest'
import app from '../app/server'

describe('首页工作台守卫', () => {
  it('未登录访问 / 重定向到 /login', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/login')
  })
})
