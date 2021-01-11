const path = require('path')

module.exports = {
  'env': {
    'test': {
      'presets': [
        [
          '@babel/preset-env',
          {
            'loose': true,
            'targets': {
              'node': 6
            }
          }
        ]
      ],
      'plugins': [
        path.resolve('./build/babel-plugin.js')
      ]
    },
    'coverage': {
      'presets': [
        [
          '@babel/preset-env',
          {
            'loose': true,
            'targets': {
              'node': 6
            }
          }
        ]
      ],
      'plugins': [
        [
          'istanbul',
          {
            'exclude': [
              'src/blob.js',
              'build',
              'test'
            ]
          }
        ],
        path.resolve('./build/babel-plugin.js')
      ]
    },
    'rollup': {
      'presets': [
        [
          '@babel/preset-env',
          {
            'loose': true,
            'targets': {
              'node': 6
            },
            'modules': false
          }
        ]
      ]
    }
  }
}
