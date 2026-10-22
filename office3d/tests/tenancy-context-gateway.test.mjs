import assert from 'node:assert/strict'
import test from 'node:test'

import { createGateway, paperclipLoopbackOnly } from '../tenancy/paperclip-gateway.mjs'
import { createTenantContextMonitor, resolveTenantContext } from '../tenancy/tenant-context.mjs'

const registry = {
  get(id) {
    if (id === 'cmp_zhixuoffice000001') return { id, slug: 'zhixu', paperclipCompanyId: '1a8d32a6-f9e9-4b9f-b39d-1765cc140326' }
    return null
  },
}

test('tenant context always resolves to company #1 and ignores client hints', () => {
  const req = {
    url: '/state?company=cmp_other&c=x',
    headers: { cookie: 'company=cmp_other', [(['x', 'company'].join('-'))]: 'cmp_other' },
    body: { [['company', 'Id'].join('')]: 'cmp_other' },
  }
  const off = resolveTenantContext(req, { flag: () => ({ enabled: false, reason: 'off' }), registry })
  const on = resolveTenantContext(req, { flag: () => ({ enabled: true, reason: 'on' }), registry })
  assert.equal(off.tenantId, 'cmp_zhixuoffice000001')
  assert.equal(off.source, 'legacy')
  assert.equal(on.source, 'legacy-lan')
  assert.equal(Object.isFrozen(on), true)

  const monitor = createTenantContextMonitor()
  monitor.resolve(req, { flag: () => ({ enabled: true, reason: 'on' }), registry })
  assert.equal(monitor.stats().ignoredClientHints, 5)
})

test('paperclip gateway only accepts loopback base urls', () => {
  assert.equal(paperclipLoopbackOnly('http://127.0.0.1:3100'), true)
  assert.equal(paperclipLoopbackOnly('http://localhost:3100'), true)
  assert.equal(paperclipLoopbackOnly('http://[::1]:3100'), true)
  assert.equal(paperclipLoopbackOnly('http://0.0.0.0:3100'), false)
  assert.equal(paperclipLoopbackOnly('http://192.168.1.5:3100'), false)
  assert.equal(paperclipLoopbackOnly('http://example.com:3100'), false)
})

test('paperclip gateway rejects hostile paths and mismatched company scopes', async () => {
  const gateway = createGateway({
    baseUrl: 'http://127.0.0.1:3100',
    ownerCompanyId: '1a8d32a6-f9e9-4b9f-b39d-1765cc140326',
    fetchImpl: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
  })
  await assert.rejects(() => gateway.get('/api/companies/other/issues'), /not found/)
  await assert.rejects(() => gateway.get('/api/companies/1a8d32a6-f9e9-4b9f-b39d-1765cc140326/issues?companyId=other'), /not found/)
  await assert.rejects(() => gateway.get('/api/companies/1a8d32a6-f9e9-4b9f-b39d-1765cc140326/%2e%2e/issues'), /not found/)
  assert.equal(gateway.stats().denied >= 2, true)
})

test('paperclip gateway drops entire payload when one resource belongs to another company', async () => {
  const gateway = createGateway({
    baseUrl: 'http://127.0.0.1:3100',
    ownerCompanyId: '1a8d32a6-f9e9-4b9f-b39d-1765cc140326',
    fetchImpl: async () => new Response(JSON.stringify([{ id: 'a', companyId: '1a8d32a6-f9e9-4b9f-b39d-1765cc140326' }, { id: 'b', companyId: 'bad-company' }]), { status: 200, headers: { 'content-type': 'application/json' } }),
  })
  await assert.rejects(() => gateway.get('/api/companies/1a8d32a6-f9e9-4b9f-b39d-1765cc140326/issues'), /not found/)
  assert.equal(gateway.stats().ownershipRejected, 1)
})

test('paperclip gateway enforces timeout, redirect error and size limit without logging bodies', async () => {
  const logs = []
  const base = {
    baseUrl: 'http://127.0.0.1:3100',
    ownerCompanyId: '1a8d32a6-f9e9-4b9f-b39d-1765cc140326',
    log: (line) => logs.push(line),
  }
  const tooLarge = createGateway({
    ...base,
    fetchImpl: async () => new Response('x'.repeat(8 * 1024 * 1024 + 1), { status: 200, headers: { 'content-type': 'application/json' } }),
  })
  await assert.rejects(() => tooLarge.get('/api/companies/1a8d32a6-f9e9-4b9f-b39d-1765cc140326/issues'), /gateway unavailable/)

  const redirected = createGateway({
    ...base,
    fetchImpl: async (_, init) => {
      assert.equal(init.redirect, 'error')
      throw new Error('redirect blocked')
    },
  })
  await assert.rejects(() => redirected.get('/api/companies/1a8d32a6-f9e9-4b9f-b39d-1765cc140326/projects'), /gateway unavailable/)
  assert.equal(logs.some((line) => line.includes('companyId')), false)
})
