const fs = require("fs");
const path = require("path");
const Module = require("module");
const tsnode = require("ts-node");
const tsConfigPaths = require("tsconfig-paths");

const compilerOptions = {
  module: "commonjs",
  moduleResolution: "node",
  target: "es2019",
  esModuleInterop: true,
  emitDecoratorMetadata: true,
  experimentalDecorators: true,
  baseUrl: path.resolve(__dirname, "../.."),
  paths: {
    "@gala-chain/api": ["chain-api/src/index.ts"],
    "@gala-chain/chaincode": ["chaincode/src/index.ts"],
    "@gala-chain/cli": ["chain-cli/src/index.ts"],
    "@gala-chain/client": ["chain-client/src/index.ts"],
    "@gala-chain/connect": ["chain-connect/src/index.ts"],
    "@gala-chain/test": ["chain-test/src/index.ts"]
  },
  moduleSuffixes: [".ts", ".tsx", ".d.ts", ".js", ""]
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (
    typeof request === "string" &&
    parent &&
    (request.startsWith("./") || request.startsWith("../")) &&
    request.endsWith(".js")
  ) {
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (err) {
      const candidate = path.resolve(path.dirname(parent.filename), request);
      const tsCandidate = candidate.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsCandidate)) {
        return originalResolveFilename.call(this, tsCandidate, parent, isMain, options);
      }
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Register ts-node so that TypeScript contracts can be loaded on demand.
tsnode.register({
  transpileOnly: true,
  compilerOptions
});

// Ensure TypeScript path aliases resolve correctly when requiring modules.
tsConfigPaths.register({
  baseUrl: compilerOptions.baseUrl,
  paths: compilerOptions.paths
});

require("reflect-metadata");

const { PublicKeyContract } = require(path.resolve(
  __dirname,
  "../../chaincode/src/contracts/PublicKeyContract"
));
const GalaChainTokenContract = require(path.resolve(
  __dirname,
  "../../chaincode/src/__test__/GalaChainTokenContract"
)).default;

module.exports = {
  contracts: [PublicKeyContract, GalaChainTokenContract]
};
