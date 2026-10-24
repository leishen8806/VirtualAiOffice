// P-05/P-07：进程内网络守卫。同时拦截 fetch / http / https / net / tls；日志只记 origin（路径脱敏）。
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

const LOG = process.env.VIS3_NET_LOG || ''
const ALLOWED = new Set(String(process.env.VIS3_ALLOWED_PORTS || '').split(',').filter(Boolean).map(Number))
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1'])

function allowedPort(port) { return ALLOWED.has(Number(port)) }
function logBlocked(origin) {
  if (!LOG) return
  try { fs.appendFileSync(LOG, JSON.stringify({ blocked: origin, at: new Date().toISOString() }) + '\n') } catch {}
}
function allowHostPort(host, port) { return LOCAL.has(host) && allowedPort(port) }

// fetch
const origFetch = globalThis.fetch
globalThis.fetch = async function (input, init) {
  let url
  try { url = new URL(typeof input === 'string' ? input : input?.url) } catch { return origFetch(input, init) }
  if (!allowHostPort(url.hostname, url.port)) { logBlocked(url.origin); throw new Error('VIS3_NETWORK_BLOCKED ' + url.origin) }
  return origFetch(input, init)
}

// http/https
function guardRequest(mod) {
  const req = mod.request, get = mod.get
  mod.request = function (options, cb) {
    if (typeof options === 'string') { const u = new URL(options); if (!allowHostPort(u.hostname, u.port)) { logBlocked(u.origin); const e = new Error('VIS3_NETWORK_BLOCKED ' + u.origin); if (cb) process.nextTick(() => cb(e)); throw e } }
    else if (options && typeof options === 'object') { const h = options.hostname || options.host || '127.0.0.1'; const p = options.port || (mod === https ? 443 : 80); if (!allowHostPort(h, p)) { logBlocked(`${mod === https ? 'https' : 'http'}://${h}:${p}`); const e = new Error('VIS3_NETWORK_BLOCKED ' + h + ':' + p); if (cb) process.nextTick(() => cb(e)); throw e } }
    return req.call(mod, options, cb)
  }
  mod.get = function (options, cb) { return mod.request(options, cb) }
}
guardRequest(http); guardRequest(https)

// net/tls：处理 (options[, cb]) 与 (port[, host][, cb]) 两种形式
const netConnect = net.connect, tlsConnect = tls.connect
function blockNet(...args) {
  let host = '127.0.0.1', port = 0, cb = null
  const a0 = args[0]
  if (a0 && typeof a0 === 'object') { host = a0.host || a0.hostname || '127.0.0.1'; port = a0.port || 0; cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null }
  else { port = Number(a0) || 0; host = typeof args[1] === 'string' ? args[1] : '127.0.0.1'; cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null }
  if (!allowHostPort(host, port)) { logBlocked(host + ':' + port); const e = new Error('VIS3_NETWORK_BLOCKED ' + host + ':' + port); if (cb) process.nextTick(() => cb(e)); else throw e }
}
function guardNet(orig) {
  return function (...args) { blockNet(...args); return orig.apply(this, args) }
}
net.connect = guardNet(netConnect)
tls.connect = guardNet(tlsConnect)

export const __vis3_guard = true
