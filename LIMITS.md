
Known differences
=================

*As of 1.x release*

- Topics such as Cross-Origin, Content Security Policy, Mixed Content, Service Workers are ignored.

- URL input must be an absolute URL, using either `http` or `https` as scheme.

- On the upside, there are no forbidden headers.

- `res.url` DOES NOT contain the final url when following redirects while running on Electron, due to a limit in Electron's net module (see https://github.com/electron/electron/issues/8868).

- Impossible to control redirection behaviour when running on Electron (see https://github.com/electron/electron/issues/8868).

- For convenience, `res.body` is a Node.js [Readable stream][readable-stream], so decoding can be handled independently.

- Similarly, `req.body` can either be `null`, a string, a buffer or a Readable stream.

- Also, you can handle rejected fetch requests through checking `err.type` and `err.code`. See [ERROR-HANDLING.md][] for more info.

- Only support `res.text()`, `res.json()`, `res.blob()`, `res.arraybuffer()`, `res.buffer()`

- There is currently no built-in caching, as server-side caching varies by use-cases.

- Current implementation lacks cookie store, you will need to extract `Set-Cookie` headers manually.

- If you are using `res.clone()` and writing an isomorphic app, note that stream on Node.js have a smaller internal buffer size (16Kb, aka `highWaterMark`) from client-side browsers (>1Mb, not consistent across browsers).

[readable-stream]: https://nodejs.org/api/stream.html#stream_readable_streams
[ERROR-HANDLING.md]: https://github.com/bitinn/node-fetch/blob/master/ERROR-HANDLING.md
