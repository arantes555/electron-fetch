// Inspired from https://github.com/MarshallOfSound/Google-Play-Music-Desktop-Player-UNOFFICIAL-
const istanbulAPI = require('istanbul-api')
const libCoverage = require('istanbul-lib-coverage')
const specReporter = require('mocha/lib/reporters/spec.js')
const inherits = require('mocha/lib/utils').inherits

function Istanbul (runner) {
  specReporter.call(this, runner)

  runner.on('end', () => {
    const mainReporter = istanbulAPI.createReporter()
    const coverageMap = libCoverage.createCoverageMap()

    coverageMap.merge(global.__coverage__ || {})

    mainReporter.addAll([ 'text', 'json', 'lcov' ])
    mainReporter.write(coverageMap, {})
  })
}

inherits(Istanbul, specReporter)

module.exports = Istanbul
