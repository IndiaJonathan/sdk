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
  ChainObject,
  PK_INDEX_KEY,
  PublicKey,
  SigningScheme,
  UP_INDEX_KEY,
  UnauthorizedError,
  UserAlias,
  UserProfile,
  UserProfileWithRoles,
  ValidationFailedError,
  asValidUserAlias,
  createValidChainObject,
  normalizePublicKey,
  signatures
} from "@gala-chain/api";
import { Context } from "fabric-contract-api";

import { GalaChainContext } from "../types";
import {
  DuplicateSignerError,
  PkInvalidSignatureError,
  PkMismatchError,
  PkMissingError,
  PkNotFoundError,
  ProfileExistsError,
  UserProfileNotFoundError
} from "./PublicKeyError";

class MissingSignerError extends ValidationFailedError {
  constructor(signature: string) {
    super(`Missing signerPublicKey or signerAddress field in dto. Signature: ${signature}.`, {
      signature
    });
  }
}

class UserNotRegisteredError extends ValidationFailedError {
  constructor(userId: string) {
    super(`User ${userId} is not registered.`, { userId });
  }
}

export class PublicKeyService {
  private static PK_INDEX_KEY = PK_INDEX_KEY;
  private static UP_INDEX_KEY = UP_INDEX_KEY;

  public static getPublicKeyKey(ctx: Context, userAlias: string): string {
    return ctx.stub.createCompositeKey(PublicKeyService.PK_INDEX_KEY, [userAlias]);
  }

  public static getUserProfileKey(ctx: Context, ethAddress: string): string {
    return ctx.stub.createCompositeKey(PublicKeyService.UP_INDEX_KEY, [ethAddress]);
  }

  public static normalizePublicKey = normalizePublicKey;

  public static async putPublicKey(
    ctx: GalaChainContext,
    publicKey: string,
    userAlias: string,
    signing: SigningScheme
  ): Promise<void> {
    const key = PublicKeyService.getPublicKeyKey(ctx, userAlias);
    const obj = new PublicKey();
    obj.publicKey =
      signing !== SigningScheme.TON ? PublicKeyService.normalizePublicKey(publicKey) : publicKey;
    obj.signing = signing;
    const data = Buffer.from(obj.serialize());
    await ctx.stub.putState(key, data);
  }

  public static async putUserProfile(
    ctx: GalaChainContext,
    address: string,
    userAlias: UserAlias,
    signing: SigningScheme
  ): Promise<void> {
    const key = PublicKeyService.getUserProfileKey(ctx, address);
    const obj = new UserProfile();
    obj.alias = userAlias;

    if (signing === SigningScheme.TON) {
      obj.tonAddress = address;
    } else {
      obj.ethAddress = address;
    }

    const data = Buffer.from(obj.serialize());
    await ctx.stub.putState(key, data);
  }

  public static async invalidateUserProfile(ctx: GalaChainContext, address: string): Promise<void> {
    const key = PublicKeyService.getUserProfileKey(ctx, address);
    const userProfile = await createValidChainObject(UserProfile, {
      alias: asValidUserAlias(`client|invalidated`),
      ethAddress: "0000000000000000000000000000000000000000",
      roles: []
    });

    const data = Buffer.from(userProfile.serialize());
    await ctx.stub.putState(key, data);
  }

  public static getUserAddress(publicKey: string, signing: SigningScheme): string {
    return signing === SigningScheme.TON
      ? signatures.ton.getTonAddress(Buffer.from(publicKey, "base64"))
      : signatures.getEthAddress(signatures.getNonCompactHexPublicKey(publicKey));
  }

  public static async getUserProfile(
    ctx: Context,
    address: string
  ): Promise<UserProfileWithRoles | undefined> {
    const key = PublicKeyService.getUserProfileKey(ctx, address);
    const data = await ctx.stub.getState(key);

    if (data.length > 0) {
      const userProfile = ChainObject.deserialize<UserProfile>(UserProfile, data.toString());

      if (userProfile.roles === undefined) {
        userProfile.roles = Array.from(UserProfile.DEFAULT_ROLES);
      }

      return userProfile as UserProfileWithRoles;
    }

    // check if we want the profile of the admin
    if (process.env.DEV_ADMIN_PUBLIC_KEY) {
      const nonCompactPK = signatures.getNonCompactHexPublicKey(process.env.DEV_ADMIN_PUBLIC_KEY);
      const adminEthAddress = signatures.getEthAddress(nonCompactPK);

      if (adminEthAddress === address) {
        const message =
          `User Profile is not saved on chain for user ${adminEthAddress}. ` +
          `But env variable DEV_ADMIN_PUBLIC_KEY is set for the user. ` +
          `Thus, the public key from env will be used.`;
        ctx.logging.getLogger().warn(message);

        const alias = (process.env.DEV_ADMIN_USER_ID ?? `eth|${adminEthAddress}`) as UserAlias;

        if (!alias.startsWith("eth|") && !alias.startsWith("client|")) {
          const message = `Invalid alias for user: ${alias} with public key: ${process.env.DEV_ADMIN_PUBLIC_KEY}`;
          throw new UnauthorizedError(message, { alias, publicKey: process.env.DEV_ADMIN_PUBLIC_KEY });
        }

        const adminProfile = new UserProfile();
        adminProfile.ethAddress = adminEthAddress;
        adminProfile.alias = alias;
        adminProfile.roles = Array.from(UserProfile.ADMIN_ROLES);

        return adminProfile as UserProfileWithRoles;
      }
    }

    return undefined;
  }

  public static async getUserProfiles(ctx: Context, addresses: string[]): Promise<UserProfileWithRoles[]> {
    if (addresses.length === 0) {
      return [];
    }

    const keys = addresses.map((a) => PublicKeyService.getUserProfileKey(ctx, a));
    const states = await Promise.all(keys.map((k) => ctx.stub.getState(k)));
    const result: UserProfileWithRoles[] = [];

    for (const data of states) {
      if (data.length > 0) {
        const userProfile = ChainObject.deserialize<UserProfile>(UserProfile, data.toString());
        if (userProfile.roles === undefined) {
          userProfile.roles = Array.from(UserProfile.DEFAULT_ROLES);
        }
        result.push(userProfile as UserProfileWithRoles);
      }
    }

    return result;
  }

  public static getDefaultUserProfile(publicKey: string, signing: SigningScheme): UserProfileWithRoles {
    const address = this.getUserAddress(publicKey, signing);
    const profile = new UserProfile();
    profile.alias = asValidUserAlias(`${signing.toLowerCase()}|${address}`);
    profile.ethAddress = signing === SigningScheme.ETH ? address : undefined;
    profile.tonAddress = signing === SigningScheme.TON ? address : undefined;
    profile.roles = Array.from(UserProfile.DEFAULT_ROLES);
    return profile as UserProfileWithRoles;
  }

  public static async getPublicKey(ctx: Context, userId: string): Promise<PublicKey | undefined> {
    const key = PublicKeyService.getPublicKeyKey(ctx, userId);
    const data = await ctx.stub.getState(key);

    if (data.length > 0) {
      const publicKey = ChainObject.deserialize<PublicKey>(PublicKey, data.toString());
      publicKey.signing = publicKey.signing ?? SigningScheme.ETH;

      return publicKey;
    }

    if (userId === process.env.DEV_ADMIN_USER_ID && process.env.DEV_ADMIN_PUBLIC_KEY !== undefined) {
      const message =
        `Public key is not saved on chain for user ${userId}. ` +
        `But env variables DEV_ADMIN_USER_ID and DEV_ADMIN_PUBLIC_KEY are set for the user. ` +
        `Thus, the public key from env will be used.`;
      ctx.logging.getLogger().warn(message);

      const pk = new PublicKey();
      pk.publicKey = process.env.DEV_ADMIN_PUBLIC_KEY;
      pk.signing = SigningScheme.ETH;
      return pk;
    }

    return undefined;
  }

  /**
   * Verifies if the data is properly signed. Throws exception instead.
   */
  public static async ensurePublicKeySignatureIsValid(
    ctx: GalaChainContext,
    userId: string,
    dto: ChainCallDTO
  ): Promise<PublicKey> {
    const pk = await PublicKeyService.getPublicKey(ctx, userId);

    if (pk === undefined) {
      throw new PkMissingError(userId);
    }

    const isSignatureValid = dto.isSignatureValid(pk.publicKey);

    if (!isSignatureValid) {
      throw new PkInvalidSignatureError(userId);
    }

    return pk;
  }

  public static async ensureSignaturesValid(
    ctx: GalaChainContext,
    dto: ChainCallDTO
  ): Promise<UserProfileWithRoles[]> {
    if (!dto.signatures || dto.signatures.length === 0) {
      return [];
    }

    const scheme = dto.signing ?? SigningScheme.ETH;

    const addresses: string[] = [];
    const publicKeys: (string | undefined)[] = [];
    const seen = new Set<string>();

    for (const sig of dto.signatures) {
      let address: string;
      let pk: string | undefined;

      if (sig.signerAddress) {
        address = sig.signerAddress;
      } else if (sig.signerPublicKey) {
        address = PublicKeyService.getUserAddress(sig.signerPublicKey, scheme);
        pk = sig.signerPublicKey;
      } else {
        let recovered: string | undefined;
        if (dto.signing !== SigningScheme.TON) {
          try {
            recovered = signatures.recoverPublicKey(sig.signature, dto, dto.prefix ?? "");
          } catch {
            recovered = undefined;
          }
        }
        if (recovered) {
          address = PublicKeyService.getUserAddress(recovered, scheme);
          pk = signatures.getCompactBase64PublicKey(recovered);
        } else {
          throw new MissingSignerError(sig.signature);
        }
      }

      if (seen.has(address)) {
        throw new DuplicateSignerError(address);
      }
      seen.add(address);

      addresses.push(address);
      publicKeys.push(pk);
    }

    const profilesArr = await PublicKeyService.getUserProfiles(ctx, addresses);
    const profileMap = new Map<string, UserProfileWithRoles>();
    for (const p of profilesArr) {
      if (p.ethAddress) {
        profileMap.set(p.ethAddress, p);
      }
      if (p.tonAddress) {
        profileMap.set(p.tonAddress, p);
      }
    }

    const users: UserProfileWithRoles[] = [];

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      let profile = profileMap.get(address);
      let pk = publicKeys[i];

      if (!profile) {
        if (ctx.config.allowNonRegisteredUsers && pk) {
          profile = PublicKeyService.getDefaultUserProfile(pk, scheme);
        } else {
          throw new UserNotRegisteredError(address);
        }
      }

      if (!pk) {
        const pkObj = await PublicKeyService.getPublicKey(ctx, profile.alias);
        if (!pkObj) {
          throw new PkMissingError(profile.alias);
        }
        pk = pkObj.publicKey;
        publicKeys[i] = pk;
      }

      users.push(profile);
    }

    for (let i = 0; i < dto.signatures.length; i++) {
      const sig = dto.signatures[i];
      const pk = publicKeys[i] as string;
      const user = users[i];

      const isValid =
        dto.signing === SigningScheme.TON
          ? signatures.ton.isValidSignature(
              Buffer.from(sig.signature ?? "", "base64"),
              dto,
              Buffer.from(pk, "base64"),
              dto.prefix
            )
          : signatures.isValid(sig.signature ?? "", dto, pk);

      if (!isValid) {
        const alias = user?.alias ?? addresses[i];
        throw new PkInvalidSignatureError(alias);
      }
    }

    return users;
  }

  public static async registerUser(
    ctx: GalaChainContext,
    providedPkHex: string,
    ethAddress: string,
    userAlias: UserAlias,
    signing: SigningScheme
  ): Promise<string> {
    const currPublicKey = await PublicKeyService.getPublicKey(ctx, userAlias);

    // If we are migrating a legacy user to new flow, the public key should match
    if (currPublicKey !== undefined) {
      const nonCompactCurrPubKey = signatures.getNonCompactHexPublicKey(currPublicKey.publicKey);
      if (nonCompactCurrPubKey !== providedPkHex) {
        throw new PkMismatchError(userAlias);
      }
    }

    // If User Profile already exists on chain for this ethereum address, we should not allow registering the same user again
    const existingUserProfile = await PublicKeyService.getUserProfile(ctx, ethAddress);
    if (existingUserProfile !== undefined) {
      throw new ProfileExistsError(ethAddress, existingUserProfile.alias);
    }

    // supports legacy flow (required for backwards compatibility)
    await PublicKeyService.putPublicKey(ctx, providedPkHex, userAlias, signing);

    // for the new flow, we need to store the user profile separately
    await PublicKeyService.putUserProfile(ctx, ethAddress, userAlias, signing);

    return userAlias;
  }

  public static async updatePublicKey(
    ctx: GalaChainContext,
    newPkHex: string,
    newAddress: string,
    signing: SigningScheme
  ): Promise<void> {
    const userAlias = ctx.callingUser;

    // fetch old public key for finding old user profile
    const oldPublicKey = await PublicKeyService.getPublicKey(ctx, ctx.callingUser);
    if (oldPublicKey === undefined) {
      throw new PkNotFoundError(userAlias);
    }

    // need to fetch userProfile from old address
    const oldAddress = PublicKeyService.getUserAddress(oldPublicKey.publicKey, signing);
    const userProfile = await PublicKeyService.getUserProfile(ctx, oldAddress);

    // Note: we don't throw an error if userProfile is undefined in order to support legacy users with unsaved profiles
    if (userProfile !== undefined) {
      // invalidate old user profile
      await PublicKeyService.invalidateUserProfile(ctx, oldAddress);
    }

    // ensure no user profile exists under new address
    const newUserProfile = await PublicKeyService.getUserProfile(ctx, newAddress);
    if (newUserProfile !== undefined) {
      throw new ProfileExistsError(newAddress, newUserProfile.alias);
    }

    // update Public Key, and add user profile under new eth address
    await PublicKeyService.putPublicKey(ctx, newPkHex, userAlias, signing);
    await PublicKeyService.putUserProfile(ctx, newAddress, userAlias, signing);
  }

  public static async updateUserRoles(ctx: GalaChainContext, user: string, roles: string[]): Promise<void> {
    const publicKey = await PublicKeyService.getPublicKey(ctx, user);

    if (publicKey === undefined) {
      throw new PkNotFoundError(user);
    }

    const address = PublicKeyService.getUserAddress(
      publicKey.publicKey,
      publicKey.signing ?? SigningScheme.ETH
    );
    const profile = await PublicKeyService.getUserProfile(ctx, address);

    if (profile === undefined) {
      throw new UserProfileNotFoundError(user);
    }

    profile.roles = Array.from(new Set(roles)).sort();

    const key = PublicKeyService.getUserProfileKey(ctx, address);
    const data = Buffer.from(profile.serialize());
    await ctx.stub.putState(key, data);
  }
}
