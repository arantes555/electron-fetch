/**
 * index.js
 *
 * a request API compatible with window.fetch
 */

import {resolve as resolveURL} from 'url'
import * as http from 'http'
import * as https from 'https'
import * as zlib from 'zlib'
import {PassThrough} from 'stream'

import Body, {writeToStream} from './body'
import Response from './response'
import Headers from './headers'
import Request, {getNodeRequestOptions} from './request'
import FetchError from './fetch-error'

let net
if (process.versions[ 'electron' ]) {
  console.log('Fetch running on electron')
  net = require('electron').net
}

/**
 * Fetch function
 *
 * @param   Mixed    url   Absolute url or Request instance
 * @param   Object   opts  Fetch options
 * @return  Promise
 */
export default function fetch (url, opts) {
  // allow custom promise
  if (!fetch.Promise) {
    throw new Error('native promise missing, set fetch.Promise to your favorite alternative')
  }

  Body.Promise = fetch.Promise

  // wrap http.request into fetch
  return new fetch.Promise((resolve, reject) => {
    // build request object
    const request = new Request(url, opts)
    const options = getNodeRequestOptions(request)

    const send = (net || (options.protocol === 'https:' ? https : http)).request

    // http.request only support string as host header, this hack make custom host header possible
    if (options.headers.host) {
      options.headers.host = options.headers.host[ 0 ]
    }

    // send request
    let headers
    if (net) {
      headers = options.headers
      delete options.headers
    }
    const req = send(options)
    if (net) {
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
      req.once('socket', socket => {
        reqTimeout = setTimeout(() => {
          req.abort()
          reject(new FetchError(`network timeout at: ${request.url}`, 'request-timeout'))
        }, request.timeout)
      })
    }

    req.on('error', err => {
      clearTimeout(reqTimeout)
      reject(new FetchError(`request to ${request.url} failed, reason: ${err.message}`, 'system', err))
    })

    req.on('response', res => {
      clearTimeout(reqTimeout)
      console.log('Request.url:', request.url)
      console.log('Response.statusCode:', res.statusCode)
      console.log('Response.statusMessage:', res.statusMessage)
      console.log('Response.url:', res.url)
      console.log('Response.location:', res.location)
      console.log('Response.headers:', res.headers)

      // handle redirect
      if (fetch.isRedirect(res.statusCode) && request.redirect !== 'manual') {
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
      let body = res.pipe(new PassThrough())
      const responseOptions = {
        url: request.url,
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: headers,
        size: request.size,
        timeout: request.timeout
      }

      const response = new Response(body, responseOptions)
      console.log('No compression. Fetch response:', Object.assign({}, response, { body: 'BODY' }))
      resolve(response)
    })

    writeToStream(req, request)
  })
};

/**
 * Redirect code matching
 *
 * @param   Number   code  Status code
 * @return  Boolean
 */
fetch.isRedirect = code => code === 301 || code === 302 || code === 303 || code === 307 || code === 308

// expose Promise
fetch.Promise = global.Promise
export {
  Headers,
  Request,
  Response,
  FetchError
}
