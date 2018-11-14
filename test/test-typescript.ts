import fetch, { FetchError, Headers, Request, Response } from '../'

import { ok } from 'assert'

ok(typeof fetch === 'function')

ok(typeof FetchError === 'function')

ok(typeof Headers === 'function')

ok(typeof Request === 'function')

ok(typeof Response === 'function')

console.log('typings look ok')
