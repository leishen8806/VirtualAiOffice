// collab-graph.js 纯函数测试。
// collab-graph.js 是浏览器模块（.js，目录无 package.json，Node 默认按 CJS 解释），
// 因此用「读源码 → data: URL 动态 import」的方式在 Node 里作为 ESM 加载，与浏览器行为一致（同 replay.test.mjs）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../collab-graph.js', import.meta.url), 'utf8')
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
const {
  layoutGroups,
  edgeWidth,
  edgeTitle,
  focusNode,
  edgeKey,
  GROUP_ORDER,
  GROUP_LABEL,
  GROUP_COLOR,
  LAYOUT_CELL,
  EDGE_WIDTH_MIN,
  EDGE_WIDTH_MAX,
  COLLAB_KINDS,
  KIND_LABEL,
  EMPTY_NOTE,
  DISCLAIMER,
  pnhHHMM,
  partialTodayPill,
  oneToOneLabel,
} = mod

const node = (id, group) => ({ id, group, name: id })

test('布局分组：每格一个房间，节点不越界；分组名与色板沿 collab.mjs / office-layout.js', () => {
  const nodes = [
    node('Lead', 'product'), node('PM', 'product'), node('UIUX', 'product'), node('Architect', 'product'),
    node('FrontendSenior', 'eng'), node('Backend1', 'eng'), node('Backend2', 'eng'),
    node('Reviewer1', 'quality'), node('QA', 'quality'),
    node('GoSenior', 'drlife'), node('DBEngineer', 'drlife'), node('Localizer', 'drlife'),
    node('OpsLead', 'ops'), node('KnowledgeKeeper', 'kb'), node('board', 'board'),
  ]
  assert.deepEqual(GROUP_ORDER, ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'board'])
  assert.equal(GROUP_LABEL.eng, '工程')
  assert.equal(GROUP_LABEL.board, '董事会')
  assert.equal(GROUP_COLOR.board, '#ffb020')
  assert.equal(COLLAB_KINDS.length, 3)
  assert.equal(KIND_LABEL.dispatch, '派单')
  const { points, width, height } = layoutGroups(nodes)
  assert.equal(width, LAYOUT_CELL.cols * LAYOUT_CELL.w)
  assert.equal(height, 2 * LAYOUT_CELL.h)
  for (const p of points) {
    assert.ok(p.x >= 0 && p.x < width, `${p.id} 越界 x=${p.x}`)
    assert.ok(p.y >= 0 && p.y < height, `${p.id} 越界 y=${p.y}`)
  }
  const byId = new Map(points.map((p) => [p.id, p]))
  // 同组落在同一房间里（product 第 1 格 / eng 第 2 格）
  for (const id of ['Lead', 'PM', 'UIUX', 'Architect']) {
    assert.ok(byId.get(id).x < LAYOUT_CELL.w, `${id} 不在 product 房间`)
    assert.ok(byId.get(id).y < LAYOUT_CELL.h, `${id} 不在 product 房间行`)
  }
  for (const id of ['FrontendSenior', 'Backend1', 'Backend2']) {
    assert.ok(byId.get(id).x >= LAYOUT_CELL.w && byId.get(id).x < 2 * LAYOUT_CELL.w, `${id} 不在 eng 房间`)
  }
})

test('布局是确定的：相同输入得到相同坐标', () => {
  const nodes = [node('Lead', 'product'), node('Backend1', 'eng'), node('board', 'board'), node('X', '_weird')]
  const a = layoutGroups(nodes), b = layoutGroups(nodes)
  assert.deepEqual(a, b) // 未知分组不抛错，兜底到可用格
})

test('边宽：count 取 2 的对数缩放，上限封顶；1 条边最细', () => {
  assert.equal(edgeWidth(1), EDGE_WIDTH_MIN)
  assert.equal(edgeWidth(0), EDGE_WIDTH_MIN)
  assert.equal(edgeWidth(undefined), EDGE_WIDTH_MIN)
  assert.equal(edgeWidth(16), EDGE_WIDTH_MAX) // 1.5 + 2*log2(16)=9.5 → 封顶 9
  assert.equal(edgeWidth(1000), EDGE_WIDTH_MAX)
  assert.ok(edgeWidth(2) > edgeWidth(1))
  assert.ok(edgeWidth(4) > edgeWidth(2))
  assert.equal(EDGE_WIDTH_MIN, 1.5)
  assert.equal(EDGE_WIDTH_MAX, 9)
})

test('悬停文字：A → B：派单 x · 汇报 y · 互动 z（只显示数字）', () => {
  const e = { from: 'Lead', to: 'Backend1', count: 6, dispatch: 2, report: 3, speak: 1 }
  assert.equal(edgeTitle(e, { Lead: '苏晨', Backend1: '阿峰' }), '苏晨 → 阿峰：派单 2 · 汇报 3 · 互动 1')
  // 名称表缺省回退岗位 id；反向边是独立键
  assert.equal(edgeTitle({ from: 'A', to: 'B', dispatch: 1, report: 0, speak: 0 }), 'A → B：派单 1 · 汇报 0 · 互动 0')
  assert.equal(edgeKey({ from: 'A', to: 'B' }), 'A→B')
  assert.notEqual(edgeKey({ from: 'A', to: 'B' }), edgeKey({ from: 'B', to: 'A' }))
  // 输出里没有事件正文：text 字段完全不被用到
  const withText = { from: 'A', to: 'B', dispatch: 1, report: 0, speak: 0, text: '机密内容' }
  assert.ok(!edgeTitle(withText, {}).includes('机密内容'))
})

test('点击高亮：返回命中的边与右侧对象列表（入/出/合计，按合计降序）', () => {
  const edges = [
    { from: 'A', to: 'B', count: 2, dispatch: 2, report: 0, speak: 0 },
    { from: 'A', to: 'C', count: 1, dispatch: 0, report: 1, speak: 0 },
    { from: 'B', to: 'A', count: 3, dispatch: 0, report: 3, speak: 0 },
    { from: 'D', to: 'E', count: 9, dispatch: 9, report: 0, speak: 0 },
  ]
  const f = focusNode('A', edges)
  assert.deepEqual(f.edgeIds, ['A→B', 'A→C', 'B→A']) // 全部命中边，含反向
  assert.equal(f.rows.length, 2)
  // B：A→B 出去 2 + B→A 进来 3 = 5；C：出去 1 → 排序 B 在前
  assert.deepEqual(f.rows, [
    { id: 'B', from: 2, to: 3, total: 5 },
    { id: 'C', from: 1, to: 0, total: 1 },
  ])
})

test('点击高亮边界：无边的岗位 / 空边数组', () => {
  assert.deepEqual(focusNode('X', []), { edgeIds: [], rows: [] })
  const edges = [{ from: 'A', to: 'B', count: 4, dispatch: 4, report: 0, speak: 0 }]
  assert.deepEqual(focusNode('C', edges), { edgeIds: [], rows: [] })
  assert.equal(EMPTY_NOTE, '账本里还没有足够的协作记录')
  assert.equal(DISCLAIMER, '仅反映有记录的协作事件，不代表工作量或贡献')
})

test('T12b 窗口说明：金边时刻 hh:mm 与「含今天」pill（UTC 17:00 后属金边次日）', () => {
  assert.equal(pnhHHMM(Date.parse('2026-10-20T02:40:00Z')), '09:40') // UTC 02:40 = 金边 09:40
  assert.equal(pnhHHMM(Date.parse('2026-10-20T16:59:59Z')), '23:59') // 金边 23:59 当天
  assert.equal(pnhHHMM(Date.parse('2026-10-20T17:05:00Z')), '00:05') // UTC 17:00 后 → 金边次日 00:05
  assert.equal(partialTodayPill('09:40'), '含今天（截至 09:40）')
})

test('T12b 一对一依赖标题：阈值从接口数据读，不写死两处', () => {
  assert.equal(oneToOneLabel({ oneToOneShare: 0.8, minOutForOneToOne: 5 }), '一对一依赖（出边 ≥5 次且 ≥80% 指向同一对象）')
  assert.equal(oneToOneLabel({ oneToOneShare: 1, minOutForOneToOne: 5 }), '一对一依赖（出边 ≥5 次且 ≥100% 指向同一对象）')
  // 接口未给 / 阈值非法时退化为不含数字的通用标题
  assert.equal(oneToOneLabel(null), '一对一依赖')
  assert.equal(oneToOneLabel({}), '一对一依赖')
  assert.equal(oneToOneLabel({ oneToOneShare: -1, minOutForOneToOne: 5 }), '一对一依赖')
  assert.equal(oneToOneLabel({ oneToOneShare: 0.8, minOutForOneToOne: NaN }), '一对一依赖')
})