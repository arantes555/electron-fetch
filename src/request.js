/**
 * request.js
 *
 * Request class contains server only options
 */

import {format as formatURL, parse as parseURL} from 'url'
import Headers from './headers.js'
import Body, {clone, extractContentType, getTotalBytes} from './body'

const PARSED_URL = Symbol('url')

/**
 * Request class
 *
 * @param {string|Request} input Url or Request instance
 * @param {Object} init Custom options
 */
export default class Request {
  constructor (input, init = {}) {
    let parsedURL

    // normalize input
    if (!(input instanceof Request)) {
      if (input && input.href) {
        // in order to support Node.js' Url objects; though WHATWG's URL objects
        // will fall into this branch also (since their `toString()` will return
        // `href` property anyway)
        parsedURL = parseURL(input.href)
      } else {
        // coerce input to a string before attempting to parse
        parsedURL = parseURL(`${input}`)
      }
      input = {}
    } else {
      parsedURL = parseURL(input.url)
    }

    let method = init.method || input.method || 'GET'

    if ((init.body != null || (input instanceof Request && input.body !== null)) &&
      (method === 'GET' || method === 'HEAD')) {
      throw new TypeError('Request with GET/HEAD method cannot have body')
    }

    let inputBody = init.body != null
      ? init.body
      : input instanceof Request && input.body !== null
        ? clone(input)
        : null

    Body.call(this, inputBody, {
      timeout: init.timeout || input.timeout || 0,
      size: init.size || input.size || 0
    })

    // fetch spec options
    this.method = method.toUpperCase()
    this.redirect = init.redirect || input.redirect || 'follow'
    this.headers = new Headers(init.headers || input.headers || {})
    this.chunkedEncoding = false
    this.useElectronNet = init.useElectronNet !== undefined // have to do this instead of || because it can be set to false
      ? init.useElectronNet
      : input.useElectronNet

    // istanbul ignore if
    if (this.useElectronNet && !process.versions.electron) throw new Error('Cannot use Electron/net module on Node.js!')

    if (this.useElectronNet === undefined) {
      this.useElectronNet = Boolean(process.versions.electron)
    }

    if (init.body != null) {
      const contentType = extractContentType(this)
      if (contentType !== null && !this.headers.has('Content-Type')) {
        this.headers.append('Content-Type', contentType)
      }
    }

    // server only options
    this.follow = init.follow !== undefined
      ? init.follow
      : input.follow !== undefined
        ? input.follow
        : 20
    this.counter = init.counter || input.counter || 0
    this.session = init.session || input.session

    this[ PARSED_URL ] = parsedURL
    Object.defineProperty(this, Symbol.toStringTag, {
      value: 'Request',
      writable: false,
      enumerable: false,
      configurable: true
    })
  }

  get url () {
    return formatURL(this[ PARSED_URL ])
  }

  /**
   * Clone this request
   *
   * @return {Request}
   */
  clone () {
    return new Request(this)
  }
}

Body.mixIn(Request.prototype)

Object.defineProperty(Request.prototype, Symbol.toStringTag, {
  value: 'RequestPrototype',
  writable: false,
  enumerable: false,
  configurable: true
})

export function getNodeRequestOptions (request) {
  const parsedURL = request[ PARSED_URL ]
  const headers = new Headers(request.headers)

  // fetch step 3
  if (!headers.has('Accept')) {
    headers.set('Accept', '*/*')
  }

  // Basic fetch
  if (!parsedURL.protocol || !parsedURL.hostname) {
    throw new TypeError('Only absolute URLs are supported')
  }

  if (!/^https?:$/.test(parsedURL.protocol)) {
    throw new TypeError('Only HTTP(S) protocols are supported')
  }

  // HTTP-network-or-cache fetch steps 5-9
  let contentLengthValue = null
  if (request.body == null && /^(POST|PUT)$/i.test(request.method)) {
    contentLengthValue = '0'
  }
  if (request.body != null) {
    const totalBytes = getTotalBytes(request)
    if (typeof totalBytes === 'number') {
      contentLengthValue = String(totalBytes)
    }
  }
  if (contentLengthValue) {
    headers.set('Content-Length', contentLengthValue)
  } else {
    request.chunkedEncoding = true
  }

  // HTTP-network-or-cache fetch step 12
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', `electron-fetch/1.0 ${request.useElectronNet ? 'electron' : 'node'} (+https://github.com/arantes555/electron-fetch)`)
  }

  // HTTP-network-or-cache fetch step 16
  headers.set('Accept-Encoding', 'gzip,deflate')

  if (!headers.has('Connection')) {
    headers.set('Connection', 'close')
  }

  // HTTP-network fetch step 4
  // chunked encoding is handled by Node.js when not running in electron

  return Object.assign({}, parsedURL, {
    method: request.method,
    headers: headers.raw()
  })
}
