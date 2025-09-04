/*
 * Copyright (c) Gala Games Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  ChainCallDTO,
  ChainUser,
  GetPublicKeyDto,
  RegisterUserDto,
  createValidDTO,
  createValidSubmitDTO,
  signatures
} from "@gala-chain/api";
import {
  TestChaincode,
  transactionErrorKey,
  transactionSuccess
} from "@gala-chain/test";
import {
  GalaChainContext,
  GalaContract,
  GalaTransaction,
  SUBMIT
} from "@gala-chain/chaincode";
import { PublicKeyContract } from "@gala-chain/chaincode";

describe("multisig quorum enforcement", () => {
  it("handles quorum and duplicate signatures", async () => {
    const ContractClass = class extends GalaContract {
      constructor() {
        super("TestContract", "1.0.0");
      }
      public async Action(ctx: GalaChainContext, dto: ChainCallDTO): Promise<void> {}
    };
    const target = ContractClass.prototype;
    const propertyKey = "Action";
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey) as PropertyDescriptor;
    GalaTransaction({
      type: SUBMIT,
      in: ChainCallDTO,
      out: "object",
      enforceUniqueKey: true,
      verifySignature: true,
      quorum: 2
    })(target, propertyKey, descriptor);
    Object.defineProperty(target, propertyKey, descriptor);

    const chaincode = new TestChaincode([PublicKeyContract, ContractClass]);

    const user = ChainUser.withRandomKeys("multisig-user");
    const other = signatures.genKeyPair();

    const regDto = await createValidSubmitDTO(RegisterUserDto, {
      user: user.identityKey,
      publicKeys: [user.publicKey, other.publicKey],
      requiredSignatures: 2
    });
    const regResp = await chaincode.invoke(
      "PublicKeyContract:RegisterUser",
      regDto.signed(process.env.DEV_ADMIN_PRIVATE_KEY as string)
    );
    expect(regResp).toEqual(transactionSuccess());

    const getDto = await createValidDTO(GetPublicKeyDto, { user: user.identityKey });
    getDto.sign(process.env.DEV_ADMIN_PRIVATE_KEY as string);
    const pkResp = await chaincode.invoke("PublicKeyContract:GetPublicKey", getDto);
    expect(pkResp).toEqual(
      transactionSuccess(
        expect.objectContaining({
          publicKeys: expect.arrayContaining([
            signatures.normalizePublicKey(user.publicKey).toString("base64"),
            signatures.normalizePublicKey(other.publicKey).toString("base64")
          ])
        })
      )
    );

    const dtoInsufficient = new ChainCallDTO();
    dtoInsufficient.sign(user.privateKey);
    const r1 = await chaincode.invoke("TestContract:Action", dtoInsufficient);
    expect(r1).toEqual(transactionErrorKey("UNAUTHORIZED"));

    const dtoDup = new ChainCallDTO();
    dtoDup.sign(user.privateKey);
    dtoDup.sign(user.privateKey);
    const r2 = await chaincode.invoke("TestContract:Action", dtoDup);
    expect(r2).toEqual(transactionErrorKey("DUPLICATE_SIGNER_PUBLIC_KEY"));

    const dtoOk = new ChainCallDTO();
    dtoOk.sign(user.privateKey);
    dtoOk.signerPublicKey = other.publicKey;
    dtoOk.sign(other.privateKey);
    const r3 = await chaincode.invoke("TestContract:Action", dtoOk);
    expect(r3).toEqual(transactionSuccess());
  });
});
