import { ChainCallDTO } from "@gala-chain/api";
import { TestChaincode, TestChaincodeStub } from "@gala-chain/test";

import { DuplicateSignerError, PkInvalidSignatureError } from "../services/PublicKeyError";
import { GalaChainContext } from "../types";
import { PublicKeyContract } from "./PublicKeyContract";
import { authenticate } from "./authenticate";
import { createRegisteredUser } from "./authenticate.testutils.spec";

describe("authenticate multisig", () => {
  it("aggregates multiple signers", async () => {
    const chaincode = new TestChaincode([PublicKeyContract]);
    const user1 = await createRegisteredUser(chaincode);
    const user2 = await createRegisteredUser(chaincode);

    const dto = new ChainCallDTO();
    dto.sign(user1.privateKey);
    dto.signerPublicKey = user2.publicKey;
    dto.addSignature(user2.privateKey);

    const ctx = new GalaChainContext({});
    const stub = new TestChaincodeStub([], chaincode.state, {});
    ctx.setChaincodeStub(stub);

    const result = await authenticate(ctx, dto, 2);

    expect(result.minSignatures).toBe(2);
    expect(result.users).toHaveLength(2);
    expect(result.users[0].alias).toBe(user1.alias);
    expect(result.users[1].alias).toBe(user2.alias);
    expect(ctx.callingUsers).toEqual(result.users);
  });

  it("rejects signatures that mismatch declared signer", async () => {
    const chaincode = new TestChaincode([PublicKeyContract]);
    const user1 = await createRegisteredUser(chaincode);
    const user2 = await createRegisteredUser(chaincode);

    const dto = new ChainCallDTO();
    dto.sign(user1.privateKey);
    dto.signerAddress = user2.ethAddress;
    dto.addSignature(user1.privateKey);

    const ctx = new GalaChainContext({});
    const stub = new TestChaincodeStub([], chaincode.state, {});
    ctx.setChaincodeStub(stub);

    await expect(authenticate(ctx, dto, 2)).rejects.toThrow(PkInvalidSignatureError);
  });

  it("rejects duplicate signatures", async () => {
    const chaincode = new TestChaincode([PublicKeyContract]);
    const user = await createRegisteredUser(chaincode);

    const dto = new ChainCallDTO();
    dto.sign(user.privateKey);
    dto.addSignature(user.privateKey);

    const ctx = new GalaChainContext({});
    const stub = new TestChaincodeStub([], chaincode.state, {});
    ctx.setChaincodeStub(stub);

    await expect(authenticate(ctx, dto, 2)).rejects.toThrow(DuplicateSignerError);
  });
});
