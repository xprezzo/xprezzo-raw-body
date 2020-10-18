const assert = require('assert')
const Readable = require('readable-stream').Readable
const Writable = require('readable-stream').Writable

const getRawBody = require('..')

const defaultLimit = 1024 * 1024

// Add Promise to mocha's global list
// eslint-disable-next-line no-self-assign
global.Promise = global.Promise

describe('stream flowing', () => {
  describe('when limit lower then length', (done) => {
    it('should stop the steam flow', (done) => {
      const stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit,
        length: defaultLimit * 2
      }, (err, body) => {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.message, 'request entity too large')
        assert.strictEqual(err.statusCode, 413)
        assert.strictEqual(err.length, defaultLimit * 2)
        assert.strictEqual(err.limit, defaultLimit)
        assert.strictEqual(body, undefined)
        assert.ok(stream.isPaused)

        done()
      })
    })

    it('should halt flowing stream', (done) => {
      const stream = createInfiniteStream(true)
      const dest = createBlackholeStream()

      // pipe the stream
      stream.pipe(dest)

      getRawBody(stream, {
        limit: defaultLimit * 2,
        length: defaultLimit
      }, (err, body) => {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.message, 'request entity too large')
        assert.strictEqual(err.statusCode, 413)
        assert.strictEqual(body, undefined)
        assert.ok(stream.isPaused)
        done()
      })
    })
  })

  describe('when stream has encoding set', (done) => {
    it('should stop the steam flow', (done) => {
      const stream = createInfiniteStream()
      stream.setEncoding('utf8')

      getRawBody(stream, {
        limit: defaultLimit
      }, (err, body) => {
        assert.ok(err)
        assert.strictEqual(err.type, 'stream.encoding.set')
        assert.strictEqual(err.message, 'stream encoding should not be set')
        assert.strictEqual(err.statusCode, 500)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', (done) => {
    it('should stop the steam flow', (done) => {
      const stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit
      }, (err, body) => {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.statusCode, 413)
        assert.ok(err.received > defaultLimit)
        assert.strictEqual(err.limit, defaultLimit)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', (done) => {
    it('should stop the steam flow', (done) => {
      const stream = createInfiniteStream()

      getRawBody(stream, (err, body) => {
        assert.ok(err)
        assert.strictEqual(err.message, 'BOOM')
        assert.ok(stream.isPaused)

        done()
      })

      setTimeout(() => {
        stream.emit('error', new Error('BOOM'))
      }, 500)
    })
  })
})

const repeat = (str, num) => {
  return new Array(num + 1).join(str)
}

const createChunk = () => {
  const base = Math.random().toString(32)
  const KB_4 = 32 * 4
  const KB_8 = KB_4 * 2
  const KB_16 = KB_8 * 2
  const KB_64 = KB_16 * 4

  const rand = Math.random()
  if (rand < 0.25) {
    return repeat(base, KB_4)
  } else if (rand < 0.5) {
    return repeat(base, KB_8)
  } else if (rand < 0.75) {
    return repeat(base, KB_16)
  } else {
    return repeat(base, KB_64)
  }
}

const createBlackholeStream = () => {
  const stream = new Writable()
  stream._write = (chunk, encoding, cb) => {
    cb()
  }

  return stream
}

const createInfiniteStream = (paused) => {
  const stream = new Readable()
  stream._read = () => {
    const rand = 2 + Math.floor(Math.random() * 10)

    setTimeout(() => {
      for (let i = 0; i < rand; i++) {
        stream.push(createChunk())
      }
    }, 100)
  }

  // track paused state for tests
  stream.isPaused = false
  stream.on('pause', function () { this.isPaused = true })
  stream.on('resume', function () { this.isPaused = false })

  // immediately put the stream in flowing mode
  if (!paused) {
    stream.resume()
  }

  return stream
}
