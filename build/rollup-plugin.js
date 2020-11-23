export default function tweakDefault () {
  return {
    transformBundle: function (source) {
      const lines = source.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const matches = /^exports\['default'] = (.*);$/.exec(line)
        if (matches) {
          lines[i] = 'module.exports = exports = ' + matches[1] + ';'
          break
        }
      }
      return lines.join('\n')
    }
  }
}
