import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CONTROL_ROOM_SPEC } from '../dr-control-room.js'
import { prepareDrPage } from '../dr-place-view.js'
import { resolvePlaceMode } from '../place-mode.js'

test('control room is an explicit opt-in place mode with a return path', () => {
  assert.equal(resolvePlaceMode('?campus=1&place=dr').controlRoom, undefined)
  assert.equal(resolvePlaceMode('?campus=1&place=dr&controlRoom=1').controlRoom, true)
  assert.deepEqual(
    {
      ...resolvePlaceMode('?campus=1&place=dr&controlRoom=1'),
      legacy: false,
    },
    resolvePlaceMode('?place=drlife-warehouse&controlRoom=1'),
  )
  assert.equal(CONTROL_ROOM_SPEC.consoleSeats, 4)
  assert.equal(CONTROL_ROOM_SPEC.camera.az, 0)
  assert.equal(CONTROL_ROOM_SPEC.watermark, '模拟数据 · 示意')
})

test('control room implementation stays local, simulated and disposable', async () => {
  const source = [
    await readFile(new URL('../dr-control-room.js', import.meta.url), 'utf8'),
    await readFile(
      new URL('../dr-control-room-screen.js', import.meta.url),
      'utf8',
    ),
  ].join('\n')
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|\/state|Paperclip|createTask|inventory/i)
  assert.match(source, /CAMBODIA_OUTLINE_D/)
  assert.match(source, /demoSnapshotAt/)
  assert.doesNotMatch(source, /createDemoDisplay/)
  assert.match(source, /root\.removeFromParent\(\)/)
  assert.match(source, /模拟数据 · 示意/)
})

function mockDrDocument() {
  const nodes = {
    connText: { textContent: '' },
    loadText: { textContent: '' },
    drControlRoomLink: { href: '', textContent: '' },
  }
  return {
    title: '',
    body: {
      classList: { add() {} },
      dataset: {},
    },
    querySelector: () => ({ textContent: '' }),
    getElementById: (id) => nodes[id] || null,
    nodes,
  }
}

test('DR page control-room links use the latest canonical warehouse channel', () => {
  const overviewDocument = mockDrDocument()
  prepareDrPage(
    resolvePlaceMode('?place=drlife-warehouse'),
    overviewDocument,
  )
  assert.equal(
    overviewDocument.nodes.drControlRoomLink.href,
    '/?place=drlife-warehouse&controlRoom=1',
  )
  assert.equal(
    overviewDocument.nodes.drControlRoomLink.textContent,
    '进入调度中控室',
  )

  const controlRoomDocument = mockDrDocument()
  prepareDrPage(
    resolvePlaceMode(
      '?place=drlife-warehouse&controlRoom=1',
    ),
    controlRoomDocument,
  )
  assert.equal(
    controlRoomDocument.nodes.drControlRoomLink.href,
    '/?place=drlife-warehouse',
  )
  assert.equal(
    controlRoomDocument.nodes.drControlRoomLink.textContent,
    '返回仓配全景',
  )
})
