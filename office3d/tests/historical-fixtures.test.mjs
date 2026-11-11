import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const base=new URL('./fixtures/historical/',import.meta.url)
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex').toUpperCase()
test('historical baselines retain independently sourced bytes across LF and CRLF checkouts',()=>{
  const entries=JSON.parse(readFileSync(new URL('SOURCES.json',base),'utf8'))
  assert.equal(entries.length,15)
  for(const entry of entries){
    const text=readFileSync(new URL(entry.file,base),'utf8'),lf=text.replace(/\r\n/g,'\n')
    assert.equal(hash(lf),entry.canonicalLfSha256,entry.file)
    assert.equal(hash(lf.replace(/\n/g,'\r\n')),entry.canonicalLfSha256)
    assert.notEqual(hash(lf+'\n// changed'),entry.canonicalLfSha256)
  }
})
