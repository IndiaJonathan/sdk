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
import ton from "./ton";

type Scheme = "ETH" | "TON";

interface SignedPayload {
  sig: string | Buffer;
  pk: Buffer;
  address?: string;
}

interface VerifyInput {
  sig: string | Buffer;
  pk: Buffer;
}

interface VerifyResult {
  ok: boolean;
  address?: string;
}

function getTonPublicKey(secretKey: Buffer): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { keyPairFromSecretKey } = require("@ton/crypto");
  return keyPairFromSecretKey(secretKey).publicKey;
}

function sign(payload: Buffer, scheme: Scheme, privateKeys: Buffer[], includeAddress = false): SignedPayload[] {
  return privateKeys.map((sk) => {
    if (scheme === "ETH") {
      const sig = eth.signMessage(sk, payload);
      const pk = Buffer.from(eth.getPublicKey(sk.toString("hex")), "hex");
      const address = includeAddress ? eth.getEthAddress(pk.toString("hex")) : undefined;
      return address ? { sig, pk, address } : { sig, pk };
    } else if (scheme === "TON") {
      const sig = ton.signMessage(sk, payload);
      const pk = getTonPublicKey(sk);
      const address = includeAddress ? ton.getTonAddress(pk) : undefined;
      return address ? { sig, pk, address } : { sig, pk };
    }
    throw new Error(`Unsupported signing scheme: ${scheme}`);
  });
}

function verify(payload: Buffer, scheme: Scheme, pairs: VerifyInput[], includeAddress = false): VerifyResult[] {
  return pairs.map(({ sig, pk }) => {
    if (scheme === "ETH") {
      const ok = eth.verifySignature(sig as string, payload, pk);
      const address = includeAddress ? eth.getEthAddress(pk.toString("hex")) : undefined;
      return address ? { ok, address } : { ok };
    } else if (scheme === "TON") {
      const ok = ton.verifySignature(sig as Buffer, payload, pk);
      const address = includeAddress ? ton.getTonAddress(pk) : undefined;
      return address ? { ok, address } : { ok };
    }
    throw new Error(`Unsupported signing scheme: ${scheme}`);
  });
}

export default { sign, verify } as const;
