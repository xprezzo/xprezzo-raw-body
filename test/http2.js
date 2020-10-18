const assert = require('assert')
const getRawBody = require('..')
const tryRequire = (module) => {
  try {
    return require(module)
  } catch (e) {
    return undefined
  }
}
const http2 = tryRequire('http2')
const net = require('net')

const describeHttp2 = !http2
  ? describe.skip
  : describe

describeHttp2('using http2 streams', () => {
  it('should read body streams', (done) => {
    const server = http2.createServer((req, res) => {
      getRawBody(req, { length: req.headers['content-length'] }, (err, body) => {
        if (err) {
          req.resume()
          res.statusCode = 500
          return res.end(err.message)
        }

        res.end(body)
      })
    })

    server.listen(() => {
      const addr = server.address()
      const session = http2.connect('http://localhost:' + addr.port)
      const request = session.request({ ':method': 'POST', ':path': '/' })

      request.end('hello, world!')

      request.on('response', (headers) => {
        getRawBody(request, { encoding: true }, (err, str) => {
          http2close(server, session, () => {
            assert.ifError(err)
            assert.strictEqual(str, 'hello, world!')
            done()
          })
        })
      })
    })
  })

  it('should throw if stream encoding is set', (done) => {
    const server = http2.createServer((req, res) => {
      req.setEncoding('utf8')
      getRawBody(req, { length: req.headers['content-length'] }, (err, body) => {
        if (err) {
          req.resume()
          res.statusCode = 500
          return res.end(err.message)
        }

        res.end(body)
      })
    })

    server.listen(() => {
      const addr = server.address()
      const session = http2.connect('http://localhost:' + addr.port)
      const request = session.request({ ':method': 'POST', ':path': '/' })

      request.end('hello, world!')

      request.on('response', (res) => {
        getRawBody(request, { encoding: true }, (err, str) => {
          http2close(server, session, () => {
            assert.ifError(err)
            assert.strictEqual(str, 'stream encoding should not be set')
            done()
          })
        })
      })
    })
  })

  it('should throw if connection ends', (done) => {
    let socket
    const server = http2.createServer((req, res) => {
      getRawBody(req, { length: req.headers['content-length'] }, (err, body) => {
        server.close()
        assert.ok(err)
        assert.strictEqual(err.code, 'ECONNABORTED')
        assert.strictEqual(err.expected, 50)
        assert.strictEqual(err.message, 'request aborted')
        assert.strictEqual(err.received, 10)
        assert.strictEqual(err.status, 400)
        assert.strictEqual(err.type, 'request.aborted')
        done()
      })

      setTimeout(socket.destroy.bind(socket), 10)
    })

    server.listen(() => {
      const addr = server.address()
      const session = http2.connect('http://localhost:' + addr.port, {
        createConnection: (authority) => {
          return (socket = net.connect(authority.port, authority.hostname))
        }
      })

      const request = session.request({
        ':method': 'POST',
        ':path': '/',
        'content-length': '50'
      })

      request.write('testing...')
    })
  })
})

const http2close = (server, session, callback) => {
  const onSessionClose = () => {
    server.close(() => callback())
  }

  if (typeof session.close === 'function') {
    session.close(onSessionClose)
  } else {
    session.shutdown(onSessionClose)
  }
}
