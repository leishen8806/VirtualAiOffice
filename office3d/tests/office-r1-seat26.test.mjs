import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { R1_DATA, C01_DELTA } from '../office-r1/data.js'
import { createR1Layout, R1_BOARD_ADDED_WORKSTATIONS } from '../office-r1-layout.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_SEATED_PROFILES, r1ScreenAtlasSize } from '../office-vis2/r1-furniture.js'
import { R1_SEAT_TRANSITIONS, createR1Navigation } from '../office-r1-navigation.js'
import { createR1RuntimeLayout, R1_ADDED_AVATARS } from '../office-r1-seating.js'

test('S26 preserves original 25 and assigns five distinct registered empty desks', () => {
  assert.equal(R1_DATA.workstations.length, 25)
  assert.equal(R1_BOARD_ADDED_WORKSTATIONS.length, 5)
  assert.ok(Object.isFrozen(R1_BOARD_ADDED_WORKSTATIONS))
  for (const candidateC01 of [false, true]) {
    const original = candidateC01 ? C01_DELTA.workstations.reduce((rows, d) => rows.map(r => r.business_id === d.businessId ? d.candidate : r), R1_DATA.workstations) : R1_DATA.workstations
    const layout = createR1Layout({ candidateC01 })
    assert.deepEqual(layout.workstations.slice(0, 25), original)
    for (const field of ['business_id', 'desk_id', 'chair_id']) assert.equal(new Set(layout.workstations.map(s => s[field])).size, 30)
    for (const added of layout.workstations.slice(25)) {
      assert.equal(added.date, '2026-10-30')
      assert.ok(Object.isFrozen(added))
      assert.ok(!['08-T-011','08-T-012','08-T-013'].includes(added.desk_id))
      for (const [id, x, y] of [[added.desk_id, added.xM, added.yM], [added.chair_id, added.chairXM, added.chairYM]]) {
        const row = layout.elements.find(e => e.id === id)
        assert.ok(row, id); assert.equal(row.xM, x); assert.equal(row.yM, y)
        assert.ok(!original.some(s => s.desk_id === id || s.chair_id === id))
      }
    }
  }
  const data = readFileSync(new URL('../office-r1/data.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(createHash('sha256').update(data).digest('hex'), 'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf')
})

test('S26 actual count drives seats, six by six atlas, profiles, avatars and fixed exits', () => {
  const layout = createOfficeR1Layout()
  assert.equal(Object.keys(layout.seats).length, 30)
  assert.equal(Object.keys(R1_SEATED_PROFILES).length, layout.r1.workstations.length)
  assert.deepEqual(r1ScreenAtlasSize(30), { columns: 6, rows: 6, width: 2560, height: 1440 })
  assert.deepEqual(R1_ADDED_AVATARS, { Reviewer3:'Female_Adult_13', SecurityReviewer2:'Female_Adult_17', Lead2:'Business_Male_06', GoSenior2:'Business_Male_07', React2:'Male_Adult_20' })
  for (const s of layout.r1.workstations.slice(25)) {
    const seat = layout.seats[s.business_id], profile = R1_SEATED_PROFILES[s.business_id]
    assert.deepEqual(R1_SEAT_TRANSITIONS[s.business_id].home, [seat[4].x, seat[4].z, seat[4].yaw])
    assert.ok(profile.motions.length >= 2 && profile.motions.some(m => m.startsWith('neutral')))
    assert.ok(profile.seat >= -.04 && profile.seat <= .08)
    assert.ok(profile.handY >= .75 && profile.handY <= .85)
  }
})

test('S26 automatic fallback uses only same-department empty desks, preserves frozen seats and serializes to worker', () => {
  const base = createOfficeR1Layout(), before = JSON.stringify(base), runtime = createR1RuntimeLayout(base)
  assert.equal(createR1RuntimeLayout({r1Phase:'L2B'}).r1Phase,'L2B')
  const agents = [{name:'Reviewer4'},{name:'Lead3'},{name:'GoSenior3'},{name:'Extra',title:'安全审查员'},{name:'Reviewer3'}]
  const added = runtime.assignAgents(agents)
  assert.equal(added.length,4)
  assert.deepEqual(added.map(s=>s.zone),['06','04','08','06'])
  assert.equal(runtime.assignAgents(agents).length,0)
  assert.equal(new Set(runtime.r1.workstations.map(s=>s.desk_id)).size,34)
  assert.deepEqual(runtime.r1.workstations.slice(0,30),base.r1.workstations)
  assert.deepEqual(Object.entries(runtime.seats).slice(0,30),Object.entries(base.seats))
  assert.equal(JSON.stringify(base),before)
  for(const s of added) {
    assert.ok(!['08-T-011','08-T-012','08-T-013'].includes(s.desk_id))
    const seat=runtime.seats[s.business_id], dx=seat[1]-seat[4].x,dz=seat[2]-seat[4].z
    assert.ok(-Math.sin(seat[4].yaw)*dx-Math.cos(seat[4].yaw)*dz>0)
  }
  assert.equal(structuredClone(runtime).r1.workstations.length,34)
  runtime.assignAgents(Array.from({length:80},(_,i)=>({name:`ReviewerAuto${i}`})))
  assert.ok(runtime.unseated.size>0)
  assert.equal(new Set(runtime.r1.workstations.map(s=>s.desk_id)).size,runtime.r1.workstations.length)
})


test('S26 refreshed navigation uses a new snapshot after an automatic seat is added', () => {
  const runtime=createR1RuntimeLayout(createOfficeR1Layout()), before=createR1Navigation(runtime)
  runtime.assignAgents([{name:'Reviewer4'}])
  const after=createR1Navigation({...runtime})
  assert.equal(before.stations.size,30);assert.equal(after.stations.size,31)
  assert.ok(after.stations.has('Reviewer4'))
  const director=readFileSync(new URL('../office-r1-director.js',import.meta.url),'utf8')
  assert.match(director,/nav = createR1Navigation\(\{ \.\.\.layout \}\)/)
})
