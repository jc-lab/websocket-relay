const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const NodeExternals = require('webpack-node-externals');

module.exports = {
  entry: {
    bundle: path.join(__dirname, 'src/browser.ts')
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
  externalsPresets: {
    node: true
  },
  externals: [
    NodeExternals({})
  ],
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    })
  ],
  optimization: {
    minimize: false,
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false
  }
};
