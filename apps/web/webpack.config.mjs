import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const root = path.dirname(fileURLToPath(import.meta.url));

export default (_env, argv) => ({
  mode: argv.mode ?? 'development',
  entry: path.resolve(root, 'src/main.tsx'),
  output: {
    path: path.resolve(root, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
    publicPath: '/',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    alias: {
      '@umu-hr/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(root, 'tsconfig.json'),
            transpileOnly: true,
            compilerOptions: { declaration: false, noEmit: false },
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ template: path.resolve(root, 'index.html') })],
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-cheap-module-source-map',
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
    proxy: [{ context: ['/api'], target: 'http://localhost:4000', changeOrigin: true }],
  },
});
