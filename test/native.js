const assert = require('assert')
const Buffer = require('xprezzo-buffer').Buffer
const getRawBody = require('..')
const Readable = require('stream').Readable
const run = Readable ? describe : describe.skip

run('using native streams', () => {
  it('should read contents', (done) => {
    let stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, (err, buf) => {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'hello, streams!')
      done()
    })
  })

  it('should read pre-buffered contents', (done) => {
    let stream = createStream(Buffer.from('hello, streams!'))
    stream.push('oh, ')

    getRawBody(stream, (err, buf) => {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'oh, hello, streams!')
      done()
    })
  })

  it('should stop the stream on limit', (done) => {
    let stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, { limit: 2 }, (err, buf) => {
      assert.ok(err)
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.limit, 2)
      process.nextTick(done)
    })
  })
})

const createStream = (buf) => {
  let stream = new Readable()
  stream._read = () => {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}
