import { randomUniqueKey } from "@gala-chain/api";
import { fixture, transactionSuccess, writesMap } from "@gala-chain/test";
import { GalaChainContext } from "../types";

import { signatures } from "@gala-chain/api";
import {
  ConfirmTxDto,
  CreateMultisigDto,
  GetWalletDto,
  MultisigState,
  MultisigWalletContract,
  SubmitTxDto
} from "./MultisigWalletContract";

describe("MultisigWalletContract", () => {
  function createUser() {
    const { privateKey, publicKey } = signatures.genKeyPair();
    const ethAddress = signatures.getEthAddress(publicKey);
    return { privateKey, publicKey, ethAddress };
  }
  it("creates multisig wallet", async () => {
    const { ctx, contract, getWrites } = fixture<GalaChainContext, MultisigWalletContract>(
      MultisigWalletContract
    );
    const owner1 = await createUser();
    const owner2 = await createUser();
    const spy = jest.spyOn(ctx.stub, "setEvent");

    const dto = new CreateMultisigDto();
    dto.walletId = "wallet1";
    dto.owners = [owner1.ethAddress, owner2.ethAddress];
    dto.threshold = 2;
    dto.uniqueKey = randomUniqueKey();
    dto.sign(owner1.privateKey);

    const res = await contract.createMultisig(ctx, dto);
    expect(res).toEqual(transactionSuccess("wallet1"));

    const expected = new MultisigState();
    expected.walletId = "wallet1";
    expected.owners = [owner1.ethAddress, owner2.ethAddress];
    expected.threshold = 2;
    expected.nonce = 0;
    expected.pendingTxs = {};

    expect(getWrites()).toEqual(writesMap(expected));
    expect(spy).toHaveBeenCalledWith("MultisigCreated", expect.any(Buffer));
  });

  it("submits transaction and records proposal", async () => {
    const { ctx, contract, getWrites } = fixture<GalaChainContext, MultisigWalletContract>(
      MultisigWalletContract
    );
    const owner1 = await createUser();
    const owner2 = await createUser();
    const create = new CreateMultisigDto();
    create.walletId = "wallet2";
    create.owners = [owner1.ethAddress, owner2.ethAddress];
    create.threshold = 2;
    create.uniqueKey = randomUniqueKey();
    create.sign(owner1.privateKey);
    await contract.createMultisig(ctx, create);

    const spy = jest.spyOn(ctx.stub, "setEvent");
    spy.mockClear();

    const submit = new SubmitTxDto();
    submit.walletId = "wallet2";
    submit.to = "recipient";
    submit.data = "payload";
    submit.uniqueKey = randomUniqueKey();
    submit.sign(owner1.privateKey);

    const res = await contract.submitTx(ctx, submit);
    expect(res).toEqual(transactionSuccess(0));

    const expected = new MultisigState();
    expected.walletId = "wallet2";
    expected.owners = [owner1.ethAddress, owner2.ethAddress];
    expected.threshold = 2;
    expected.nonce = 1;
    expected.pendingTxs = { 0: { to: "recipient", data: "payload", confirmations: [owner1.ethAddress] } };

    expect(getWrites()).toEqual(writesMap(expected));
    expect(spy).toHaveBeenCalledWith("TxSubmitted", expect.any(Buffer));
  });

  it("confirms and executes transaction", async () => {
    const { ctx, contract, getWrites } = fixture<GalaChainContext, MultisigWalletContract>(
      MultisigWalletContract
    );
    const owner1 = await createUser();
    const owner2 = await createUser();

    const create = new CreateMultisigDto();
    create.walletId = "wallet3";
    create.owners = [owner1.ethAddress, owner2.ethAddress];
    create.threshold = 2;
    create.uniqueKey = randomUniqueKey();
    create.sign(owner1.privateKey);
    await contract.createMultisig(ctx, create);

    const submit = new SubmitTxDto();
    submit.walletId = "wallet3";
    submit.to = "recipient";
    submit.data = "payload";
    submit.uniqueKey = randomUniqueKey();
    submit.sign(owner1.privateKey);
    await contract.submitTx(ctx, submit);

    const spy = jest.spyOn(ctx.stub, "setEvent");
    spy.mockClear();

    const confirm = new ConfirmTxDto();
    confirm.walletId = "wallet3";
    confirm.nonce = 0;
    confirm.uniqueKey = randomUniqueKey();
    confirm.sign(owner2.privateKey);

    const res = await contract.confirmTx(ctx, confirm);
    expect(res).toEqual(transactionSuccess(true));

    const expected = new MultisigState();
    expected.walletId = "wallet3";
    expected.owners = [owner1.ethAddress, owner2.ethAddress];
    expected.threshold = 2;
    expected.nonce = 1;
    expected.pendingTxs = {};

    expect(getWrites()).toEqual(writesMap(expected));
    expect(spy).toHaveBeenCalledWith("TxExecuted", expect.any(Buffer));

    const queryDto = new GetWalletDto();
    queryDto.walletId = "wallet3";
    queryDto.sign(owner1.privateKey);
    const query = await contract.getWallet(ctx, queryDto);
    expect(query).toEqual(transactionSuccess(expected));
  });
});

