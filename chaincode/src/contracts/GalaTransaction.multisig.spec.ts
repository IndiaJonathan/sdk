import {
  ChainCallDTO,
  ForbiddenError,
  GalaChainResponse,
  UserAlias,
  UserProfile,
  UserRole
} from "@gala-chain/api";

import { GalaContract } from "./GalaContract";
import { EVALUATE, GalaTransaction } from "./GalaTransaction";
import { MissingRoleError } from "./authorize";
import { GalaChainContext } from "../types";

class MultiSigTestContract extends GalaContract {
  constructor() {
    super("MultiSigTestContract", "1.0");
  }

  @GalaTransaction({ type: EVALUATE, requiredSignatures: 2 })
  async NeedsTwo(ctx: GalaChainContext, _dto: ChainCallDTO): Promise<void> {
    return;
  }

  @GalaTransaction({
    type: EVALUATE,
    requiredSignatures: 2,
    requiredRolesPerSigner: [UserRole.CURATOR]
  })
  async NeedsCurators(ctx: GalaChainContext, _dto: ChainCallDTO): Promise<void> {
    return;
  }
}

describe("GalaTransaction multisig validation", () => {
  it("enforces required signatures", async () => {
    const contract = new MultiSigTestContract();
    const ctx = new GalaChainContext({});
    ctx.isDryRun = true;

    const user = new UserProfile();
    user.alias = "client|u1" as UserAlias;
    user.roles = [UserRole.EVALUATE];
    ctx.callingUsers = [user];

    const response = await contract.NeedsTwo(ctx, new ChainCallDTO());

    expect(response).toEqual(
      GalaChainResponse.Error(
        new ForbiddenError("Requires at least 2 signatures but got 1.", { required: 2, received: 1 })
      )
    );
  });

  it("validates roles for each signer", async () => {
    const contract = new MultiSigTestContract();
    const ctx = new GalaChainContext({});
    ctx.isDryRun = true;

    const user1 = new UserProfile();
    user1.alias = "client|u1" as UserAlias;
    user1.roles = [UserRole.CURATOR, UserRole.EVALUATE];

    const user2 = new UserProfile();
    user2.alias = "client|u2" as UserAlias;
    user2.roles = [UserRole.EVALUATE];

    ctx.callingUsers = [user1, user2];

    const response = await contract.NeedsCurators(ctx, new ChainCallDTO());

    expect(response).toEqual(
      GalaChainResponse.Error(new MissingRoleError(user2.alias, user2.roles, [UserRole.CURATOR]))
    );
  });
});

