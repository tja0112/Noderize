import createBabelConfig from "./createBabelConfig";
import path from "path";
import supportsColor from "supports-color";
import { resolveApp, appDirectory } from "./utils/path";
import webpack from "webpack";
import webpackUglify from "uglifyjs-webpack-plugin";
import webpackNodeExternals from "webpack-node-externals";
import webpackForkTsChecker from "fork-ts-checker-webpack-plugin";
import webpackHappyPack from "happypack";
import webpackRequire from "webpack-bypass-require";

export function getCompiler(options) {
	const tsconfig = path.resolve(__dirname, "tsconfig.json");
	const happyThreadPool = webpackHappyPack.ThreadPool({
		size: options.buildThreads
	});

	const { javascript, typescript } = options.languages;

	const bundles = options.bundles.reduce((bundles, bundle) => {
		const entries = bundle.entry.map(entry => entry.startsWith("~") ? webpackRequire.resolve(entry.slice(1)) : resolveApp("src", entry));

		if (bundle.polyfill) {
			entries.unshift(webpackRequire.resolve("@babel/polyfill"))
		}

		return { ...bundles, [bundle.output]: entries };
	}, {});

	const exclude = [/node_modules/, /\.test\./, /\.spec\.]/, /__tests__/];

	// Create webpack config
	const config = {
		context: appDirectory,
		entry: bundles,
		output: {
			path: resolveApp("dist"),
			filename: "[name]",
			library: options.name,
			libraryTarget: "umd"
		},

		module: {
			rules: [
				javascript && {
					test: /\.js$/,
					exclude,
					use: "happypack/loader?id=javascript"
				},
				typescript && {
					test: /\.ts$/,
					exclude,
					use: "happypack/loader?id=typescript"
				}
			].filter(Boolean)
		},

		resolve: {
			extensions: [javascript && ".js", typescript && ".ts"].filter(Boolean)
		},

		plugins: [
			javascript &&
			new webpackHappyPack({
				id: "javascript",
				threadPool: happyThreadPool,
				loaders: [
					{
						loader: webpackRequire.resolve("babel-loader"),
						options: createBabelConfig(options)
					}
				],
				verbose: options.debug
			}),
			typescript &&
			new webpackHappyPack({
				id: "typescript",
				threadPool: happyThreadPool,
				loaders: [
					{
						loader: webpackRequire.resolve("ts-loader"),
						options: {
							context: appDirectory,
							configFile: tsconfig,
							happyPackMode: true
						}
					}
				],
				verbose: options.debug
			}),
			typescript &&
			new webpackForkTsChecker({
				checkSyntacticErrors: true,
				tsconfig
			}),
			options.shebang &&
			new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
			options.globals && new webpack.ProvidePlugin(options.globals),
			options.minify && new webpackUglify(),
			options.sourcemap &&
			new webpack.SourceMapDevToolPlugin({
				filename: "[name].map"
			})
		].filter(Boolean),

		target: options.target,
		node: false,

		externals: options.includeExternal
			? undefined
			: webpackNodeExternals({ modulesFromFile: true }),

		stats: {
			warnings: options.debug
		}
	};

	return webpack(config);
}

export function printStats(stats, options) {
	console.log(
		stats.toString({ colors: supportsColor.stdout, warnings: options.debug })
	);
}
