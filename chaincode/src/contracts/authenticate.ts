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
import { ChainCallDTO, ForbiddenError, UserProfile, ValidationFailedError } from "@gala-chain/api";
import * as protos from "fabric-protos";

import { PublicKeyService } from "../services";
import { GalaChainContext } from "../types";

class MissingSignatureError extends ValidationFailedError {
  constructor() {
    super("Signature is missing.");
  }
}

export class ChaincodeAuthorizationError extends ForbiddenError {}

/**
 *
 * @param ctx
 * @param dto
 * @returns User alias of the calling user.
 */
export async function authenticate(
  ctx: GalaChainContext,
  dto: ChainCallDTO | undefined,
  minSignatures = 1
): Promise<{
  alias: string;
  ethAddress?: string;
  tonAddress?: string;
  roles: string[];
  users: UserProfile[];
  minSignatures: number;
}> {
  if (!dto || !dto.signatures || dto.signatures.length === 0) {
    if (dto?.signerAddress?.startsWith("service|")) {
      const chaincode = dto.signerAddress.slice(8);
      return { ...(await authenticateAsOriginChaincode(ctx, dto, chaincode)), users: [], minSignatures };
    }

    throw new MissingSignatureError();
  }

  const usersWithRoles = await PublicKeyService.ensureSignaturesValid(ctx, dto);

  const uniqueUsers = Array.from(new Map(usersWithRoles.map((u) => [u.alias, u])).values());

  const callingUsers: UserProfile[] = uniqueUsers.map((u) => {
    const p = new UserProfile();
    p.alias = u.alias;
    p.ethAddress = u.ethAddress;
    p.tonAddress = u.tonAddress;
    p.roles = u.roles;
    return p;
  });

  ctx.callingUsers = callingUsers;

  const first = callingUsers[0];
  return {
    alias: first.alias,
    ethAddress: first.ethAddress,
    tonAddress: first.tonAddress,
    roles: first.roles ?? [],
    users: callingUsers,
    minSignatures
  };
}

export async function ensureIsAuthenticatedBy(
  ctx: GalaChainContext,
  dto: ChainCallDTO,
  expectedAlias: string
): Promise<{ alias: string; ethAddress?: string }> {
  const user = await authenticate(ctx, dto);

  if (user.alias !== expectedAlias) {
    throw new ForbiddenError(`Dto is authenticated by ${user.alias}, not by ${expectedAlias}.`, {
      authorized: user
    });
  }

  return user;
}

/**
 * Authenticate as chaincode on the basis of the chaincodeId from the signed
 * proposal. This is a reliable way to authenticate as chaincode, because the
 * signed proposal is passed by a peer to the chaincode and can't be faked.
 */
export async function authenticateAsOriginChaincode(
  ctx: GalaChainContext,
  dto: ChainCallDTO,
  chaincode: string
): Promise<{ alias: string; ethAddress?: string; roles: string[] }> {
  const signedProposal = ctx.stub.getSignedProposal();
  if (signedProposal === undefined) {
    const message = "Chaincode authorization failed: got empty signed proposal.";
    throw new ChaincodeAuthorizationError(message);
  }

  // @ts-expect-error error in fabric types mapping
  const proposalPayload = signedProposal.proposal.payload?.array?.[0];

  if (proposalPayload === undefined) {
    const message = "Chaincode authorization failed: got empty proposal payload in signed proposal.";
    throw new ChaincodeAuthorizationError(message);
  }

  const decodedProposal = protos.protos.ChaincodeProposalPayload.decode(proposalPayload);
  const invocationSpec = protos.protos.ChaincodeInvocationSpec.decode(decodedProposal.input);
  const chaincodeId = invocationSpec.chaincode_spec?.chaincode_id?.name;

  if (chaincodeId === undefined) {
    const message = "Chaincode authorization failed: got empty chaincodeId in signed proposal.";
    throw new ChaincodeAuthorizationError(message);
  }

  if (chaincodeId !== chaincode) {
    const message = `Chaincode authorization failed. Got DTO with signerAddress: ${dto.signerAddress}, but signed proposal has chaincodeId: ${chaincodeId}.`;
    throw new ChaincodeAuthorizationError(message);
  }

  return { alias: `service|${chaincode}`, ethAddress: undefined, roles: [] };
}
