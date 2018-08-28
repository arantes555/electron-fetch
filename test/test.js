/* eslint-disable no-unused-expressions */
/* global describe, it, before, after */
// test tools
import chai from 'chai'
import chaiPromised from 'chai-as-promised'
import { spawn } from 'child_process'
import * as stream from 'stream'
import resumer from 'resumer'
import FormData from 'form-data'
import { parse as parseURL } from 'url'
import { URL } from 'whatwg-url'
import * as fs from 'fs'
import assert from 'assert'

import { TestProxy, TestServer } from './server'
// test subjects
import fetch, { FetchError, Headers, Request, Response } from '../src/'
import FetchErrorOrig from '../src/fetch-error.js'
import HeadersOrig from '../src/headers.js'
import RequestOrig from '../src/request.js'
import ResponseOrig from '../src/response.js'
import Body from '../src/body.js'
import Blob from '../src/blob.js'

chai.use(chaiPromised)

const {expect} = chai

const supportToString = ({[Symbol.toStringTag]: 'z'}).toString() === '[object z]'

const local = new TestServer()
const unauthenticatedProxy = new TestProxy({
  port: 30002
})
const authenticatedProxy = new TestProxy({
  credentials: {username: 'testuser', password: 'testpassword'},
  port: 30003
})
const base = `http://${local.hostname}:${local.port}/`
let url, opts

const isIterable = (value) => value != null && typeof value[Symbol.iterator] === 'function'
const deepEqual = (value, expectedValue) => {
  try {
    assert.deepStrictEqual(value, expectedValue)
    return true
  } catch (err) {
    return false
  }
}
const deepIteratesOver = (value, expectedValue) => deepEqual(Array.from(value), Array.from(expectedValue))

before(done => {
  local.start(() =>
    unauthenticatedProxy.start(() =>
      authenticatedProxy.start(done)))
})

after(done => {
  local.stop(() =>
    unauthenticatedProxy.stop(() =>
      authenticatedProxy.stop(done)))
})

const createTestSuite = (useElectronNet) => {
  describe(`electron-fetch: ${useElectronNet ? 'electron' : 'node'}`, () => {
    it('should return a promise', function () {
      url = 'http://example.com/'
      const p = fetch(url, {useElectronNet})
      expect(p).to.be.an.instanceof(Promise)
      expect(p).to.respondTo('then')
    })

    it('should expose Headers, Response and Request constructors', function () {
      expect(FetchError).to.equal(FetchErrorOrig)
      expect(Headers).to.equal(HeadersOrig)
      expect(Response).to.equal(ResponseOrig)
      expect(Request).to.equal(RequestOrig)
    })

    if (supportToString) {
      it('should support proper toString output for Headers, Response and Request objects', function () {
        expect(new Headers().toString()).to.equal('[object Headers]')
        expect(new Response().toString()).to.equal('[object Response]')
        expect(new Request(base).toString()).to.equal('[object Request]')
      })
    }

    it('should reject with error if url is protocol relative', function () {
      url = '//example.com/'
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejectedWith(TypeError, 'Only absolute URLs are supported')
    })

    it('should reject with error if url is relative path', function () {
      url = '/some/path'
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejectedWith(TypeError, 'Only absolute URLs are supported')
    })

    it('should reject with error if protocol is unsupported', function () {
      url = 'ftp://example.com/'
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejectedWith(TypeError, 'Only HTTP(S) protocols are supported')
    })

    it('should reject with error on network failure', function () {
      this.timeout(5000) // on windows, 2s are not enough to get the network failure
      url = 'http://localhost:50000/'
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejected
        .and.be.an.instanceOf(FetchError)
        .and.include({type: 'system', code: 'ECONNREFUSED', errno: 'ECONNREFUSED'})
    })

    it('should resolve into response', function () {
      url = `${base}hello`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res).to.be.an.instanceof(Response)
        expect(res.headers).to.be.an.instanceof(Headers)
        expect(res.body).to.be.an.instanceof(stream.Transform)
        expect(res.bodyUsed).to.be.false

        expect(res.url).to.equal(url)
        expect(res.ok).to.be.true
        expect(res.status).to.equal(200)
        expect(res.statusText).to.equal('OK')
      })
    })

    it('should accept plain text response', function () {
      url = `${base}plain`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(result => {
          expect(res.bodyUsed).to.be.true
          expect(result).to.be.a('string')
          expect(result).to.equal('text')
        })
      })
    })

    it('should accept html response (like plain text)', function () {
      url = `${base}html`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/html')
        return res.text().then(result => {
          expect(res.bodyUsed).to.be.true
          expect(result).to.be.a('string')
          expect(result).to.equal('<html></html>')
        })
      })
    })

    it('should accept json response', function () {
      url = `${base}json`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('application/json')
        return res.json().then(result => {
          expect(res.bodyUsed).to.be.true
          expect(result).to.be.an('object')
          expect(result).to.deep.equal({name: 'value'})
        })
      })
    })

    it('should send request with custom headers', function () {
      url = `${base}inspect`
      opts = {
        headers: {'x-custom-header': 'abc'},
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.headers['x-custom-header']).to.equal('abc')
      })
    })

    it('should send request with custom Cookie headers', function () {
      url = `${base}inspect`
      opts = {
        headers: {'Cookie': 'toto=tata'},
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.headers['cookie']).to.equal('toto=tata')
      })
    })

    it('should accept headers instance', function () {
      url = `${base}inspect`
      opts = {
        headers: new Headers({'x-custom-header': 'abc'}),
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.headers['x-custom-header']).to.equal('abc')
      })
    })

    it('should accept custom host header', function () {
      url = `${base}inspect`
      opts = {
        headers: {
          host: 'example.com'
        },
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.headers['host']).to.equal('example.com')
      })
    })

    it('should accept connection header', function () {
      url = `${base}inspect`
      opts = {
        headers: {
          connection: 'close'
        },
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.headers['connection']).to.equal('close')
      })
    })

    it('should follow redirect code 301', function () {
      url = `${base}redirect/301`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`) // actually follows the redirects, just does not update the res.url ...
        expect(res.status).to.equal(200)
        expect(res.ok).to.be.true
      })
    })

    it('should follow redirect code 302', function () {
      url = `${base}redirect/302`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
      })
    })

    it('should follow redirect code 303', function () {
      url = `${base}redirect/303`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
      })
    })

    it('should follow redirect code 307', function () {
      url = `${base}redirect/307`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
      })
    })

    it('should follow redirect code 308', function () {
      url = `${base}redirect/308`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
      })
    })

    it('should follow redirect chain', function () {
      url = `${base}redirect/chain`
      return fetch(url, {useElectronNet}).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
      })
    })

    it('should follow POST request redirect code 301 with GET', function () {
      url = `${base}redirect/301`
      opts = {
        method: 'POST',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
        return res.json().then(result => {
          expect(result.method).to.equal('GET')
          expect(result.body).to.equal('')
        })
      })
    })

    it('should follow POST request redirect code 302 with GET', function () {
      url = `${base}redirect/302`
      opts = {
        method: 'POST',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
        return res.json().then(result => {
          expect(result.method).to.equal('GET')
          expect(result.body).to.equal('')
        })
      })
    })

    it('should follow redirect code 303 with GET', function () {
      url = `${base}redirect/303`
      opts = {
        method: 'PUT',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`)
        expect(res.status).to.equal(200)
        return res.json().then(result => {
          expect(result.method).to.equal('GET')
          expect(result.body).to.equal('')
        })
      })
    })

    if (useElectronNet) {
      it('should default to using electron net module', function () {
        url = `${base}inspect`
        return fetch(url)
          .then(res => {
            expect(res.useElectronNet).to.be.true
            return res.json()
          })
          .then(resBody => {
            expect(resBody.headers['user-agent']).to.satisfy(s => s.startsWith('electron-fetch/1.0 electron'))
          })
      })
    } else {
      it('should obey maximum redirect, reject case', function () { // Not compatible with electron.net
        url = `${base}redirect/chain`
        opts = {
          follow: 1,
          useElectronNet
        }
        return expect(fetch(url, opts)).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('type', 'max-redirect')
      })

      it('should obey redirect chain, resolve case', function () { // useless, follow option not compatible
        url = `${base}redirect/chain`
        opts = {
          follow: 2,
          useElectronNet
        }
        return fetch(url, opts).then(res => {
          expect(res.url).to.equal(`${base}inspect`)
          expect(res.status).to.equal(200)
        })
      })

      it('should allow not following redirect', function () { // Not compatible with electron.net
        url = `${base}redirect/301`
        opts = {
          follow: 0,
          useElectronNet
        }
        return expect(fetch(url, opts)).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('type', 'max-redirect')
      })

      it('should support redirect mode, manual flag', function () { // Not compatible with electron.net
        url = `${base}redirect/301`
        opts = {
          redirect: 'manual',
          useElectronNet
        }
        return fetch(url, opts).then(res => {
          expect(res.url).to.equal(url)
          expect(res.status).to.equal(301)
          expect(res.headers.get('location')).to.equal(`${base}inspect`)
        })
      })

      it('should support redirect mode, error flag', function () { // Not compatible with electron.net
        url = `${base}redirect/301`
        opts = {
          redirect: 'error',
          useElectronNet
        }
        return expect(fetch(url, opts)).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('type', 'no-redirect')
      })
    }

    it('should support redirect mode, manual flag when there is no redirect', function () { // Pretty useless on electron, but why not
      url = `${base}hello`
      opts = {
        redirect: 'manual',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.url).to.equal(url)
        expect(res.status).to.equal(200)
        expect(res.headers.get('location')).to.be.null
      })
    })

    it('should follow redirect code 301 and keep existing headers', function () {
      url = `${base}redirect/301`
      opts = {
        headers: new Headers({'x-custom-header': 'abc'}),
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        if (!useElectronNet) expect(res.url).to.equal(`${base}inspect`) // Not compatible with electron.net
        return res.json()
      }).then(res => {
        expect(res.headers['x-custom-header']).to.equal('abc')
      })
    })

    it('should reject broken redirect', function () {
      url = `${base}error/redirect`
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejected
        .and.be.an.instanceOf(FetchError)
        .and.have.property('type', 'invalid-redirect')
    })

    it('should not reject broken redirect under manual redirect', function () {
      url = `${base}error/redirect`
      opts = {
        redirect: 'manual',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.url).to.equal(url)
        expect(res.status).to.equal(301)
        expect(res.headers.get('location')).to.be.null
      })
    })

    it('should handle client-error response', function () {
      url = `${base}error/400`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        expect(res.status).to.equal(400)
        expect(res.statusText).to.equal('Bad Request')
        expect(res.ok).to.be.false
        return res.text().then(result => {
          expect(res.bodyUsed).to.be.true
          expect(result).to.be.a('string')
          expect(result).to.equal('client error')
        })
      })
    })

    it('should handle server-error response', function () {
      url = `${base}error/500`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        expect(res.status).to.equal(500)
        expect(res.statusText).to.equal('Internal Server Error')
        expect(res.ok).to.be.false
        return res.text().then(result => {
          expect(res.bodyUsed).to.be.true
          expect(result).to.be.a('string')
          expect(result).to.equal('server error')
        })
      })
    })

    it('should handle network-error response', function () {
      url = `${base}error/reset`
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejected
        .and.be.an.instanceOf(FetchError)
        .and.have.property('code', 'ECONNRESET')
    })

    it('should handle DNS-error response', function () {
      url = 'http://domain.invalid'
      return expect(fetch(url, {useElectronNet})).to.eventually.be.rejected
        .and.be.an.instanceOf(FetchError)
        .and.have.property('code', 'ENOTFOUND')
    })

    it('should reject invalid json response', function () {
      url = `${base}error/json`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('application/json')
        return expect(res.json()).to.eventually.be.rejectedWith(Error)
      })
    })

    it('should handle no content response', function () {
      url = `${base}no-content`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(204)
        expect(res.statusText).to.equal('No Content')
        expect(res.ok).to.be.true
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.be.empty
        })
      })
    })

    it('should handle no content response with gzip encoding', function () {
      url = `${base}no-content/gzip`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(204)
        expect(res.statusText).to.equal('No Content')
        expect(res.headers.get('content-encoding')).to.equal('gzip')
        expect(res.ok).to.be.true
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.be.empty
        })
      })
    })

    it('should handle not modified response', function () {
      url = `${base}not-modified`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(304)
        expect(res.statusText).to.equal('Not Modified')
        expect(res.ok).to.be.false
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.be.empty
        })
      })
    })

    it('should handle not modified response with gzip encoding', function () {
      url = `${base}not-modified/gzip`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(304)
        expect(res.statusText).to.equal('Not Modified')
        expect(res.headers.get('content-encoding')).to.equal('gzip')
        expect(res.ok).to.be.false
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.be.empty
        })
      })
    })

    it('should decompress gzip response', function () {
      url = `${base}gzip`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.equal('hello world')
        })
      })
    })

    it('should decompress slightly invalid gzip response', function () {
      url = `${base}gzip-truncated`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.equal('hello world')
        })
      })
    })

    it('should decompress deflate response', function () {
      url = `${base}deflate`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.equal('hello world')
        })
      })
    })

    it('should decompress deflate raw response from old apache server', function () {
      url = `${base}deflate-raw`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(result => {
          expect(result).to.be.a('string')
          expect(result).to.equal('hello world')
        })
      })
    })

    if (useElectronNet) {
      it('should throw if invalid content-encoding', function () {
        url = `${base}sdch`
        return expect(fetch(url, {useElectronNet}))
          .to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('code', 'Z_DATA_ERROR')
      })
    } else {
      it('should skip decompression if unsupported', function () {
        url = `${base}sdch`
        return fetch(url, {useElectronNet}).then(res => {
          expect(res.headers.get('content-type')).to.equal('text/plain')
          return res.text().then(result => {
            expect(result).to.be.a('string')
            expect(result).to.equal('fake sdch string')
          })
        })
      })
    }

    it('should reject if response compression is invalid', function () {
      url = `${base}invalid-content-encoding`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return expect(res.text()).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('code', 'Z_DATA_ERROR')
      })
    })

    it('should allow custom timeout', function () {
      this.timeout(500)
      url = `${base}timeout`
      opts = {
        timeout: 100,
        useElectronNet
      }
      return expect(fetch(url, opts)).to.eventually.be.rejected
        .and.be.an.instanceOf(FetchError)
        .and.have.property('type', 'request-timeout')
    })

    it('should allow custom timeout on response body', function () { // This fails on windows and we get a request-timeout
      this.timeout(500)
      url = `${base}slow`
      opts = {
        timeout: 100,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.ok).to.be.true
        return expect(res.text()).to.eventually.be.rejectedWith(FetchError)
          .and.have.property('type', 'body-timeout')
      })
    })

    it('should clear internal timeout on fetch response', function (done) { // these tests don't make much sense on electron..
      this.timeout(1000)
      spawn('node', ['-e', `require('./')('${base}hello', { timeout: 5000 })`])
        .on('exit', () => {
          done()
        })
    })

    it('should clear internal timeout on fetch redirect', function (done) {
      this.timeout(1000)
      spawn('node', ['-e', `require('./')('${base}redirect/301', { timeout: 5000 })`])
        .on('exit', () => {
          done()
        })
    })

    it('should clear internal timeout on fetch error', function (done) {
      this.timeout(1000)
      spawn('node', ['-e', `require('./')('${base}error/reset', { timeout: 5000 })`])
        .on('exit', () => {
          done()
        })
    })

    it('should set default User-Agent', function () {
      url = `${base}inspect`
      return fetch(url, {useElectronNet}).then(res => res.json()).then(res => {
        expect(res.headers['user-agent']).to.satisfy(s => s.startsWith('electron-fetch/'))
      })
    })

    it('should allow setting User-Agent', function () {
      url = `${base}inspect`
      opts = {
        headers: {
          'user-agent': 'faked'
        },
        useElectronNet
      }
      fetch(url, opts).then(res => res.json()).then(res => {
        expect(res.headers['user-agent']).to.equal('faked')
      })
    })

    it('should set default Accept header', function () {
      url = `${base}inspect`
      fetch(url, {useElectronNet}).then(res => res.json()).then(res => {
        expect(res.headers.accept).to.equal('*/*')
      })
    })

    it('should allow setting Accept header', function () {
      url = `${base}inspect`
      opts = {
        headers: {
          'accept': 'application/json'
        },
        useElectronNet
      }
      fetch(url, opts).then(res => res.json()).then(res => {
        expect(res.headers.accept).to.equal('application/json')
      })
    })

    it('should allow POST request', function () {
      url = `${base}inspect`
      opts = {
        method: 'POST',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.be.undefined
        expect(res.headers['content-length']).to.equal('0')
      })
    })

    it('should allow POST request with string body', function () {
      url = `${base}inspect`
      opts = {
        method: 'POST',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.equal('text/plain;charset=UTF-8')
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow POST request with buffer body', function () {
      url = `${base}inspect`
      opts = {
        method: 'POST',
        body: Buffer.from('a=1', 'utf-8'),
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.be.undefined
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow POST request with blob body without type', function () {
      url = `${base}inspect`
      opts = {
        method: 'POST',
        body: new Blob(['a=1']),
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.be.undefined
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow POST request with blob body with type', function () {
      url = `${base}inspect`
      opts = {
        method: 'POST',
        body: new Blob(['a=1'], {
          type: 'text/plain;charset=UTF-8'
        }),
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.equal('text/plain;charset=utf-8')
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow POST request with readable stream as body', function () {
      let body = resumer().queue('a=1').end()
      body = body.pipe(new stream.PassThrough())

      url = `${base}inspect`
      opts = {
        method: 'POST',
        body,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.equal('chunked')
        expect(res.headers['content-type']).to.be.undefined
        expect(res.headers['content-length']).to.be.undefined
      })
    })

    it('should allow POST request with form-data as body', function () {
      const form = new FormData()
      form.append('a', '1')

      url = `${base}multipart`
      opts = {
        method: 'POST',
        body: form,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.headers['content-type']).to.satisfy(s => s.startsWith('multipart/form-data;boundary='))
        expect(res.headers['content-length']).to.be.a('string')
        expect(res.body).to.equal('a=1')
      })
    })

    it('should allow POST request with form-data using stream as body', function () {
      const form = new FormData()
      form.append('my_field', fs.createReadStream('test/dummy.txt'))

      url = `${base}multipart`
      opts = {
        method: 'POST',
        body: form,
        useElectronNet
      }

      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.headers['content-type']).to.satisfy(s => s.startsWith('multipart/form-data;boundary='))
        expect(res.headers['content-length']).to.be.undefined
        expect(res.body).to.contain('my_field=')
      })
    })

    it('should allow POST request with form-data as body and custom headers', function () {
      const form = new FormData()
      form.append('a', '1')

      const headers = form.getHeaders()
      headers['b'] = '2'

      url = `${base}multipart`
      opts = {
        method: 'POST',
        body: form,
        headers,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.headers['content-type']).to.satisfy(s => s.startsWith('multipart/form-data; boundary='))
        expect(res.headers['content-length']).to.be.a('string')
        expect(res.headers.b).to.equal('2')
        expect(res.body).to.equal('a=1')
      })
    })

    it('should allow POST request with object body', function () {
      url = `${base}inspect`
      // note that fetch simply calls tostring on an object
      opts = {
        method: 'POST',
        body: {a: 1},
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('[object Object]')
        expect(res.headers['content-type']).to.equal('text/plain;charset=UTF-8')
        expect(res.headers['content-length']).to.equal('15')
      })
    })

    it('should overwrite Content-Length if possible', function () {
      url = `${base}inspect`
      // note that fetch simply calls tostring on an object
      opts = {
        method: 'POST',
        headers: {
          'Content-Length': '1000'
        },
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('POST')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-type']).to.equal('text/plain;charset=UTF-8')
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow PUT request', function () {
      url = `${base}inspect`
      opts = {
        method: 'PUT',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('PUT')
        expect(res.body).to.equal('a=1')
      })
    })

    it('should allow DELETE request', function () {
      url = `${base}inspect`
      opts = {
        method: 'DELETE',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('DELETE')
      })
    })

    it('should allow DELETE request with string body', function () {
      url = `${base}inspect`
      opts = {
        method: 'DELETE',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('DELETE')
        expect(res.body).to.equal('a=1')
        expect(res.headers['transfer-encoding']).to.be.undefined
        expect(res.headers['content-length']).to.equal('3')
      })
    })

    it('should allow PATCH request', function () {
      url = `${base}inspect`
      opts = {
        method: 'PATCH',
        body: 'a=1',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        return res.json()
      }).then(res => {
        expect(res.method).to.equal('PATCH')
        expect(res.body).to.equal('a=1')
      })
    })

    it('should allow HEAD request', function () {
      url = `${base}hello`
      opts = {
        method: 'HEAD',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(200)
        expect(res.statusText).to.equal('OK')
        expect(res.headers.get('content-type')).to.equal('text/plain')
        expect(res.body).to.be.an.instanceof(stream.Transform)
        return res.text()
      }).then(text => {
        expect(text).to.equal('')
      })
    })

    it('should allow HEAD request with content-encoding header', function () {
      url = `${base}error/404`
      opts = {
        method: 'HEAD',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(404)
        expect(res.headers.get('content-encoding')).to.equal('gzip')
        return res.text()
      }).then(text => {
        expect(text).to.equal('')
      })
    })

    it('should allow OPTIONS request', function () {
      url = `${base}options`
      opts = {
        method: 'OPTIONS',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(200)
        expect(res.statusText).to.equal('OK')
        expect(res.headers.get('allow')).to.equal('GET, HEAD, OPTIONS')
        expect(res.body).to.be.an.instanceof(stream.Transform)
      })
    })

    it('should reject decoding body twice', function () {
      url = `${base}plain`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return res.text().then(() => {
          expect(res.bodyUsed).to.be.true
          return expect(res.text()).to.eventually.be.rejectedWith(Error)
        })
      })
    })

    it('should support maximum response size, multiple chunk', function () {
      url = `${base}size/chunk`
      opts = {
        size: 5,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(200)
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return expect(res.text()).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('type', 'max-size')
      })
    })

    it('should support maximum response size, single chunk', function () {
      url = `${base}size/long`
      opts = {
        size: 5,
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(200)
        expect(res.headers.get('content-type')).to.equal('text/plain')
        return expect(res.text()).to.eventually.be.rejected
          .and.be.an.instanceOf(FetchError)
          .and.have.property('type', 'max-size')
      })
    })

    it('should only use UTF-8 decoding with text()', function () {
      url = `${base}encoding/euc-jp`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.text().then(result => {
          expect(result).to.equal('<?xml version="1.0" encoding="EUC-JP"?><title>\ufffd\ufffd\ufffd\u0738\ufffd</title>')
        })
      })
    })

    it('should support encoding decode, xml dtd detect', function () {
      url = `${base}encoding/euc-jp`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('<?xml version="1.0" encoding="EUC-JP"?><title>日本語</title>')
        })
      })
    })

    it('should support encoding decode, content-type detect', function () {
      url = `${base}encoding/shift-jis`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('<div>日本語</div>')
        })
      })
    })

    it('should support encoding decode, html5 detect', function () {
      url = `${base}encoding/gbk`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('<meta charset="gbk"><div>中文</div>')
        })
      })
    })

    it('should support encoding decode, html4 detect', function () {
      url = `${base}encoding/gb2312`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('<meta http-equiv="Content-Type" content="text/html; charset=gb2312"><div>中文</div>')
        })
      })
    })

    it('should default to utf8 encoding', function () {
      url = `${base}encoding/utf8`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        expect(res.headers.get('content-type')).to.be.null
        return res.textConverted().then(result => {
          expect(result).to.equal('中文')
        })
      })
    })

    it('should support uncommon content-type order, charset in front', function () {
      url = `${base}encoding/order1`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('中文')
        })
      })
    })

    it('should support uncommon content-type order, end with qs', function () {
      url = `${base}encoding/order2`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        return res.textConverted().then(result => {
          expect(result).to.equal('中文')
        })
      })
    })

    it('should support chunked encoding, html4 detect', function () {
      url = `${base}encoding/chunked`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        const padding = 'a'.repeat(10)
        return res.textConverted().then(result => {
          expect(result).to.equal(`${padding}<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS" /><div>日本語</div>`)
        })
      })
    })

    it('should only do encoding detection up to 1024 bytes', function () {
      url = `${base}encoding/invalid`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.status).to.equal(200)
        const padding = 'a'.repeat(1200)
        return res.textConverted().then(result => {
          expect(result).to.not.equal(`${padding}中文`)
        })
      })
    })

    it('should allow piping response body as stream', function () {
      url = `${base}hello`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.body).to.be.an.instanceof(stream.Transform)
        return streamToPromise(res.body, chunk => {
          if (chunk === null) {
            return
          }
          expect(chunk.toString()).to.equal('world')
        })
      })
    })

    it('should allow cloning a response, and use both as stream', function () {
      url = `${base}hello`
      return fetch(url, {useElectronNet}).then(res => {
        const r1 = res.clone()
        expect(res.body).to.be.an.instanceof(stream.Transform)
        expect(r1.body).to.be.an.instanceof(stream.Transform)
        const dataHandler = chunk => {
          if (chunk === null) {
            return
          }
          expect(chunk.toString()).to.equal('world')
        }

        return Promise.all([
          streamToPromise(res.body, dataHandler),
          streamToPromise(r1.body, dataHandler)
        ])
      })
    })

    it('should allow cloning a json response and log it as text response', function () {
      url = `${base}json`
      return fetch(url, {useElectronNet}).then(res => {
        const r1 = res.clone()
        return Promise.all([res.json(), r1.text()]).then(results => {
          expect(results[0]).to.deep.equal({name: 'value'})
          expect(results[1]).to.equal('{"name":"value"}')
        })
      })
    })

    it('should allow cloning a json response, and then log it as text response', function () {
      url = `${base}json`
      return fetch(url, {useElectronNet}).then(res => {
        const r1 = res.clone()
        return res.json().then(result => {
          expect(result).to.deep.equal({name: 'value'})
          return r1.text().then(result => {
            expect(result).to.equal('{"name":"value"}')
          })
        })
      })
    })

    it('should allow cloning a json response, first log as text response, then return json object', function () {
      url = `${base}json`
      return fetch(url, {useElectronNet}).then(res => {
        const r1 = res.clone()
        return r1.text().then(result => {
          expect(result).to.equal('{"name":"value"}')
          return res.json().then(result => {
            expect(result).to.deep.equal({name: 'value'})
          })
        })
      })
    })

    it('should not allow cloning a response after its been used', function () {
      url = `${base}hello`
      return fetch(url, {useElectronNet}).then(res =>
        res.text().then(() => {
          expect(() => {
            res.clone()
          }).to.throw(Error)
        })
      )
    })

    it('should allow get all responses of a header', function () {
      url = `${base}cookie`
      return fetch(url, {useElectronNet}).then(res => {
        expect(res.headers.get('set-cookie')).to.equal('a=1,b=1')
      })
    })

    it('should allow iterating through all headers with forEach', function () {
      const headers = new Headers([
        ['b', '2'],
        ['c', '4'],
        ['b', '3'],
        ['a', '1']
      ])
      expect(headers).to.have.property('forEach')

      const result = []
      headers.forEach((val, key) => {
        result.push([key, val])
      })

      expect(result).to.deep.equal([
        ['a', '1'],
        ['b', '2'],
        ['b', '3'],
        ['c', '4']
      ])
    })

    it('should allow iterating through all headers with for-of loop', function () {
      const headers = new Headers([
        ['b', '2'],
        ['c', '4'],
        ['a', '1']
      ])
      headers.append('b', '3')
      expect(headers).to.satisfy(i => isIterable(i))

      const result = []
      for (let pair of headers) {
        result.push(pair)
      }
      expect(result).to.deep.equal([
        ['a', '1'],
        ['b', '2'],
        ['b', '3'],
        ['c', '4']
      ])
    })

    it('should allow iterating through all headers with entries()', function () {
      const headers = new Headers([
        ['b', '2'],
        ['c', '4'],
        ['a', '1']
      ])
      headers.append('b', '3')

      const entries = headers.entries()
      assert(isIterable(entries))
      assert(deepIteratesOver(entries, [
        ['a', '1'],
        ['b', '2'],
        ['b', '3'],
        ['c', '4']
      ]))
    })

    it('should allow iterating through all headers with keys()', function () {
      const headers = new Headers([
        ['b', '2'],
        ['c', '4'],
        ['a', '1']
      ])
      headers.append('b', '3')

      const keys = headers.keys()
      assert(isIterable(keys))
      assert(deepIteratesOver(keys, ['a', 'b', 'c']))
    })

    it('should allow iterating through all headers with values()', function () {
      const headers = new Headers([
        ['b', '2'],
        ['c', '4'],
        ['a', '1']
      ])
      headers.append('b', '3')

      const values = headers.values()
      assert(isIterable(values))
      assert(deepIteratesOver(values, ['1', '2', '3', '4']))
    })

    it('should allow deleting header', function () {
      url = `${base}cookie`
      return fetch(url, {useElectronNet}).then(res => {
        res.headers.delete('set-cookie')
        expect(res.headers.get('set-cookie')).to.be.null
      })
    })

    it('should reject illegal header', function () {
      const headers = new Headers()
      expect(() => new Headers({'He y': 'ok'})).to.throw(TypeError)
      expect(() => new Headers({'Hé-y': 'ok'})).to.throw(TypeError)
      expect(() => new Headers({'He-y': 'ăk'})).to.throw(TypeError)
      expect(() => headers.append('Hé-y', 'ok')).to.throw(TypeError)
      expect(() => headers.delete('Hé-y')).to.throw(TypeError)
      expect(() => headers.get('Hé-y')).to.throw(TypeError)
      expect(() => headers.has('Hé-y')).to.throw(TypeError)
      expect(() => headers.set('Hé-y', 'ok')).to.throw(TypeError)

      // 'o k' is valid value but invalid name
      expect(() => new Headers({'He-y': 'o k'})).not.to.throw(TypeError)
    })

    it('should ignore unsupported attributes while reading headers', function () {
      const FakeHeader = function () {}
      // prototypes are currently ignored
      // This might change in the future: #181
      FakeHeader.prototype.z = 'fake'

      const res = new FakeHeader()
      res.a = 'string'
      res.b = ['1', '2']
      res.c = ''
      res.d = []
      res.e = 1
      res.f = [1, 2]
      res.g = {a: 1}
      res.h = undefined
      res.i = null
      res.j = NaN
      res.k = true
      res.l = false
      res.m = Buffer.from('test')

      const h1 = new Headers(res)
      h1.set('n', [1, 2])
      h1.append('n', ['3', 4])

      const h1Raw = h1.raw()

      expect(h1Raw['a']).to.include('string')
      expect(h1Raw['b']).to.include('1,2')
      expect(h1Raw['c']).to.include('')
      expect(h1Raw['d']).to.include('')
      expect(h1Raw['e']).to.include('1')
      expect(h1Raw['f']).to.include('1,2')
      expect(h1Raw['g']).to.include('[object Object]')
      expect(h1Raw['h']).to.include('undefined')
      expect(h1Raw['i']).to.include('null')
      expect(h1Raw['j']).to.include('NaN')
      expect(h1Raw['k']).to.include('true')
      expect(h1Raw['l']).to.include('false')
      expect(h1Raw['m']).to.include('test')
      expect(h1Raw['n']).to.include('1,2')
      expect(h1Raw['n']).to.include('3,4')

      expect(h1Raw['z']).to.be.undefined
    })

    it('should wrap headers', function () {
      const h1 = new Headers({
        a: '1'
      })
      const h1Raw = h1.raw()

      const h2 = new Headers(h1)
      h2.set('b', '1')
      const h2Raw = h2.raw()

      const h3 = new Headers(h2)
      h3.append('a', '2')
      const h3Raw = h3.raw()

      expect(h1Raw['a']).to.include('1')
      expect(h1Raw['a']).to.not.include('2')

      expect(h2Raw['a']).to.include('1')
      expect(h2Raw['a']).to.not.include('2')
      expect(h2Raw['b']).to.include('1')

      expect(h3Raw['a']).to.include('1')
      expect(h3Raw['a']).to.include('2')
      expect(h3Raw['b']).to.include('1')
    })

    it('should accept headers as an iterable of tuples', function () {
      let headers

      headers = new Headers([
        ['a', '1'],
        ['b', '2'],
        ['a', '3']
      ])
      expect(headers.get('a')).to.equal('1,3')
      expect(headers.get('b')).to.equal('2')

      headers = new Headers([
        new Set(['a', '1']),
        ['b', '2'],
        new Map([['a', null], ['3', null]]).keys()
      ])
      expect(headers.get('a')).to.equal('1,3')
      expect(headers.get('b')).to.equal('2')

      headers = new Headers(new Map([
        ['a', '1'],
        ['b', '2']
      ]))
      expect(headers.get('a')).to.equal('1')
      expect(headers.get('b')).to.equal('2')
    })

    it('should throw a TypeError if non-tuple exists in a headers initializer', function () {
      expect(() => new Headers([['b', '2', 'huh?']])).to.throw(TypeError)
      expect(() => new Headers(['b2'])).to.throw(TypeError)
      expect(() => new Headers('b2')).to.throw(TypeError)
      expect(() => new Headers({[Symbol.iterator]: 42})).to.throw(TypeError)
    })

    it('should support fetch with Request instance', function () {
      url = `${base}hello`
      const req = new Request(url)
      return fetch(req, {useElectronNet}).then(res => {
        expect(res.url).to.equal(url)
        expect(res.ok).to.be.true
        expect(res.status).to.equal(200)
      })
    })

    it('should support fetch with Node.js URL object', function () {
      url = `${base}hello`
      const urlObj = parseURL(url)
      const req = new Request(urlObj)
      return fetch(req, {useElectronNet}).then(res => {
        expect(res.url).to.equal(url)
        expect(res.ok).to.be.true
        expect(res.status).to.equal(200)
      })
    })

    it('should support fetch with WHATWG URL object', function () {
      url = `${base}hello`
      const urlObj = new URL(url)
      const req = new Request(urlObj)
      return fetch(req, {useElectronNet}).then(res => {
        expect(res.url).to.equal(url)
        expect(res.ok).to.be.true
        expect(res.status).to.equal(200)
      })
    })

    it('should support blob round-trip', function () {
      url = `${base}hello`

      let length, type

      return fetch(url, {useElectronNet}).then(res => res.blob()).then(blob => {
        url = `${base}inspect`
        length = blob.size
        type = blob.type
        return fetch(url, {
          method: 'POST',
          body: blob,
          useElectronNet
        })
      }).then(res => res.json()).then(({body, headers}) => {
        expect(body).to.equal('world')
        expect(headers['content-type']).to.equal(type)
        expect(headers['content-length']).to.equal(String(length))
      })
    })

    it('should support wrapping Request instance', function () {
      url = `${base}hello`

      const form = new FormData()
      form.append('a', '1')

      const r1 = new Request(url, {
        method: 'POST',
        follow: 1,
        body: form
      })
      const r2 = new Request(r1, {
        follow: 2
      })

      expect(r2.url).to.equal(url)
      expect(r2.method).to.equal('POST')
      // note that we didn't clone the body
      expect(r2.body).to.equal(form)
      expect(r1.follow).to.equal(1)
      expect(r2.follow).to.equal(2)
      expect(r1.counter).to.equal(0)
      expect(r2.counter).to.equal(0)
    })

    it('should support overwrite Request instance', function () {
      url = `${base}inspect`
      const req = new Request(url, {
        method: 'POST',
        headers: {
          a: '1'
        },
        useElectronNet
      })
      return fetch(req, {
        method: 'GET',
        headers: {
          a: '2'
        }
      }).then(res => {
        return res.json()
      }).then(body => {
        expect(body.method).to.equal('GET')
        expect(body.headers.a).to.equal('2')
      })
    })

    it('should throw error with GET/HEAD requests with body', function () {
      expect(() => new Request('.', {body: ''}))
        .to.throw(TypeError)
      expect(() => new Request('.', {body: 'a'}))
        .to.throw(TypeError)
      expect(() => new Request('.', {body: '', method: 'HEAD'}))
        .to.throw(TypeError)
      expect(() => new Request('.', {body: 'a', method: 'HEAD'}))
        .to.throw(TypeError)
    })

    it('should support empty options in Response constructor', function () {
      let body = resumer().queue('a=1').end()
      body = body.pipe(new stream.PassThrough())
      const res = new Response(body)
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support parsing headers in Response constructor', function () {
      const res = new Response(null, {
        headers: {
          a: '1'
        }
      })
      expect(res.headers.get('a')).to.equal('1')
    })

    it('should support text() method in Response constructor', function () {
      const res = new Response('a=1')
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support json() method in Response constructor', function () {
      const res = new Response('{"a":1}')
      return res.json().then(result => {
        expect(result.a).to.equal(1)
      })
    })

    it('should support buffer() method in Response constructor', function () {
      const res = new Response('a=1')
      return res.buffer().then(result => {
        expect(result.toString()).to.equal('a=1')
      })
    })

    it('should support blob() method in Response constructor', function () {
      const res = new Response('a=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        }
      })
      return res.blob().then(function (result) {
        expect(result).to.be.an.instanceOf(Blob)
        expect(result.isClosed).to.be.false
        expect(result.size).to.equal(3)
        expect(result.type).to.equal('text/plain')

        result.close()
        expect(result.isClosed).to.be.true
        expect(result.size).to.equal(0)
        expect(result.type).to.equal('text/plain')
      })
    })

    it('should support clone() method in Response constructor', function () {
      let body = resumer().queue('a=1').end()
      body = body.pipe(new stream.PassThrough())
      const res = new Response(body, {
        headers: {
          a: '1'
        },
        url: base,
        status: 346,
        statusText: 'production'
      })
      const cl = res.clone()
      expect(cl.headers.get('a')).to.equal('1')
      expect(cl.url).to.equal(base)
      expect(cl.status).to.equal(346)
      expect(cl.statusText).to.equal('production')
      expect(cl.ok).to.be.false
      // clone body shouldn't be the same body
      expect(cl.body).to.not.equal(body)
      return cl.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support stream as body in Response constructor', function () {
      let body = resumer().queue('a=1').end()
      body = body.pipe(new stream.PassThrough())
      const res = new Response(body)
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support string as body in Response constructor', function () {
      const res = new Response('a=1')
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support buffer as body in Response constructor', function () {
      const res = new Response(Buffer.from('a=1'))
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support blob as body in Response constructor', function () {
      const res = new Response(new Blob(['a=1']))
      return res.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should default to null as body', function () {
      const res = new Response()
      expect(res.body).to.equal(null)
      const req = new Request('.')
      expect(req.body).to.equal(null)

      const cb = result => expect(result).to.equal('')
      return Promise.all([
        res.text().then(cb),
        req.text().then(cb)
      ])
    })

    it('should default to 200 as status code', function () {
      const res = new Response(null)
      expect(res.status).to.equal(200)
    })

    it('should support parsing headers in Request constructor', function () {
      url = base
      const req = new Request(url, {
        headers: {
          a: '1'
        }
      })
      expect(req.url).to.equal(url)
      expect(req.headers.get('a')).to.equal('1')
    })

    it('should support arrayBuffer() method in Request constructor', function () {
      url = base
      const req = new Request(url, {
        method: 'POST',
        body: 'a=1'
      })
      expect(req.url).to.equal(url)
      return req.arrayBuffer().then(function (result) {
        expect(result).to.be.an.instanceOf(ArrayBuffer)
        const str = String.fromCharCode.apply(null, new Uint8Array(result))
        expect(str).to.equal('a=1')
      })
    })

    it('should support text() method in Request constructor', function () {
      url = base
      const req = new Request(url, {
        method: 'POST',
        body: 'a=1'
      })
      expect(req.url).to.equal(url)
      return req.text().then(result => {
        expect(result).to.equal('a=1')
      })
    })

    it('should support json() method in Request constructor', function () {
      url = base
      const req = new Request(url, {
        method: 'POST',
        body: '{"a":1}'
      })
      expect(req.url).to.equal(url)
      return req.json().then(result => {
        expect(result.a).to.equal(1)
      })
    })

    it('should support buffer() method in Request constructor', function () {
      url = base
      const req = new Request(url, {
        method: 'POST',
        body: 'a=1'
      })
      expect(req.url).to.equal(url)
      return req.buffer().then(result => {
        expect(result.toString()).to.equal('a=1')
      })
    })

    it('should support blob() method in Request constructor', function () {
      url = base
      const req = new Request(url, {
        method: 'POST',
        body: Buffer.from('a=1')
      })
      expect(req.url).to.equal(url)
      return req.blob().then(function (result) {
        expect(result).to.be.an.instanceOf(Blob)
        expect(result.isClosed).to.be.false
        expect(result.size).to.equal(3)
        expect(result.type).to.equal('')

        result.close()
        expect(result.isClosed).to.be.true
        expect(result.size).to.equal(0)
        expect(result.type).to.equal('')
      })
    })

    it('should support arbitrary url in Request constructor', function () {
      url = 'anything'
      const req = new Request(url)
      expect(req.url).to.equal('anything')
    })

    it('should support clone() method in Request constructor', function () {
      url = base
      let body = resumer().queue('a=1').end()
      body = body.pipe(new stream.PassThrough())
      const req = new Request(url, {
        body,
        method: 'POST',
        redirect: 'manual',
        headers: {
          b: '2'
        },
        follow: 3
      })
      const cl = req.clone()
      expect(cl.url).to.equal(url)
      expect(cl.method).to.equal('POST')
      expect(cl.redirect).to.equal('manual')
      expect(cl.headers.get('b')).to.equal('2')
      expect(cl.follow).to.equal(3)
      expect(cl.method).to.equal('POST')
      expect(cl.counter).to.equal(0)
      // clone body shouldn't be the same body
      expect(cl.body).to.not.equal(body)
      return Promise.all([cl.text(), req.text()]).then(results => {
        expect(results[0]).to.equal('a=1')
        expect(results[1]).to.equal('a=1')
      })
    })

    it('should support arrayBuffer(), blob(), text(), json() and buffer() method in Body constructor', function () {
      const body = new Body('a=1')
      expect(body).to.have.property('arrayBuffer')
      expect(body).to.have.property('blob')
      expect(body).to.have.property('text')
      expect(body).to.have.property('json')
      expect(body).to.have.property('buffer')
    })

    it('should create custom FetchError', function funcName () {
      const systemError = new Error('system')
      systemError.code = 'ESOMEERROR'

      const err = new FetchError('test message', 'test-error', systemError)
      expect(err).to.be.an.instanceof(Error)
      expect(err).to.be.an.instanceof(FetchError)
      expect(err.name).to.equal('FetchError')
      expect(err.message).to.equal('test message')
      expect(err.type).to.equal('test-error')
      expect(err.code).to.equal('ESOMEERROR')
      expect(err.errno).to.equal('ESOMEERROR')
      expect(err.stack).to.include('funcName')
        .and.to.satisfy(s => s.startsWith(`${err.name}: ${err.message}`))
    })

    it('should support https request', function () {
      this.timeout(5000)
      url = 'https://github.com/'
      opts = {
        method: 'HEAD',
        useElectronNet
      }
      return fetch(url, opts).then(res => {
        expect(res.status).to.equal(200)
        expect(res.ok).to.be.true
      })
    })

    if (!useElectronNet) { // TODO: does not work on electron, see https://github.com/electron/electron/issues/8074
      it('should throw on https with bad cert', function () {
        this.timeout(5000)
        url = 'https://expired.badssl.com//'
        opts = {
          method: 'GET',
          useElectronNet
        }
        return expect(fetch(url, opts)).to.eventually.be.rejectedWith(FetchError)
      })
    }

    it('should send an https post request', function () {
      this.timeout(5000)
      const body = 'tototata'
      return fetch('https://httpbin.org/post', {
        url: 'https://httpbin.org/post',
        method: 'POST',
        body,
        useElectronNet
      }).then(res => {
        expect(res.status).to.equal(200)
        expect(res.ok).to.be.true
        return res.json()
      }).then(res => {
        expect(res.data).to.equal(body)
      })
    })

    if (useElectronNet) {
      const electron = require('electron')
      const unauthenticatedProxySession = electron.session.fromPartition('unauthenticated-proxy')
      const authenticatedProxySession = electron.session.fromPartition('authenticated-proxy')
      const waitForSessions = new Promise(resolve => unauthenticatedProxySession.setProxy({proxyRules: `http://${unauthenticatedProxy.hostname}:${unauthenticatedProxy.port}`}, () => resolve()))
        .then(() => new Promise(resolve => authenticatedProxySession.setProxy({proxyRules: `http://${authenticatedProxy.hostname}:${authenticatedProxy.port}`}, () => resolve())))

      it('should connect through unauthenticated proxy', () => {
        url = `${base}plain`
        return waitForSessions
          .then(() => fetch(url, {
            useElectronNet,
            session: unauthenticatedProxySession
          }))
          .then(res => {
            expect(res.headers.get('content-type')).to.equal('text/plain')
            return res.text().then(result => {
              expect(res.bodyUsed).to.be.true
              expect(result).to.be.a('string')
              expect(result).to.equal('text')
            })
          })
      })

      it('should fail through authenticated proxy without credentials', () => {
        url = `${base}plain`
        return waitForSessions
          .then(() => expect(
            fetch(url, {
              useElectronNet,
              session: authenticatedProxySession
            })
          ).to.eventually.be.rejectedWith(FetchError).and.have.property('code', 'PROXY_AUTH_FAILED'))
      })

      it('should connect through authenticated proxy with credentials', () => {
        url = `${base}plain`
        return waitForSessions
          .then(() => fetch(url, {
            useElectronNet,
            session: authenticatedProxySession,
            user: 'testuser',
            password: 'testpassword'
          }))
          .then(res => {
            expect(res.headers.get('content-type')).to.equal('text/plain')
            return res.text().then(result => {
              expect(res.bodyUsed).to.be.true
              expect(result).to.be.a('string')
              expect(result).to.equal('text')
            })
          })
      })

      it('should connect through authenticated proxy with onLogin callback', () => {
        url = `${base}plain`
        return waitForSessions
          .then(() => fetch(url, {
            useElectronNet,
            session: authenticatedProxySession,
            onLogin (ev, authInfo, authCallback) {
              ev.preventDefault()

              setTimeout(() => {
                authCallback('testuser', 'testpassword')
              }, 10)
            }
          }))
          .then(res => {
            expect(res.headers.get('content-type')).to.equal('text/plain')
            return res.text().then(result => {
              expect(res.bodyUsed).to.be.true
              expect(result).to.be.a('string')
              expect(result).to.equal('text')
            })
          })
      })
    }
  })

  function streamToPromise (stream, dataHandler) {
    return new Promise((resolve, reject) => {
      stream.on('data', (...args) => {
        Promise.resolve()
          .then(() => dataHandler(...args))
          .catch(reject)
      })
      stream.on('end', resolve)
      stream.on('error', reject)
    })
  }
}

createTestSuite(false)
if (process.versions.electron) createTestSuite(true)
