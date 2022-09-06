const fs = require('fs');
const path = require('path');

module.exports = {
  entry: {
    bundle: path.join(__dirname, 'src/browser.ts')
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist/browser'),
    libraryTarget: 'umd'
  },
  target: 'node',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
    alias: {
      ws: require.resolve('isomorphic-ws/browser.js')
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
