const assert = require('assert')
const fs = require('fs')
const getRawBody = require('..')
const path = require('path')

const Buffer = require('xprezzo-buffer').Buffer
const EventEmitter = require('events').EventEmitter
const Promise = global.Promise || require('bluebird')
const Readable = require('readable-stream').Readable

const file = path.join(__dirname, 'index.js')
const length = fs.statSync(file).size
const string = fs.readFileSync(file, 'utf8')

// Add Promise to mocha's global list
// eslint-disable-next-line no-self-assign
global.Promise = global.Promise

describe('Raw Body', () => {
  it('should work without any options', (done) => {
    getRawBody(createStream(), (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with `true` as an option', (done) => {
    getRawBody(createStream(), true, (err, buf) => {
      assert.ifError(err)
      assert.strictEqual(typeof buf, 'string')
      done()
    })
  })

  it('should error for bad callback', () => {
    assert.throws( () => {
      getRawBody(createStream(), true, 'silly')
    }, /argument callback.*function/)
  })

  it('should work with length', (done) => {
    getRawBody(createStream(), {
      length: length
    }, (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work when length=0', (done) => {
    let stream = new EventEmitter()

    getRawBody(stream, {
      length: 0,
      encoding: true
    }, (err, str) => {
      assert.ifError(err)
      assert.strictEqual(str, '')
      done()
    })

    process.nextTick( () => {
      stream.emit('end')
    })
  })

  it('should work with limit', (done) => {
    getRawBody(createStream(), {
      limit: length + 1
    }, (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with limit as a string', (done) => {
    getRawBody(createStream(), {
      limit: '1gb'
    }, (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with limit and length', (done) => {
    getRawBody(createStream(), {
      length: length,
      limit: length + 1
    }, (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should check options for limit and length', (done) => {
    getRawBody(createStream(), {
      length: length,
      limit: length - 1
    }, (err, buf) => {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.statusCode, 413)
      assert.strictEqual(err.expected, length)
      assert.strictEqual(err.length, length)
      assert.strictEqual(err.limit, length - 1)
      assert.strictEqual(err.type, 'entity.too.large')
      assert.strictEqual(err.message, 'request entity too large')
      done()
    })
  })

  it('should work with an empty stream', (done) => {
    let stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 0,
      limit: 1
    }, (err, buf) => {
      assert.ifError(err)
      assert.strictEqual(buf.length, 0)
      done()
    })

    stream.emit('end')
  })

  it('should throw on empty string and incorrect length', (done) => {
    let stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 1,
      limit: 2
    }, (err, buf) => {
      assert.strictEqual(err.status, 400)
      done()
    })

    stream.emit('end')
  })

  it('should throw if length > limit', (done) => {
    getRawBody(createStream(), {
      limit: length - 1
    }, (err, buf) => {
      assert.strictEqual(err.status, 413)
      done()
    })
  })

  it('should throw if incorrect length supplied', (done) => {
    getRawBody(createStream(), {
      length: length - 1
    }, (err, buf) => {
      assert.strictEqual(err.status, 400)
      done()
    })
  })

  it('should work with if length is null', (done) => {
    getRawBody(createStream(), {
      length: null,
      limit: length + 1
    }, (err, buf) => {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with {"test":"å"}', (done) => {
    // https://github.com/visionmedia/express/issues/1816

    let stream = new Readable()
    stream.push('{"test":"å"}')
    stream.push(null)

    getRawBody(stream, {
      length: 13
    }, (err, buf) => {
      if (err) return done(err)
      assert.ok(buf)
      assert.strictEqual(buf.length, 13)
      done()
    })
  })

  it('should throw if stream encoding is set', (done) => {
    let stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)
    stream.setEncoding('utf8')

    getRawBody(stream, (err, buf) => {
      assert.strictEqual(err.status, 500)
      done()
    })
  })

  it('should throw when given an invalid encoding', (done) => {
    let stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)

    getRawBody(stream, 'akljsdflkajsdf', (err) => {
      assert.ok(err)
      assert.strictEqual(err.message, 'specified encoding unsupported')
      assert.strictEqual(err.status, 415)
      assert.strictEqual(err.type, 'encoding.unsupported')
      done()
    })
  })

  describe('with global Promise', () => {
    before( () => {
      global.Promise = Promise
    })

    after( () => {
      global.Promise = undefined
    })

    it('should work as a promise', () => {
      return getRawBody(createStream())
        .then(checkBuffer)
    })

    it('should work as a promise when length > limit', () => {
      return getRawBody(createStream(), {
        length: length,
        limit: length - 1
      }).then(throwExpectedError, (err) => {
        assert.strictEqual(err.status, 413)
      })
    })
  })

  describe('without global Promise', () => {
    before( () => {
      global.Promise = undefined
    })

    after( () => {
      global.Promise = Promise
    })

    it('should error without callback', () => {
      assert.throws( () => {
        getRawBody(createStream())
      }, /argument callback.*required/)
    })

    it('should work with callback as second argument', (done) => {
      getRawBody(createStream(), (err, buf) => {
        assert.ifError(err)
        checkBuffer(buf)
        done()
      })
    })

    it('should work with callback as third argument', (done) => {
      getRawBody(createStream(), true, (err, str) => {
        assert.ifError(err)
        checkString(str)
        done()
      })
    })
  })

  describe('when an encoding is set', () => {
    it('should return a string', (done) => {
      getRawBody(createStream(), {
        encoding: 'utf-8'
      },  (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should handle encoding true as utf-8', (done) => {
      getRawBody(createStream(), {
        encoding: true
      }, (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should handle encoding as options string', (done) => {
      getRawBody(createStream(), 'utf-8', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode codepage string', (done) => {
      let stream = createStream(Buffer.from('bf43f36d6f20657374e1733f', 'hex'))
      let string = '¿Cómo estás?'
      getRawBody(stream, 'iso-8859-1', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-8 string', (done) => {
      let stream = createStream(Buffer.from('c2bf43c3b36d6f20657374c3a1733f', 'hex'))
      let string = '¿Cómo estás?'
      getRawBody(stream, 'utf-8', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (LE BOM)', (done) => {
      // BOM makes this LE
      let stream = createStream(Buffer.from('fffebf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      let string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (BE BOM)', (done) => {
      // BOM makes this BE
      let stream = createStream(Buffer.from('feff00bf004300f3006d006f002000650073007400e10073003f', 'hex'))
      let string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16LE string', (done) => {
      // UTF-16LE is different from UTF-16 due to BOM behavior
      let stream = createStream(Buffer.from('bf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      let string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16le', (err, str) => {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should correctly calculate the expected length', (done) => {
      let stream = createStream(Buffer.from('{"test":"å"}'))

      getRawBody(stream, {
        encoding: 'utf-8',
        length: 13
      }, done)
    })
  })

  it('should work on streams1 stream', (done) => {
    let stream = new EventEmitter()

    getRawBody(stream, {
      encoding: true,
      length: 19
    }, (err, value) => {
      assert.ifError(err)
      assert.strictEqual(value, 'foobar,foobaz,yay!!')
      done()
    })

    process.nextTick( () => {
      stream.emit('data', 'foobar,')
      stream.emit('data', 'foobaz,')
      stream.emit('data', 'yay!!')
      stream.emit('end')
    })
  })
})

const checkBuffer = (buf) => {
  assert.ok(Buffer.isBuffer(buf))
  assert.strictEqual(buf.length, length)
  assert.strictEqual(buf.toString('utf8'), string)
}

const checkString = (str) => {
  assert.ok(typeof str === 'string')
  assert.strictEqual(str, string)
}

const createStream = (buf) => {
  if (!buf) return fs.createReadStream(file)

  let stream = new Readable()
  stream._read = () => {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}

const throwExpectedError = () => {
  throw new Error('expected error')
}
