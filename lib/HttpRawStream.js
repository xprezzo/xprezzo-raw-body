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
const debug = require('xprezzo-debug')('xprezzo:HttpRawStream')
const createError = require('xprezzo-http-errors')
const iconv = require('xprezzo-iconv')
const unpipe = require('xprezzo-stream-unpipe')
const prop = new WeakMap()

class HttpRawStream {
  constructor (options) {
    const opts = options || {}
    opts.complete = false
    opts.sync = true
    opts.state = opts.stream._readableState
    opts.received = 0
    opts.decoder = ''
    this.limit2 = opts.limit
    this.cleanup = function () {}
    prop.set(this, opts)
    const entitySizeResult = checkEntitySize.call(this)
    if (entitySizeResult) return entitySizeResult
    const streamEncodingResult = checkStreamEncoding.call(this)
    if (streamEncodingResult) return streamEncodingResult
    const decoderResult = useDecoder.call(this, opts.encoding)
    if (decoderResult) return decoderResult
    setListeners.call(this)
  }
}

/**
 * Get the decoder for a given encoding.
 *
 * @param {string} encoding
 * @private
 */
const getDecoder = (encoding) => {
  if (!encoding) return null
  try {
    return iconv.getDecoder(encoding)
  } catch (e) {
    // error getting decoder
    if (!/^encoding\s+not\s+recognized:\s+/i.test(e.message)) throw e

    // the encoding was not found
    throw createError(415, 'specified encoding unsupported', {
      encoding: encoding,
      type: 'encoding.unsupported'
    })
  }
}

/**
 * Check the stream encoding before start
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function checkStreamEncoding () {
  const self = prop.get(this)
  // streams1: assert request encoding is buffer.
  // streams2+: assert the stream encoding is buffer.
  //   stream._decoder: streams1
  //   state.encoding: streams2
  //   state.decoder: streams2, specifically < 0.10.6
  if (self.stream._decoder || (self.state && (self.state.encoding || self.state.decoder))) {
    // developer error
    return final.call(this, createError(500, 'stream encoding should not be set', {
      type: 'stream.encoding.set'
    }))
  }
  return false
}

/**
 * Final call handler
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function final () {
  const self = prop.get(this)
  const that = this
  const args = new Array(arguments.length)
  // copy arguments
  for (let i = 0; i < args.length; i++) {
    args[i] = arguments[i]
  }
  // mark complete
  self.complete = true
  prop.set(this, self)
  const invokeCallback = () => {
    that.cleanup()
    if (args[0]) {
      debug('callBack')
      // halt the stream on error
      halt.call(that)
    }
    self.callback.apply(null, args)
  }
  if (self.sync) {
    process.nextTick(invokeCallback)
  } else {
    invokeCallback()
  }
  return this
}

/**
 * halt the stream
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function halt () {
  const self = prop.get(this)
  // unpipe everything from the stream
  unpipe(self.stream)
  // pause stream
  if (typeof self.stream.pause === 'function') {
    self.stream.pause()
  }
}

/**
 * Check if request entity is too large
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function checkEntitySize () {
  const self = prop.get(this)
  // check the length and limit options.
  // note: we intentionally leave the stream paused,
  // so users should handle the stream themselves.
  if (self.limit !== null && self.length !== null && self.length > self.limit) {
    return final.call(this, createError(413, 'request entity too large', {
      expected: self.length,
      length: self.length,
      limit: self.limit,
      type: 'entity.too.large'
    }))
  }
  return false
}

/**
 * Apply Decoder
 *
 * @param {string} encoding
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function useDecoder (encoding) {
  const self = prop.get(this)
  try {
    self.decoder = getDecoder(encoding)
  } catch (err) {
    return final.call(this, err)
  }
  self.buffer = self.decoder ? '' : []
  prop.set(this, self)
  return false
}

/**
 * Set the listener for HttpRawStream
 *
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function setListeners () {
  const self = prop.get(this)
  debug('3. limit:' + self.limit)
  const that = this
  function cleanup () {
    self.buffer = null
    prop.set(that, self)
    self.stream.removeListener('aborted', onAborted)
    self.stream.removeListener('data', onData)
    self.stream.removeListener('end', onEnd)
    self.stream.removeListener('error', onEnd)
    self.stream.removeListener('close', cleanup)
  }
  this.cleanup = cleanup
  prop.set(this, self)
  // attach listeners
  self.stream.on('aborted', onAborted)
  self.stream.on('close', cleanup)
  self.stream.on('data', onData)
  self.stream.on('end', onEnd)
  self.stream.on('error', onEnd)
  // mark sync section complete
  self.sync = false
  prop.set(this, self)
  function onAborted () {
    HttpRawStreamOnAborted.call(that)
  }
  function onData (chunk) {
    HttpRawStreamOnData.call(that, chunk)
  }
  function onEnd (err) {
    HttpRawStreamOnEnd.call(that, err)
  }
  return this
}

/**
 * The On Abort Handler
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function HttpRawStreamOnAborted () {
  const self = prop.get(this)
  if (this.complete) return
  final.call(this, createError(400, 'request aborted', {
    code: 'ECONNABORTED',
    expected: self.length,
    length: self.length,
    received: self.received,
    type: 'request.aborted'
  }))
  return false
}

/**
 * The On Data Handler
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function HttpRawStreamOnData (chunk) {
  const self = prop.get(this)
  if (self.complete) return
  self.received += chunk.length
  prop.set(this, self)
  if (self.limit !== null && self.received > self.limit) {
    final.call(this, createError(413, 'request entity too large', {
      limit: self.limit,
      received: self.received,
      type: 'entity.too.large'
    }))
  } else if (self.decoder) {
    self.buffer += self.decoder.write(chunk)
    prop.set(this, self)
  } else {
    self.buffer.push(chunk)
    prop.set(this, self)
  }
  return false
}

/**
 * The On End Handler
 *
 * @private
 */
// Avoid using arrow function expression to prevent incorrect "this"
function HttpRawStreamOnEnd (err) {
  const self = prop.get(this)
  if (self.complete) return
  if (err) return final.call(this, err)
  if (self.length !== null && self.received !== self.length) {
    final.call(this, createError(400, 'request size did not match content length', {
      expected: self.length,
      length: self.length,
      received: self.received,
      type: 'request.size.invalid'
    }))
  } else {
    const string = self.decoder
      ? self.buffer + (self.decoder.end() || '')
      : Buffer.concat(self.buffer)
    final.call(this, null, string)
  }
  return false
}

module.exports = HttpRawStream
