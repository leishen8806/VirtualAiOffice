import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isWin } from '../../../packages/executors/runtime/process.js'
export function npx(pkg, extra = []) {
  return isWin ? { command: 'cmd', args: ['/c', 'npx', '-y', pkg, ...extra] } : { command: 'npx', args: ['-y', pkg, ...extra] }
}
export function builtinTools(here = null, homeOs = process) {
  const HERE = here || path.dirname(fileURLToPath(import.meta.url))
  const headless = homeOs.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
  const out = path.join(homeOs.homedir ? homeOs.homedir() : os.homedir(), '.niuma', 'browser')
  const desktopScript = path.resolve(HERE, '..', '..', '..', 'src', 'mcp', 'desktop.js')
  return {
    browser: {
      name: '浏览器',
      server: 'niuma_browser',
      description: '真的打开一个浏览器：打开网址、点按钮、填表单、读网页内容、截图。适合测试自己做的网页、在网站上查资料或办事、网页自动化。',
      keywords: ['浏览器', '网页', '网站', '网址', 'http', '打开网', '点击', '表单', '登录', '截图', '爬', 'browser'],
      ...npx('@playwright/mcp@latest', ['--output-dir', out, '--allow-unrestricted-file-access', ...(headless ? ['--headless'] : [])]),
    },
    desktop: {
      name: '电脑操作',
      server: 'niuma_desktop',
      description: '看电脑屏幕截图、移动鼠标、点击、打字、按快捷键、打开软件。适合操作没有命令行的桌面软件（办公软件、聊天软件、设计软件等）。会接管主人的鼠标键盘，能用命令行或浏览器解决的就不要用它。',
      keywords: ['桌面', '电脑', '屏幕', '鼠标', '键盘', '软件', '微信', 'excel', 'word', 'ppt', '剪映', 'photoshop', '记事本', '窗口'],
      command: process.execPath,
      args: [desktopScript],
      env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
      vision: true,
      takesOver: true,
    },
  }
}
