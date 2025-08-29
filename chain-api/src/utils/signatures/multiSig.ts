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
import type { SigningScheme } from "./index";
import ton from "./ton";

export interface SignatureEntry {
  sig: string | Buffer;
  pk: Buffer;
  address?: string;
}

export interface VerificationEntry extends SignatureEntry {
  valid: boolean;
}

function getTonPublicKey(secretKey: Buffer): Buffer {
  let crypto;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    crypto = require("@ton/crypto");
  } catch (e) {
    throw new Error("TON is not supported. Missing library @ton/crypto");
  }

  return crypto.keyPairFromSecretKey(secretKey).publicKey;
}

function sign(
  payload: Buffer,
  privateKeys: Buffer[],
  scheme: SigningScheme,
  includeAddress = false
): SignatureEntry[] {
  return privateKeys.map((priv) => {
    switch (scheme) {
      case "ETH": {
        const sig = eth.signMessage(priv, payload);
        const pubHex = eth.getPublicKey(priv.toString("hex"));
        const pk = Buffer.from(pubHex, "hex");
        const address = includeAddress ? eth.getEthAddress(pubHex) : undefined;
        return { sig, pk, address };
      }
      case "TON": {
        const sig = ton.signMessage(priv, payload);
        const pk = getTonPublicKey(priv);
        const address = includeAddress ? ton.getTonAddress(pk) : undefined;
        return { sig, pk, address };
      }
      default:
        throw new Error(`Unsupported signing scheme: ${scheme}`);
    }
  });
}

function verify(
  payload: Buffer,
  pairs: { sig: string | Buffer; pk: Buffer }[],
  scheme: SigningScheme,
  includeAddress = false
): VerificationEntry[] {
  return pairs.map(({ sig, pk }) => {
    let valid: boolean;
    let address: string | undefined;
    switch (scheme) {
      case "ETH":
        valid = eth.verifySignature(sig as string, payload, pk);
        address = includeAddress ? eth.getEthAddress(pk.toString("hex")) : undefined;
        break;
      case "TON":
        valid = ton.verifySignature(sig as Buffer, payload, pk);
        address = includeAddress ? ton.getTonAddress(pk) : undefined;
        break;
      default:
        throw new Error(`Unsupported signing scheme: ${scheme}`);
    }

    return { sig, pk, address, valid };
  });
}

export default { sign, verify } as const;
