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
import { ChainCallDTO, NotFoundError, SubmitCallDTO, ValidationFailedError } from "@gala-chain/api";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Info } from "fabric-contract-api";

import { GalaContract } from "../contracts/GalaContract";
import { Evaluate, Submit } from "../contracts/GalaTransaction";
import { GalaChainContext } from "../types";

export interface PendingTx {
  id: string;
  to: string;
  value: string;
  data?: string;
  confirmations: string[];
  executed: boolean;
}

export interface MultisigWallet {
  owners: string[];
  threshold: number;
  pending: Record<string, PendingTx>;
}

function walletKey(id: string): string {
  return `multisig:${id}`;
}

async function getWallet(ctx: GalaChainContext, id: string): Promise<MultisigWallet> {
  const data = await ctx.stub.getCachedState(walletKey(id));

  if (!data || data.length === 0) {
    throw new NotFoundError(`Multisig wallet ${id} not found`);
  }

  return JSON.parse(Buffer.from(data).toString()) as MultisigWallet;
}

async function putWallet(ctx: GalaChainContext, id: string, wallet: MultisigWallet): Promise<void> {
  await ctx.stub.putState(walletKey(id), Buffer.from(JSON.stringify(wallet)));
}

export class CreateWalletDto extends SubmitCallDTO {
  @IsString()
  @IsNotEmpty()
  public walletId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public owners!: string[];

  @IsInt()
  public threshold!: number;
}

export class SubmitTxDto extends SubmitCallDTO {
  @IsString()
  public walletId!: string;

  @IsString()
  public to!: string;

  @IsString()
  public value!: string;

  @IsOptional()
  @IsString()
  public data?: string;
}

export class ConfirmTxDto extends SubmitCallDTO {
  @IsString()
  public walletId!: string;

  @IsString()
  public txId!: string;
}

export class QueryWalletDto extends ChainCallDTO {
  @IsString()
  public walletId!: string;
}

let version = "0.0.0";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  version = require("../../../package.json").version;
} catch (e) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  version = require("../../package.json").version;
}

@Info({
  title: "MultisigWalletContract",
  description: "Simple m-of-n multisig wallet"
})
export class MultisigWalletContract extends GalaContract {
  constructor() {
    super("MultisigWalletContract", version);
  }

  @Submit({ in: CreateWalletDto })
  public async CreateWallet(ctx: GalaChainContext, dto: CreateWalletDto): Promise<void> {
    if (dto.threshold <= 0) {
      throw new ValidationFailedError("Threshold must be greater than zero");
    }

    if (dto.owners.length < dto.threshold) {
      throw new ValidationFailedError("Owners length cannot be less than threshold");
    }

    const exists = await ctx.stub.getCachedState(walletKey(dto.walletId));
    if (exists && exists.length > 0) {
      throw new ValidationFailedError(`Multisig wallet ${dto.walletId} already exists`);
    }

    const wallet: MultisigWallet = { owners: dto.owners, threshold: dto.threshold, pending: {} };
    await putWallet(ctx, dto.walletId, wallet);

    ctx.stub.setEvent(
      "MultisigCreated",
      Buffer.from(JSON.stringify({ walletId: dto.walletId, owners: dto.owners, threshold: dto.threshold }))
    );
  }

  @Submit({ in: SubmitTxDto, out: "string" })
  public async SubmitTransaction(ctx: GalaChainContext, dto: SubmitTxDto): Promise<string> {
    const wallet = await getWallet(ctx, dto.walletId);
    const sender = ctx.callingUser;

    if (!wallet.owners.includes(sender)) {
      throw new ValidationFailedError("Caller is not a wallet owner");
    }

    const txId = ctx.stub.getTxID();
    const pending: PendingTx = {
      id: txId,
      to: dto.to,
      value: dto.value,
      data: dto.data,
      confirmations: [sender],
      executed: false
    };

    wallet.pending[txId] = pending;

    ctx.stub.setEvent(
      "TxSubmitted",
      Buffer.from(JSON.stringify({ walletId: dto.walletId, txId, to: dto.to, value: dto.value }))
    );

    if (pending.confirmations.length >= wallet.threshold) {
      pending.executed = true;
      delete wallet.pending[txId];
      ctx.stub.setEvent("TxExecuted", Buffer.from(JSON.stringify({ walletId: dto.walletId, txId })));
    }

    await putWallet(ctx, dto.walletId, wallet);
    return txId;
  }

  @Submit({ in: ConfirmTxDto })
  public async ConfirmTransaction(ctx: GalaChainContext, dto: ConfirmTxDto): Promise<void> {
    const wallet = await getWallet(ctx, dto.walletId);
    const tx = wallet.pending[dto.txId];

    if (!tx) {
      throw new NotFoundError(`Transaction ${dto.txId} not found`);
    }

    const sender = ctx.callingUser;

    if (!wallet.owners.includes(sender)) {
      throw new ValidationFailedError("Caller is not a wallet owner");
    }

    if (tx.confirmations.includes(sender)) {
      throw new ValidationFailedError("Caller already confirmed this transaction");
    }

    tx.confirmations.push(sender);

    if (tx.confirmations.length >= wallet.threshold) {
      tx.executed = true;
      delete wallet.pending[dto.txId];
      ctx.stub.setEvent(
        "TxExecuted",
        Buffer.from(JSON.stringify({ walletId: dto.walletId, txId: dto.txId }))
      );
    }

    await putWallet(ctx, dto.walletId, wallet);
  }

  @Evaluate({ in: QueryWalletDto, out: "object" })
  public async GetWallet(ctx: GalaChainContext, dto: QueryWalletDto): Promise<MultisigWallet> {
    return getWallet(ctx, dto.walletId);
  }
}
