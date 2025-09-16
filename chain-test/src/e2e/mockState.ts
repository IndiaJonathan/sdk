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
import { ChainUser, SigningScheme, signatures, UserProfile } from "@gala-chain/api";

function getAdminUser(): ChainUser | undefined {
  const privateKey = process.env.DEV_ADMIN_PRIVATE_KEY;

  if (!privateKey) {
    return undefined;
  }

  return new ChainUser({ name: "admin", privateKey });
}

const PUBLIC_KEY_PREFIX = "\u0000GCPK\u0000";
const USER_PROFILE_PREFIX = "\u0000GCUP\u0000";

function normalizePublicKey(publicKey: string): string {
  return signatures.normalizePublicKey(publicKey).toString("base64");
}

/**
 * Seeds the provided chaincode state with default identities required by mocked tests.
 *
 * Currently this registers the development admin user so that contract calls requiring
 * registrar permissions behave the same way as in a bootstrapped network.
 */
export function seedDefaultMockState(state: Record<string, string>) {
  const adminUser = getAdminUser();

  if (!adminUser) {
    return;
  }

  const adminPkKey = `${PUBLIC_KEY_PREFIX}${adminUser.identityKey}\u0000`;
  if (state[adminPkKey] === undefined) {
    const normalized = normalizePublicKey(adminUser.publicKey);
    state[adminPkKey] = JSON.stringify({
      publicKey: normalized,
      publicKeys: [normalized],
      requiredSignatures: 1,
      signing: SigningScheme.ETH
    });
  }

  const adminProfileKey = `${USER_PROFILE_PREFIX}${adminUser.ethAddress}\u0000`;
  if (state[adminProfileKey] === undefined) {
    state[adminProfileKey] = JSON.stringify({
      alias: adminUser.identityKey,
      ethAddress: adminUser.ethAddress,
      roles: [...UserProfile.ADMIN_ROLES],
      pubKeyCount: 1,
      requiredSignatures: 1
    });
  }
}
