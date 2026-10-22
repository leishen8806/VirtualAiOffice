// 休息区「八卦」：拉真实的新闻标题，让空闲的同事（按各自岗位视角）在休息区聊几句。
// - 资讯：柬埔寨本地（Khmer Times、CamboJA）、科技（Hacker News）、中文综合（Google 新闻）；每 15 分钟拉一次，只发 GET，不上传任何数据
// - 对话：用本机已登录的 claude 命令（Haiku，print 模式，禁用全部工具，在空目录里运行）生成；不碰任何密钥
// - 只在上班时间、至少 2 位同事空闲时生成；每 15 分钟最多一段；政治、犯罪、伤亡、灾难、军事类新闻不聊
// - 这是闲聊，不代表工作进展；页面上的气泡带 📰 标记
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const SOURCES = [
  { key: 'kt', name: 'Khmer Times', kind: 'rss', url: 'https://www.khmertimeskh.com/feed/' },
  { key: 'cj', name: 'CamboJA News', kind: 'rss', url: 'https://cambojanews.com/feed/' },
  { key: 'gn', name: 'Google 新闻', kind: 'rss', url: 'https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans' },
  { key: 'hn', name: 'Hacker News', kind: 'hn' },
]
// Windows 上 npm 装的 claude 是 .cmd 外壳，直接起它里面的 claude.exe（不经过 shell，参数不会被拆错）
const CLAUDE_BIN = (() => {
  const exe = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  return process.platform === 'win32' && fs.existsSync(exe) ? exe : 'claude'
})()
const UA = { 'User-Agent': 'office3d-gossip/1.0 (local dashboard)' }
const MAX_THREADS = 30
const GEN_EVERY = 15 * 60 * 1000

const unxml = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .trim()

async function fetchSource(s) {
  if (s.kind === 'hn') {
    const ids = await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { headers: UA, signal: AbortSignal.timeout(15000) })).json()
    const items = await Promise.all(ids.slice(0, 12).map((id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { headers: UA, signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null)))
    return items.filter((i) => i && i.title).map((i) => ({ src: s.name, title: i.title, link: i.url || `https://news.ycombinator.com/item?id=${i.id}`, at: new Date(i.time * 1000).toISOString() }))
  }
  const xml = await (await fetch(s.url, { headers: UA, signal: AbortSignal.timeout(15000) })).text()
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, it]) => {
    const tag = (t) => (it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]
    const d = Date.parse(unxml(tag('pubDate')))
    return { src: s.name, title: unxml(tag('title')), link: unxml(tag('link')), at: Number.isFinite(d) ? new Date(d).toISOString() : null }
  }).filter((x) => x.title)
}

export function createGossip({ dir, log = console.log }) {
  const FILE = path.join(dir, 'gossip.json')
  const CWD = path.join(os.tmpdir(), 'office3d-gossip') // 空目录：生成对话时不让模型看到任何项目文件
  fs.mkdirSync(CWD, { recursive: true })
  let data = { threads: [], seen: [] }
  try { data = { ...data, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  let news = []
  let newsAt = 0
  let busy = false
  let lastGen = data.threads.length ? Date.parse(data.threads[0].at) || 0 : 0
  const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 1))

  async function refreshNews() {
    const all = await Promise.all(SOURCES.map((s) => fetchSource(s).catch((e) => { log(`[gossip] ${s.name} 获取失败：${e.message}`); return [] })))
    const cutoff = Date.now() - 36 * 3600 * 1000
    news = all.flat().filter((n) => !n.at || Date.parse(n.at) > cutoff)
    newsAt = Date.now()
  }

  function ask(prompt) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--tools', '']
      const p = spawn(CLAUDE_BIN, args, { cwd: CWD, windowsHide: true, env: { ...process.env, CLAUDECODE: '' } })
      let out = '', err = ''
      const timer = setTimeout(() => { p.kill(); reject(new Error('超时')) }, 150000)
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (err += d))
      p.on('error', (e) => { clearTimeout(timer); reject(e) })
      p.on('close', (code) => {
        clearTimeout(timer)
        try {
          const r = JSON.parse(out)
          if (r.is_error) throw new Error(r.result || 'CLI 报错')
          resolve(String(r.result || ''))
        } catch (e) { reject(new Error(`claude 退出码 ${code}：${(err || out || e.message).slice(0, 200)}`)) }
      })
      p.stdin.end(prompt, 'utf8')
    })
  }

  // people: [{ id, name, title }] 当前空闲的同事
  async function maybeGenerate({ onDuty, people }) {
    if (busy || !onDuty || people.length < 2) return
    if (Date.now() - lastGen < GEN_EVERY) return
    busy = true
    try {
      if (Date.now() - newsAt > 15 * 60 * 1000 || !news.length) await refreshNews()
      const fresh = news.filter((n) => !data.seen.includes(n.title)).slice(0, 40)
      if (!fresh.length) return
      const cast = people.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(3, people.length))
      const prompt = [
        '你在为一个 3D 办公室看板写「休息区闲聊」。下面是同事和最新的新闻标题。',
        '1) 从标题里挑一条适合同事之间轻松闲聊的（科技、AI、商业、经济、城市生活、旅游、文化、美食、体育、科学、天气都可以）。',
        '   不要挑：政治与选举、战争与军事、外交冲突、犯罪与案件、伤亡事故、灾难、宗教争议、某个普通人的隐私。没有合适的就输出 {"skip":true}。',
        '2) 让这几位同事针对它用中文聊 4 到 5 句：口语化、每句不超过 40 个字，带一点各自岗位的视角，可以轻松调侃但不刻薄；',
        '   只根据标题本身说话，不编造标题里没有的数字、细节或结论（不确定就用「看标题说…」「不知道细节」这类说法）；不提公司内部机密。',
        '3) 只输出一个 JSON，不要别的文字：{"pick":序号,"topic":"用一句中文概括这条新闻（不超过 30 字）","lines":[{"who":"同事名","text":"……"}]}',
        '',
        '同事：',
        ...cast.map((p) => `- ${p.name}（${p.title || '同事'}）`),
        '',
        '新闻标题：',
        ...fresh.map((n, i) => `${i}. [${n.src}] ${n.title}`),
      ].join('\n')
      const raw = await ask(prompt)
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('没有拿到 JSON')
      const j = JSON.parse(m[0])
      data.seen = [...fresh.map((n) => n.title), ...data.seen].slice(0, 400) // 这一批都算看过，下次换新的
      lastGen = Date.now()
      if (j.skip || !Array.isArray(j.lines)) { save(); log('[gossip] 这批标题没有适合闲聊的'); return }
      const pick = fresh[j.pick] || fresh[0]
      const byName = new Map(cast.map((p) => [p.name, p]))
      const lines = j.lines
        .map((l) => ({ p: byName.get(String(l.who || '').trim()), text: String(l.text || '').trim().slice(0, 80) }))
        .filter((l) => l.p && l.text)
        .slice(0, 6)
        .map((l) => ({ agentId: l.p.id, text: l.text }))
      if (lines.length < 2) { save(); return }
      data.threads.unshift({ id: `g${Date.now()}`, at: new Date().toISOString(), src: pick.src, title: pick.title, link: pick.link, topic: String(j.topic || pick.title).slice(0, 60), cast: cast.map((p) => p.id), lines })
      data.threads = data.threads.slice(0, MAX_THREADS)
      save()
      log(`[gossip] 新话题：${data.threads[0].topic}（${pick.src}）`)
    } catch (e) {
      // 额度用完（429 / session limit）：不要每 5 分钟去撞，歇 1 小时；别的失败 5 分钟后再试
      lastGen = /session limit|429|rate limit/i.test(e.message) ? Date.now() + 45 * 60 * 1000 : Date.now() - GEN_EVERY + 5 * 60 * 1000
      log(`[gossip] 生成失败：${e.message}`)
    } finally {
      busy = false
    }
  }

  return {
    maybeGenerate,
    recent: () => data.threads.slice(0, 5),
  }
}
