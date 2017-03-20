/**
 * index.js
 *
 * a request API compatible with window.fetch
 */

import { resolve as resolveURL } from 'url'
import * as http from 'http'
import * as https from 'https'
import * as zlib from 'zlib'
import { PassThrough } from 'stream'

import { writeToStream } from './body'
import Response from './response'
import Headers from './headers'
import Request, { getNodeRequestOptions } from './request'
import FetchError from './fetch-error'

let electron
// istanbul ignore else
if (process.versions[ 'electron' ]) {
  electron = require('electron')
}
const isReady = (!electron || electron.app.isReady())
  ? Promise.resolve()
  : new Promise(resolve => electron.app.once('ready', resolve))

const debug = (...args) => {
  if (process.env.DEBUG_FETCH) console.log('[FETCH]', ...args)
}

global.debug = debug

isReady.then(() => debug('app is ready'))

/**
 * Fetch function
 *
 * @param {string|Request} url Absolute url or Request instance
 * @param {Object} [opts] Fetch options
 * @return {Promise}
 */
export default function fetch (url, opts = {}) {
  debug('requested fetch to url', url)
  // wrap http.request into fetch
  return isReady.then(() => new Promise((resolve, reject) => {
    // build request object
    const request = new Request(url, opts)
    const options = getNodeRequestOptions(request)

    const send = request.useElectronNet
      ? electron.net.request
      : (options.protocol === 'https:' ? https : http).request
    debug('using electron net?', Boolean(request.useElectronNet))
    // http.request only support string as host header, this hack make custom host header possible
    if (options.headers.host) {
      options.headers.host = options.headers.host[ 0 ]
    }
    debug('options', options)

    // send request
    let headers
    if (request.useElectronNet) {
      headers = options.headers
      delete options.headers
      options.session = options.session || electron.session.fromPartition('electron-fetch')
    }
    setTimeout(() => {
      const req = send(options)
      if (request.useElectronNet) {
        for (let headerName in headers) {
          if (typeof headers[ headerName ] === 'string') req.setHeader(headerName, headers[ headerName ])
          else {
            for (let headerValue of headers[ headerName ]) {
              req.setHeader(headerName, headerValue)
            }
          }
        }
      }
      let reqTimeout

      if (request.timeout) {
        reqTimeout = setTimeout(() => {
          req.abort()
          debug('timeout')
          reject(new FetchError(`network timeout at: ${request.url}`, 'request-timeout'))
        }, request.timeout)
      }

      req.on('close', (...args) => {
        debug('Got close with', ...args)
      })

      req.on('abort', (...args) => {
        debug('Got abort with', ...args)
      })

      req.on('finish', (...args) => {
        debug('Got finish with', ...args)
      })

      req.on('login', (...args) => {
        debug('Got login with', ...args)
      })

      req.on('error', err => {
        clearTimeout(reqTimeout)
        debug('error', err)
        reject(new FetchError(`request to ${request.url} failed, reason: ${err.message}`, 'system', err))
      })

      req.on('response', res => {
        clearTimeout(reqTimeout)
        debug('response')

        // handle redirect
        if (fetch.isRedirect(res.statusCode) && request.redirect !== 'manual') {
          debug('is redirect', res.statusCode)
          if (request.redirect === 'error') {
            reject(new FetchError(`redirect mode is set to error: ${request.url}`, 'no-redirect'))
            return
          }

          if (request.counter >= request.follow) {
            reject(new FetchError(`maximum redirect reached at: ${request.url}`, 'max-redirect'))
            return
          }

          if (!res.headers.location) {
            reject(new FetchError(`redirect location header missing at: ${request.url}`, 'invalid-redirect'))
            return
          }

          // per fetch spec, for POST request with 301/302 response, or any request with 303 response, use GET when following redirect
          if (res.statusCode === 303 ||
            ((res.statusCode === 301 || res.statusCode === 302) && request.method === 'POST')) {
            request.method = 'GET'
            request.body = null
            request.headers.delete('content-length')
          }

          request.counter++

          resolve(fetch(resolveURL(request.url, res.headers.location), request))
          return
        }

        // normalize location header for manual redirect mode
        const headers = new Headers()
        for (const name of Object.keys(res.headers)) {
          if (Array.isArray(res.headers[ name ])) {
            for (const val of res.headers[ name ]) {
              headers.append(name, val)
            }
          } else {
            headers.append(name, res.headers[ name ])
          }
        }
        if (request.redirect === 'manual' && headers.has('location')) {
          headers.set('location', resolveURL(request.url, headers.get('location')))
        }

        // prepare response
        debug('preparing response')
        let body = new PassThrough()
        res.on('error', err => body.emit('error', err))
        res.pipe(body)
        const responseOptions = {
          url: request.url,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: headers,
          size: request.size,
          timeout: request.timeout,
          useElectronNet: request.useElectronNet
        }

        // HTTP-network fetch step 16.1.2
        const codings = headers.get('Content-Encoding')

        // HTTP-network fetch step 16.1.3: handle content codings

        // in following scenarios we ignore compression support
        // 1. running on Electron/net module (it manages it for us)
        // 2. HEAD request
        // 3. no Content-Encoding header
        // 4. no content response (204)
        // 5. content not modified response (304)
        if (!request.useElectronNet && request.method !== 'HEAD' && codings !== null &&
          res.statusCode !== 204 && res.statusCode !== 304) {
          debug('decompressing response from', codings)
          // Be less strict when decoding compressed responses, since sometimes
          // servers send slightly invalid responses that are still accepted
          // by common browsers.
          // Always using Z_SYNC_FLUSH is what cURL does.
          const zlibOptions = {
            flush: zlib.Z_SYNC_FLUSH,
            finishFlush: zlib.Z_SYNC_FLUSH
          }

          if (codings === 'gzip' || codings === 'x-gzip') { // for gzip
            body = body.pipe(zlib.createGunzip(zlibOptions))
          } else if (codings === 'deflate' || codings === 'x-deflate') { // for deflate
            // handle the infamous raw deflate response from old servers
            // a hack for old IIS and Apache servers
            const raw = res.pipe(new PassThrough())
            return raw.once('data', chunk => {
              // see http://stackoverflow.com/questions/37519828
              if ((chunk[ 0 ] & 0x0F) === 0x08) {
                body = body.pipe(zlib.createInflate(zlibOptions))
              } else {
                body = body.pipe(zlib.createInflateRaw(zlibOptions))
              }
              const response = new Response(body, responseOptions)
              resolve(response)
            })
          }
        }

        const response = new Response(body, responseOptions)
        resolve(response)
      })
    }, 0)

    debug('writing to request')
    writeToStream(req, request)
  }))
}

/**
 * Redirect code matching
 *
 * @param {number} code Status code
 * @return {boolean}
 */
fetch.isRedirect = code => code === 301 || code === 302 || code === 303 || code === 307 || code === 308

export {
  Headers,
  Request,
  Response,
  FetchError
}
