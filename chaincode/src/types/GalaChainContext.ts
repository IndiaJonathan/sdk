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
import { UnauthorizedError, UserAlias, UserProfile, UserRole } from "@gala-chain/api";
import { Context } from "fabric-contract-api";
import { ChaincodeStub, Timestamp } from "fabric-shim";

import { GalaChainStub, createGalaChainStub } from "./GalaChainStub";
import { GalaLoggerInstance, GalaLoggerInstanceImpl } from "./GalaLoggerInstance";

function getTxUnixTime(ctx: Context): number {
  const txTimestamp: Timestamp = ctx.stub.getTxTimestamp();
  // Convert time to milliseconds by multiplying seconds and dividing nanoseconds
  const txUnixTime = txTimestamp.seconds.toNumber() * 1000 + txTimestamp.nanos / 10 ** 6;
  return Math.floor(txUnixTime);
}

export interface GalaChainContextConfig {
  readonly adminPublicKey?: string;
  readonly allowNonRegisteredUsers?: boolean;
}

class GalaChainContextConfigImpl implements GalaChainContextConfig {
  constructor(private readonly config: GalaChainContextConfig) {}

  get adminPublicKey(): string | undefined {
    return this.config.adminPublicKey ?? process.env.DEV_ADMIN_PUBLIC_KEY;
  }

  get allowNonRegisteredUsers(): boolean | undefined {
    return this.config.allowNonRegisteredUsers ?? process.env.ALLOW_NON_REGISTERED_USERS === "true";
  }
}

export class GalaChainContext extends Context {
  stub: GalaChainStub;
  private callingUsersValue?: UserProfile[];
  private txUnixTimeValue?: number;
  private loggerInstance?: GalaLoggerInstance;

  public isDryRun = false;
  public config: GalaChainContextConfig;

  constructor(config: GalaChainContextConfig) {
    super();
    this.config = new GalaChainContextConfigImpl(config);
  }

  get logger(): GalaLoggerInstance {
    if (this.loggerInstance === undefined) {
      this.loggerInstance = new GalaLoggerInstanceImpl(this);
    }
    return this.loggerInstance;
  }

  private get firstUser(): UserProfile {
    if (this.callingUsersValue === undefined || this.callingUsersValue.length === 0) {
      throw new UnauthorizedError("No calling users set.");
    }
    return this.callingUsersValue[0];
  }

  get callingUser(): UserAlias {
    const first = this.firstUser;
    if (first.alias === undefined) {
      throw new UnauthorizedError(
        "No calling user set. It usually means that chaincode tried to get ctx.callingUser for unauthorized call (no DTO signature)."
      );
    }
    return first.alias;
  }

  get callingUserEthAddress(): string {
    const first = this.firstUser;
    if (first.ethAddress === undefined) {
      throw new UnauthorizedError(`No ETH address known for user ${first.alias}`);
    }
    return first.ethAddress;
  }

  get callingUserTonAddress(): string {
    const first = this.firstUser;
    if (first.tonAddress === undefined) {
      throw new UnauthorizedError(`No TON address known for user ${first.alias}`);
    }
    return first.tonAddress;
  }

  get callingUserRoles(): string[] {
    const first = this.firstUser;
    if (first.roles === undefined) {
      throw new UnauthorizedError(`No roles known for user ${first.alias}`);
    }
    return first.roles;
  }

  get callingUserProfile(): UserProfile {
    return this.firstUser;
  }

  get callingUsers(): UserProfile[] {
    if (this.callingUsersValue === undefined) {
      throw new UnauthorizedError("No calling users set.");
    }
    return this.callingUsersValue;
  }

  set callingUsers(users: UserProfile[]) {
    this.callingUsersValue = users;
  }

  hasRole(userAlias: UserAlias, role: string): boolean {
    return (
      this.callingUsersValue?.some((u) => u.alias === userAlias && (u.roles ?? []).includes(role)) ?? false
    );
  }

  set callingUserData(d: { alias?: UserAlias; ethAddress?: string; tonAddress?: string; roles: string[] }) {
    if (this.callingUsersValue !== undefined) {
      return; // do not override existing users
    }

    const profile = new UserProfile();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - alias may be undefined for unsigned calls
    profile.alias = d.alias;
    profile.ethAddress = d.ethAddress;
    profile.tonAddress = d.tonAddress;
    profile.roles = d.roles ?? [UserRole.EVALUATE];

    this.callingUsersValue = [profile];
  }

  resetCallingUser() {
    this.callingUsersValue = undefined;
  }

  public setDryRunOnBehalfOf(d: {
    alias: UserAlias;
    ethAddress?: string;
    tonAddress?: string;
    roles: string[];
  }): void {
    const profile = new UserProfile();
    profile.alias = d.alias;
    profile.ethAddress = d.ethAddress;
    profile.tonAddress = d.tonAddress;
    profile.roles = d.roles ?? [];
    this.callingUsersValue = [profile];
    this.isDryRun = true;
  }

  get txUnixTime(): number {
    if (this.txUnixTimeValue === undefined) {
      this.txUnixTimeValue = getTxUnixTime(this);
    }
    return this.txUnixTimeValue;
  }

  /**
   * @returns a new, empty context that uses the same chaincode stub as
   * the current context, but with dry run set (disables writes and deletes).
   */
  public createReadOnlyContext(index: number | undefined): GalaChainContext {
    const ctx = new GalaChainContext(this.config);
    ctx.clientIdentity = this.clientIdentity;
    ctx.setChaincodeStub(createGalaChainStub(this.stub, true, index));
    return ctx;
  }

  setChaincodeStub(stub: ChaincodeStub) {
    const galaChainStub = createGalaChainStub(stub, this.isDryRun, undefined);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - missing typings for `setChaincodeStub` in `fabric-contract-api`
    super.setChaincodeStub(galaChainStub);
  }
}

