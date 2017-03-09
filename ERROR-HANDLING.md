
Error handling with electron-fetch
==============================

Because `window.fetch` isn't designed to transparent about the cause of request errors, we have to come up with our own solutions.

The basics:

- All [operational errors][joyent-guide] are rejected as [FetchError](https://github.com/arantes555/electron-fetch/blob/master/README.md#class-fetcherror), you can handle them all through promise `catch` clause.

- All errors comes with `err.message` detailing the cause of errors.

- All errors originated from `electron-fetch` are marked with custom `err.type`.

- All errors originated from Electron's net module are marked with `err.type = 'system'`, and contains addition `err.code` and `err.errno` for error handling, they are alias to error codes thrown by Node.js core.

- [Programmer errors][joyent-guide] are either thrown as soon as possible, or rejected with default `Error` with `err.message` for ease of troubleshooting.

List of error types:

- Because we maintain 100% coverage, see [test.js](https://github.com/arantes555/electron-fetch/blob/master/test/test.js) for a full list of custom `FetchError` types, as well as some of the common errors from Electron

The limits: 

- If the servers responds with an incorrect or unknown content-encoding, Electron's net module throws an uncatchable error... (see https://github.com/electron/electron/issues/8867).

[joyent-guide]: https://www.joyent.com/node-js/production/design/errors#operational-errors-vs-programmer-errors
