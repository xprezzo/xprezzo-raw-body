const assert = require('assert')
const getRawBody = require('..')
const http = require('http')
const net = require('net')

describe('using http streams', () => {
  it('should read body streams', (done) => {
    const server = http.createServer((req, res) => {
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
      const client = http.request({ method: 'POST', port: addr.port })

      client.end('hello, world!')

      client.on('response', (res) => {
        getRawBody(res, { encoding: true }, (err, str) => {
          server.close(() => {
            assert.ifError(err)
            assert.strictEqual(str, 'hello, world!')
            done()
          })
        })
      })
    })
  })

  it('should throw if stream encoding is set', (done) => {
    const server = http.createServer((req, res) => {
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
      const client = http.request({ method: 'POST', port: addr.port })

      client.end('hello, world!')

      client.on('response', (res) => {
        getRawBody(res, { encoding: true }, (err, str) => {
          server.close(() => {
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
    const server = http.createServer((req, res) => {
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
      socket = net.connect(server.address().port, () => {
        socket.write('POST / HTTP/1.0\r\n')
        socket.write('Connection: keep-alive\r\n')
        socket.write('Content-Length: 50\r\n')
        socket.write('\r\n')
        socket.write('testing...')
      })
    })
  })
})
