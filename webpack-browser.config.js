const fs = require('fs');
const path = require('path');

module.exports = {
  entry: {
    bundle: path.join(__dirname, 'src/index.ts')
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist/browser'),
    libraryTarget: 'umd'
  },
  target: 'web',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
    alias: {
      ws: require.resolve('isomorphic-ws/browser.js')
    },
    fallback: {
      util: false,
      stream: false,
      url: false,
      http: false,
      https: false,
      net: false,
      tls: false,
      zlib: false,
      buffer: false
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts)$/,
        use: {
          loader: 'ts-loader'
        }
      }
    ]
  },
  optimization: {
    minimize: false,
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false
  }
};
