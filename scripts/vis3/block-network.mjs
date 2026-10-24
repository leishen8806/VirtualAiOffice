// 进程内网络守卫：拦截 fetch / http / https / net / tls；被拦时绝不调用原函数，一律抛错。
// 日志只记 origin（路径脱敏）。
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

const LOG = process.env.VIS3_NET_LOG || ''
const ALLOWED = new Set(String(process.env.VIS3_ALLOWED_PORTS || '').split(',').filter(Boolean).map(Number))
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1'])

function logBlocked(origin) { if (!LOG) return; try { fs.appendFileSync(LOG, JSON.stringify({ blocked: origin, at: new Date().toISOString() }) + '\n') } catch {} }
function allowHostPort(host, port) { return LOCAL.has(host) && ALLOWED.has(Number(port)) }

// fetch
// @@VIS3_FETCH_GUARD_BEGIN
const origFetch = globalThis.fetch
globalThis.fetch = async function (input, init) {
  let url
  try { url = new URL(typeof input === 'string' ? input : input?.url) } catch { return origFetch(input, init) }
  if (!allowHostPort(url.hostname, url.port)) { logBlocked(url.origin); throw new Error('VIS3_NETWORK_BLOCKED ' + url.origin) }
  return origFetch(input, init)
}
// @@VIS3_FETCH_GUARD_END

function parseTarget(a0, a1) {
  if (Array.isArray(a0)) { const arr = a0; a0 = arr[0]; a1 = arr.length > 1 ? arr[1] : a1 }
  if (a0 && typeof a0 === 'object') {
    const host = a0.host || a0.hostname || '127.0.0.1'
    const port = Number(a0.port) || 0
    const isUnix = typeof a0.path === 'string' && !a0.port && !a0.host && !a0.hostname
    return { host, port, isUnix }
  }
  if (typeof a0 === 'number' || /^\d+$/.test(String(a0))) {
    return { host: typeof a1 === 'string' ? a1 : '127.0.0.1', port: Number(a0) || 0 }
  }
  return null
}
function assertAllowed(...args) {
  const t = parseTarget(args[0], args[1])
  if (t && !t.isUnix && !allowHostPort(t.host, t.port)) {
    logBlocked(t.host + ':' + t.port)
    throw new Error('VIS3_NETWORK_BLOCKED ' + t.host + ':' + t.port)
  }
}

// http / https：只包 request；get 放行时走原生（原生 get 内部会调用被包住的 request，故仍受守卫）
function guardHttp(mod) {
  const origReq = mod.request, origGet = mod.get
  mod.request = function (...args) { assertAllowed(...args); return origReq.apply(mod, args) }
  mod.get = function (...args) { return origGet.apply(mod, args) }
}
guardHttp(http); guardHttp(https)

// net / tls：拦截 connect / createConnection / Socket.prototype.connect
function guardConnect(orig) { return function (...args) { assertAllowed(...args); return orig.apply(this, args) } }
const origNetConnect = net.connect
const origNetCreateConn = net.createConnection
const origTlsConnect = tls.connect
net.connect = guardConnect(origNetConnect)
net.createConnection = guardConnect(origNetCreateConn)
tls.connect = guardConnect(origTlsConnect)
const origSocketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) { assertAllowed(...args); return origSocketConnect.apply(this, args) }

export const __vis3_guard = true
// 测试运行时追加允许端口（子进程 listen(0) 后自允许）
globalThis.__vis3_allowPort = (port) => ALLOWED.add(Number(port))
