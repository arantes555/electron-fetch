/**
 * fetch-error.js
 *
 * FetchError interface for operational errors
 */

/**
 * Create FetchError instance
 *
 * @param {string} message Error message for human
 * @param {string} type Error type for machine
 * @param {string} systemError For Node.js system error
 * @return {FetchError}
 */

const netErrorMap = {
  'ERR_CONNECTION_REFUSED': 'ECONNREFUSED',
  'ERR_EMPTY_RESPONSE': 'ECONNRESET',
  'ERR_NAME_NOT_RESOLVED': 'ENOTFOUND',
  'ERR_CONTENT_DECODING_FAILED': 'Z_DATA_ERROR',
  'ERR_CONTENT_DECODING_INIT_FAILED': 'Z_DATA_ERROR'
}

export default function FetchError (message, type, systemError) {
  Error.call(this, message)
  const regex = /^.*net::(.*)/
  if (regex.test(message)) {
    let errorCode = regex.exec(message)[1]
    // istanbul ignore else
    if (netErrorMap.hasOwnProperty(errorCode)) errorCode = netErrorMap[errorCode]
    systemError = { code: errorCode }
  }
  this.message = message
  this.type = type

  // when err.type is `system`, err.code contains system error code
  if (systemError) {
    this.code = this.errno = systemError.code
  }

  // hide custom error implementation details from end-users
  Error.captureStackTrace(this, this.constructor)
}

FetchError.prototype = Object.create(Error.prototype)
FetchError.prototype.constructor = FetchError
FetchError.prototype.name = 'FetchError'
