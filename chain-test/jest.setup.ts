import * as fs from "fs";
import * as path from "path";

const networkRoot =
  process.env.GALA_NETWORK_ROOT_PATH ?? path.resolve(__dirname, "../chain-cli/network");

process.env.GALA_NETWORK_ROOT_PATH = networkRoot;
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";

const mockedChaincodeDir = path.resolve(__dirname, "mock-network");

for (const key of [
  "CURATORORG_MOCKED_CHAINCODE_DIR",
  "USERSORG1_MOCKED_CHAINCODE_DIR",
  "PARTNERORG1_MOCKED_CHAINCODE_DIR"
]) {
  if (process.env[key] === undefined) {
    process.env[key] = mockedChaincodeDir;
  }
}

if (process.env.DEV_ADMIN_PRIVATE_KEY === undefined) {
  const adminKeyPath = path.resolve(networkRoot, "dev-admin-key/dev-admin.priv.hex.txt");

  try {
    const key = fs.readFileSync(adminKeyPath, "utf8").trim();
    if (key.length > 0) {
      process.env.DEV_ADMIN_PRIVATE_KEY = key;
    }
  } catch {
    // Fallback to the default development key used by the mock network fixtures.
    process.env.DEV_ADMIN_PRIVATE_KEY = "62172f65ecab45f423f7088128eee8946c5b3c03911cb0b061b1dd9032337271";
  }
}
