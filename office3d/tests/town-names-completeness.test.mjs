// DS-2：office3d/town-names.js 的名称表完整性测试。
// 只加测试，不改被测代码；默认读 ../town-names.js，
// 变异自检时可用 TOWN_NAMES_MODULE 指向系统临时目录里的副本。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const moduleUrl = process.env.TOWN_NAMES_MODULE
  ? pathToFileURL(process.env.TOWN_NAMES_MODULE)
  : new URL('../town-names.js', import.meta.url)
const names = await import(moduleUrl)
const { DEFAULT_LABEL_MODE, LABEL_MODES, KHAN_NAME_MAP, LANDMARK_NAME_MAP } = names

test('LABEL_MODES 恰为 zh / en / km 且已冻结', () => {
  assert.deepEqual([...LABEL_MODES], ['zh', 'en', 'km'])
  assert.equal(Object.isFrozen(LABEL_MODES), true, 'LABEL_MODES 已冻结')
  assert.equal(Object.isExtensible(LABEL_MODES), false, 'LABEL_MODES 不可扩展')
})

test('DEFAULT_LABEL_MODE 是受支持的标签模式之一', () => {
  assert.equal(typeof DEFAULT_LABEL_MODE, 'string')
  assert.ok(DEFAULT_LABEL_MODE.trim().length > 0, 'DEFAULT_LABEL_MODE 非空')
  assert.equal(LABEL_MODES.includes(DEFAULT_LABEL_MODE), true, 'DEFAULT_LABEL_MODE 属于 LABEL_MODES')
})

test('KHAN_NAME_MAP 共 14 项，键都以 "Khan " 开头且唯一', () => {
  const keys = Object.keys(KHAN_NAME_MAP)
  assert.equal(keys.length, 14, '可汗区共 14 项')
  assert.equal(new Set(keys).size, keys.length, '键唯一')
  for (const key of keys) {
    assert.equal(key.startsWith('Khan '), true, `${key} 以 "Khan " 开头`)
    assert.equal(key, key.trim(), `${key} 无首尾空格`)
  }
})

test('每个可汗区都有非空且互不重复的 zh / en', () => {
  const entries = Object.entries(KHAN_NAME_MAP)
  const zh = []
  const en = []
  for (const [key, value] of entries) {
    assert.equal(typeof value, 'object', `${key} 的值是对象`)
    assert.equal(typeof value.zh, 'string', `${key}.zh 是字符串`)
    assert.equal(typeof value.en, 'string', `${key}.en 是字符串`)
    assert.ok(value.zh.trim().length > 0, `${key}.zh 非空`)
    assert.ok(value.en.trim().length > 0, `${key}.en 非空`)
    assert.equal(value.zh, value.zh.trim(), `${key}.zh 无首尾空格`)
    assert.equal(value.en, value.en.trim(), `${key}.en 无首尾空格`)
    zh.push(value.zh)
    en.push(value.en)
  }
  assert.equal(new Set(zh).size, entries.length, 'zh 值互不重复')
  assert.equal(new Set(en).size, entries.length, 'en 值互不重复')
})

test('KHAN_NAME_MAP 本身与每个子对象都已冻结', () => {
  assert.equal(Object.isFrozen(KHAN_NAME_MAP), true, '名称表已冻结')
  assert.equal(Object.isExtensible(KHAN_NAME_MAP), false, '名称表不可扩展')
  for (const [key, value] of Object.entries(KHAN_NAME_MAP)) {
    assert.equal(Object.isFrozen(value), true, `${key} 子对象已冻结`)
  }
})

test('LANDMARK_NAME_MAP 已冻结，键无首尾空格、值都是非空字符串', () => {
  assert.equal(Object.isFrozen(LANDMARK_NAME_MAP), true, '地标表已冻结')
  const entries = Object.entries(LANDMARK_NAME_MAP)
  assert.ok(entries.length > 0, '地标表非空')
  for (const [key, value] of entries) {
    assert.equal(key, key.trim(), `${key} 键无首尾空格`)
    assert.equal(typeof value, 'string', `${key} 的值是字符串`)
    assert.ok(value.trim().length > 0, `${key} 的值非空`)
    assert.equal(value, value.trim(), `${key} 的值无首尾空格`)
  }
})

test('模块导出函数（当前没有）对未知键不会抛错或返回空值', () => {
  const fns = Object.entries(names).filter(([, value]) => typeof value === 'function')
  assert.ok(Array.isArray(fns), '函数导出可枚举')
  assert.equal(fns.length, 0, '当前 town-names.js 没有函数导出；若将来新增，请扩展本用例')
  for (const [name, fn] of fns) {
    for (const key of ['', '__missing__', 'Khan Missing', 'Not A Landmark']) {
      let out
      assert.doesNotThrow(() => { out = fn(key) }, `${name}(${JSON.stringify(key)}) 不抛错`)
      assert.notEqual(out, undefined, `${name} 对未知键不返回 undefined`)
      assert.notEqual(out, null, `${name} 对未知键不返回 null`)
      assert.notEqual(out, '', `${name} 对未知键不返回空串`)
    }
  }
})

test('导出对象不可被修改：赋值与增删键都按当前行为被拒绝', () => {
  // ESM 命名空间属性只读
  assert.throws(() => { names.KHAN_NAME_MAP = {} }, TypeError, '不能替换命名空间导出')
  // 冻结对象在严格模式下写入抛 TypeError
  assert.throws(() => { KHAN_NAME_MAP['Khan Kamboul'].zh = '改名' }, TypeError, '不能改子对象')
  assert.throws(() => { KHAN_NAME_MAP['Khan New'] = Object.freeze({ zh: '新', en: 'New' }) }, TypeError, '不能新增键')
  assert.throws(() => { delete KHAN_NAME_MAP['Khan Kamboul'] }, TypeError, '不能删除键')
  assert.throws(() => { LANDMARK_NAME_MAP['Royal Palace'] = '改' }, TypeError, '不能改地标值')
  assert.throws(() => { LABEL_MODES.push('fr') }, TypeError, '不能扩展 LABEL_MODES')
  // 拒绝之后原值保持不变
  assert.equal(KHAN_NAME_MAP['Khan Kamboul'].zh, '甘布区')
  assert.equal(LANDMARK_NAME_MAP['Royal Palace'], '金边王宫')
  assert.deepEqual([...LABEL_MODES], ['zh', 'en', 'km'])
})
