import path from 'node:path'
import { truncate } from './text.js'

export function shortPath(p, workdir) {
  if (!p) return ''
  let r = String(p)
  if (workdir && r.startsWith(workdir)) r = path.relative(workdir, r) || r
  return truncate(r, 48)
}

const BROWSER_ZH = {
  browser_navigate: (a) => `打开网页 ${truncate(a.url, 40)}`,
  browser_navigate_back: () => '网页后退',
  browser_click: (a) => `点 ${truncate(a.element || a.ref, 30)}`,
  browser_type: (a) => `输入 “${truncate(a.text, 24)}”`,
  browser_fill_form: () => '填表单',
  browser_select_option: (a) => `选择 ${truncate([].concat(a.values || []).join('、'), 24)}`,
  browser_press_key: (a) => `按 ${a.key}`,
  browser_hover: (a) => `悬停 ${truncate(a.element, 30)}`,
  browser_snapshot: () => '看网页内容',
  browser_take_screenshot: () => '网页截图',
  browser_wait_for: () => '等网页加载',
  browser_tabs: () => '切换标签页',
  browser_close: () => '关掉浏览器',
  browser_evaluate: () => '在网页里跑脚本',
  browser_file_upload: () => '上传文件',
  browser_install: () => '安装浏览器',
  browser_console_messages: () => '看网页控制台',
  browser_network_requests: () => '看网络请求',
  browser_resize: () => '调整窗口大小',
  browser_drag: () => '在网页里拖动',
  browser_handle_dialog: () => '处理弹窗',
}
const DESKTOP_ZH = {
  screenshot: () => '看屏幕',
  click: (a) => `${a.double ? '双击' : a.button === 'right' ? '右键点' : '点击'}屏幕 (${a.x}, ${a.y})`,
  move: (a) => `移动鼠标到 (${a.x}, ${a.y})`,
  drag: () => '拖动鼠标',
  scroll: (a) => `滚动${{ up: '上', down: '下', left: '左', right: '右' }[a.direction] || ''}`,
  type: (a) => `打字 “${truncate(a.text, 24)}”`,
  key: (a) => `按 ${a.keys}`,
  open: (a) => `打开 ${truncate(a.target, 30)}`,
  wait: () => '等一下',
}

export function describeMcpCall(server, tool, args = {}) {
  const s = String(server || '')
  const a = args && typeof args === 'object' ? args : {}
  try {
    if (/browser|playwright/i.test(s) && BROWSER_ZH[tool]) return BROWSER_ZH[tool](a)
    if (/desktop/i.test(s) && DESKTOP_ZH[tool]) return DESKTOP_ZH[tool](a)
  } catch {}
  return `用插件 ${s}.${tool}`
}

export function splitMcpName(name) {
  const m = String(name || '').match(/^mcp__(.+?)__(.+)$/)
  return m ? { server: m[1], tool: m[2] } : null
}

function cleanCmd(cmd) {
  if (Array.isArray(cmd)) cmd = cmd.join(' ')
  cmd = String(cmd || '').trim()
  const sh = cmd.match(/^(?:\S*\/)?(?:bash|zsh|sh)\s+-l?c\s+(['"])([\s\S]*)\1$/)
  if (sh) return sh[2]
  const ps = cmd.match(/-Command\s+(['"]?)([\s\S]*)\1$/i)
  if (ps) return ps[2]
  return cmd
}

export function describeClaudeTool(name, input = {}, workdir) {
  const p = shortPath(input.file_path || input.notebook_path || input.path, workdir)
  switch (name) {
    case 'Read': return `读 ${p}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': return `改 ${p}`
    case 'Write': return `写 ${p}`
    case 'Bash': {
      const c = cleanCmd(input.command).split('\n')[0]
      return `跑 ${truncate(c.length <= 50 || !input.description ? c : input.description, 60)}`
    }
    case 'Grep': return `搜 “${truncate(input.pattern, 30)}”`
    case 'Glob': return `找文件 ${truncate(input.pattern, 30)}`
    case 'WebSearch': return `上网查 ${truncate(input.query, 40)}`
    case 'WebFetch': return `看网页 ${truncate(input.url, 40)}`
    case 'TodoWrite': return '列待办清单'
    case 'Task':
    case 'Agent': return `叫了个帮手：${truncate(input.description, 30)}`
    case 'ToolSearch': return '翻工具柜'
    default: {
      const mcp = splitMcpName(name)
      return mcp ? describeMcpCall(mcp.server, mcp.tool, input) : `用工具 ${name}`
    }
  }
}
