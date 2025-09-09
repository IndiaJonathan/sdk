import { SigningScheme } from "@gala-chain/api";

import { resolveUserAlias } from "./resolveUserAlias";
import { PublicKeyService } from "./PublicKeyService";

describe("resolveUserAlias", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when alias belongs to multisig profile", async () => {
    const ctx = {} as any;
    jest.spyOn(PublicKeyService, "getPublicKey").mockResolvedValue({
      publicKey: "pk",
      signing: SigningScheme.ETH
    } as any);
    jest.spyOn(PublicKeyService, "getUserAddress").mockReturnValue("0xabc");
    jest.spyOn(PublicKeyService, "getUserProfile").mockResolvedValue({
      requiredSignatures: 2
    } as any);

    await expect(resolveUserAlias(ctx, "client|ms1")).rejects.toThrow(
      "resolveUserAlias is not supported for multisig profiles"
    );
  });

  it("returns alias when not multisig", async () => {
    const ctx = {} as any;
    jest.spyOn(PublicKeyService, "getPublicKey").mockResolvedValue({
      publicKey: "pk",
      signing: SigningScheme.ETH
    } as any);
    jest.spyOn(PublicKeyService, "getUserAddress").mockReturnValue("0xabc");
    jest.spyOn(PublicKeyService, "getUserProfile").mockResolvedValue({
      requiredSignatures: 1,
      alias: "client|user"
    } as any);

    await expect(resolveUserAlias(ctx, "client|user")).resolves.toBe("client|user");
  });
});
