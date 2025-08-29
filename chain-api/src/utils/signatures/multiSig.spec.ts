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
import eth from "./eth";
import { SigningScheme } from "./index";
import multiSig from "./multiSig";

it("should sign and verify using multiple keys", () => {
  const pair1 = eth.genKeyPair();
  const pair2 = eth.genKeyPair();

  const privKeys = [Buffer.from(pair1.privateKey, "hex"), Buffer.from(pair2.privateKey, "hex")];
  const payload = Buffer.from("multi-sig-test");

  const signatures = multiSig.sign(payload, privKeys, SigningScheme.ETH, true);
  expect(signatures).toHaveLength(2);

  const verify = multiSig.verify(
    payload,
    signatures.map(({ sig, pk }) => ({ sig, pk })),
    SigningScheme.ETH,
    true
  );

  verify.forEach((v, i) => {
    expect(v.valid).toBeTruthy();
    expect(v.address).toBe(signatures[i].address);
  });
});
