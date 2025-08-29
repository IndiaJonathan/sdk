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
import signatures, { SigningScheme } from "./";

describe("multiSig", () => {
  it("signs and verifies multiple ETH signatures", () => {
    const privateKey1 = Buffer.from(
      "3b19099e96dccf44e1dfc13c89c7e490d902a96b0791faf185e194ae0e71786d",
      "hex"
    );
    const pair2 = signatures.genKeyPair();
    const privateKey2 = Buffer.from(pair2.privateKey, "hex");
    const payload = Buffer.from("hello multi");

    const signed = signatures.multiSig.sign(payload, SigningScheme.ETH, [privateKey1, privateKey2], true);
    expect(signed).toHaveLength(2);

    const verify = signatures.multiSig.verify(
      payload,
      SigningScheme.ETH,
      signed.map(({ sig, pk }) => ({ sig, pk })),
      true
    );
    verify.forEach((v, idx) => {
      expect(v.ok).toBeTruthy();
      expect(v.address).toEqual(signed[idx].address);
    });
  });

  it("signs and verifies multiple TON signatures", async () => {
    const key1 = Buffer.from(
      "wa50qZmPeW5qyETdnYPSRLzdOD6Fv3R/drWgPYkcy6aRiZKhoZ29Lc2MtqJkRVTjR7gDJgXR0qGaPbMFNszGPw==",
      "base64"
    );
    const pair2 = await signatures.ton.genKeyPair();
    const payload = Buffer.from("ton multi");

    const signed = signatures.multiSig.sign(payload, SigningScheme.TON, [key1, pair2.secretKey], true);
    expect(signed).toHaveLength(2);

    const verify = signatures.multiSig.verify(
      payload,
      SigningScheme.TON,
      signed.map(({ sig, pk }) => ({ sig, pk })),
      true
    );
    verify.forEach((v, idx) => {
      expect(v.ok).toBeTruthy();
      expect(v.address).toEqual(signed[idx].address);
    });
  });
});
