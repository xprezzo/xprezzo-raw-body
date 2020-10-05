/*!
 * xprezzo-raw-body
 * Copyright(c) 2020 Ben Ajenoui <info@seohero.io>
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const bytes = require('bytes')
const HttpRawStream = require('./lib/HttpRawStream')
const createError = require('xprezzo-http-errors')
const iconv = require('xprezzo-iconv')
const onFinished = require('xprezzo-on-finished')
const zlib = require('zlib')

/**
  * Module exports.
  * Wrap and protect the HttpRawStream
  *
  * @param {object} stream
  * @param {object|string|function} [options]
  * @param {function} [callback]
  * @public
  */
const getBody = module.exports = (stream, options, callback) => {
  let done = callback
  let opts = options || {}

  if (options === true || typeof options === 'string') {
    // short cut for encoding
    opts = {
      encoding: options
    }
  } else if (typeof options === 'function') {
    done = options
    opts = {}
  }

  // validate callback is a function, if provided
  if (done !== undefined && typeof done !== 'function') {
    throw new TypeError('argument callback must be a function')
  }

  // require the callback without promises
  if (!done && !global.Promise) {
    throw new TypeError('argument callback is required')
  }

  // get encoding
  const encoding = opts.encoding !== true
    ? opts.encoding
    : 'utf-8'

  // convert the limit to an integer
  const limit = bytes.parse(opts.limit)

  // convert the expected length to an integer
  const length = opts.length != null && !isNaN(opts.length)
    ? parseInt(opts.length, 10)
    : null

  if (done) {
    // classic callback style
    // new HttpRawStream(stream, encoding, length, limit, callback);
    return new HttpRawStream({
      stream: stream,
      encoding: encoding,
      length: length,
      limit: limit,
      callback: done
    })
  }

  return new Promise((resolve, reject) => {
    /* eslint-disable no-new */
    new HttpRawStream({
      stream: stream,
      encoding: encoding,
      length: length,
      limit: limit,
      callback: (err, buf) => {
        if (err) return reject(err)
        resolve(buf)
      }
    })
  })
}

/**
 * Module exports.
 *
 * Reader
 *
 * Read a request into a buffer and parse.
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @param {function} parse
 * @param {function} debug
 * @param {object} options
 * @private
 */
module.exports.Reader = (req, res, next, parse, debug, options) => {
  let length
  const opts = options
  let stream

  // flag as parsed
  req._body = true

  // read options
  const encoding = opts.encoding !== null
    ? opts.encoding
    : null
  const verify = opts.verify
  debug('typeof verify = ' + typeof verify)

  try {
    // get the content stream
    stream = contentstream(req, debug, opts.inflate)
    length = stream.length
    debug('length = ' + length)
    stream.length = undefined
  } catch (err) {
    return next(err)
  }

  // set xprezzo-raw-body options
  opts.length = length
  opts.encoding = verify
    ? null
    : encoding
  debug('encoding = ' + encoding)
  debug('encoding exists=' + iconv.encodingExists(encoding))

  // assert charset is supported
  if (opts.encoding === null && encoding !== null && !iconv.encodingExists(encoding)) {
    return next(createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
      charset: encoding.toLowerCase(),
      type: 'charset.unsupported'
    }))
  }

  // read body
  debug('read body')
  getBody(stream, opts, (error, body) => {
    if (error) {
      let _error

      if (error.type === 'encoding.unsupported') {
        // echo back charset
        _error = createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
          charset: encoding.toLowerCase(),
          type: 'charset.unsupported'
        })
      } else {
        // set status code on error
        _error = createError(400, error)
      }

      // read off entire request
      stream.resume()
      onFinished(req, function onfinished () {
        next(createError(400, _error))
      })
      return
    }

    // verify
    if (verify) {
      try {
        debug('verify body')
        verify(req, res, body, encoding)
      } catch (err) {
        next(createError(403, err, {
          body: body,
          type: err.type || 'entity.verify.failed'
        }))
        return
      }
    }

    // parse
    let str = body
    try {
      debug('parse body')
      str = typeof body !== 'string' && encoding !== null
        ? iconv.decode(body, encoding)
        : body
      req.body = parse(str)
    } catch (err) {
      next(createError(400, err, {
        body: str,
        type: err.type || 'entity.parse.failed'
      }))
      return
    }
    next()
  })
}

/**
 * Get the content stream of the request.
 *
 * @param {object} req
 * @param {function} debug
 * @param {boolean} [inflate=true]
 * @return {object}
 * @api private
 */

const contentstream = (req, debug, inflate) => {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase()
  const length = req.headers['content-length']
  let stream

  debug('content-encoding "%s"', encoding)

  if (inflate === false && encoding !== 'identity') {
    throw createError(415, 'content encoding unsupported', {
      encoding: encoding,
      type: 'encoding.unsupported'
    })
  }

  switch (encoding) {
    case 'deflate':
      stream = zlib.createInflate()
      debug('inflate body')
      req.pipe(stream)
      break
    case 'gzip':
      stream = zlib.createGunzip()
      debug('gunzip body')
      req.pipe(stream)
      break
    case 'identity':
      stream = req
      stream.length = length
      break
    default:
      throw createError(415, 'unsupported content encoding "' + encoding + '"', {
        encoding: encoding,
        type: 'encoding.unsupported'
      })
  }

  return stream
}
/**
 * Module exports.
 *
 */
module.exports.bytes = bytes
module.exports.debug = require('xprezzo-debug')
module.exports.httpErrors = require('xprezzo-http-errors')
module.exports.iconv = iconv
module.exports.onFinished = onFinished
