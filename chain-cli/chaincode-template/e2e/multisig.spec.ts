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
  ChainUser,
  RegisterUserDto,
  UpdatePublicKeyDto,
  createValidSubmitDTO,
  signatures
} from "@gala-chain/api";
import { AdminChainClients, TestClients, transactionErrorKey, transactionSuccess } from "@gala-chain/test";

jest.setTimeout(30000);

describe("multisig registration and quorum", () => {
  let client: AdminChainClients;
  let user: ChainUser;
  const other = signatures.genKeyPair();

  beforeAll(async () => {
    client = await TestClients.createForAdmin();
    user = ChainUser.withRandomKeys("e2e-multi");
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("registers user with multiple keys", async () => {
    const dto = await createValidSubmitDTO(RegisterUserDto, {
      user: user.identityKey,
      publicKeys: [user.publicKey, other.publicKey],
      requiredSignatures: 2
    });
    const resp = await client.pk.RegisterUser(dto.signed(client.pk.privateKey));
    expect(resp).toEqual(transactionSuccess());
  });

  it("prevents duplicate public keys", async () => {
    const dup = ChainUser.withRandomKeys("dup-e2e");
    const dto = await createValidSubmitDTO(RegisterUserDto, {
      user: dup.identityKey,
      publicKeys: [dup.publicKey, dup.publicKey],
      requiredSignatures: 1
    });
    const resp = await client.pk.RegisterUser(dto.signed(client.pk.privateKey));
    expect(resp).toEqual(transactionErrorKey("PK_DUPLICATE"));
  });

  it("enforces signature quorum on UpdatePublicKey", async () => {
    const newKey = signatures.genKeyPair();

    const insufficient = await createValidSubmitDTO(UpdatePublicKeyDto, {
      publicKey: newKey.publicKey
    });
    const resp1 = await client.pk.UpdatePublicKey(insufficient.signed(user.privateKey));
    expect(resp1).toEqual(transactionErrorKey("UNAUTHORIZED"));

    const dup = await createValidSubmitDTO(UpdatePublicKeyDto, {
      publicKey: newKey.publicKey
    });
    dup.sign(user.privateKey);
    dup.signerPublicKey = user.publicKey;
    dup.sign(user.privateKey);
    const respDup = await client.pk.UpdatePublicKey(dup);
    expect(respDup).toEqual(transactionErrorKey("DUPLICATE_SIGNER_PUBLIC_KEY"));

    const ok = await createValidSubmitDTO(UpdatePublicKeyDto, {
      publicKey: newKey.publicKey
    });
    ok.sign(user.privateKey);
    ok.signerPublicKey = other.publicKey;
    ok.sign(other.privateKey);
    const resp2 = await client.pk.UpdatePublicKey(ok);
    expect(resp2).toEqual(transactionSuccess());
  });
});
