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
  ChainKey,
  ChainObject,
  SubmitCallDTO,
  SigningScheme,
  ValidationFailedError,
  signatures
} from "@gala-chain/api";
import { Exclude, Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from "class-validator";

import { PublicKeyService } from "../services";
import { GalaChainContext } from "../types";
import { getObjectByKey, putChainObject } from "../utils";
import { GalaContract } from "./GalaContract";
import { Evaluate, Submit } from "./GalaTransaction";

export class CreateMultisigDto extends SubmitCallDTO {
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  owners: string[];

  @IsNumber()
  @Min(1)
  threshold: number;
}

export class SubmitTxDto extends SubmitCallDTO {
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  data: string;
}

export class ConfirmTxDto extends SubmitCallDTO {
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @IsNumber()
  nonce: number;
}

export class GetWalletDto extends ChainCallDTO {
  @IsString()
  @IsNotEmpty()
  walletId: string;
}

class PendingTx {
  @IsString()
  to: string;

  @IsString()
  data: string;

  @IsArray()
  @IsString({ each: true })
  confirmations: string[];
}

export class MultisigState extends ChainObject {
  @Exclude()
  public static readonly INDEX_KEY = "MSIG";

  @ChainKey({ position: 0 })
  @IsString()
  walletId: string;

  @IsArray()
  @IsString({ each: true })
  owners: string[];

  @IsNumber()
  threshold: number;

  @IsNumber()
  nonce: number;

  @ValidateNested({ each: true })
  @Type(() => PendingTx)
  pendingTxs: Record<number, PendingTx>;
}

let version = "0.0.0";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  version = require("../../../package.json").version;
} catch (e) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  version = require("../../package.json").version;
}

export class MultisigWalletContract extends GalaContract {
  constructor() {
    super("MultisigWalletContract", version);
  }

  @Submit({ in: CreateMultisigDto, out: "string" })
  public async createMultisig(ctx: GalaChainContext, dto: CreateMultisigDto): Promise<string> {
    const state = new MultisigState();
    state.walletId = dto.walletId;
    state.owners = dto.owners;
    state.threshold = dto.threshold;
    state.nonce = 0;
    state.pendingTxs = {};

    await putChainObject(ctx, state);

    ctx.stub.setEvent(
      "MultisigCreated",
      Buffer.from(JSON.stringify({ walletId: dto.walletId }))
    );

    return dto.walletId;
  }

  @Submit({ in: SubmitTxDto, out: "number" })
  public async submitTx(ctx: GalaChainContext, dto: SubmitTxDto): Promise<number> {
    const key = ChainObject.getCompositeKeyFromParts(MultisigState.INDEX_KEY, [dto.walletId]);
    const wallet = await getObjectByKey(ctx, MultisigState, key);

    const publicKey = signatures.recoverPublicKey(dto.signature as string, dto, dto.prefix ?? "");
    const addr = PublicKeyService.getUserAddress(publicKey, SigningScheme.ETH);
    if (!wallet.owners.includes(addr)) {
      throw new ValidationFailedError(`Submitter ${addr} is not an owner of wallet ${dto.walletId}`);
    }

    const nonce = wallet.nonce;
    wallet.pendingTxs[nonce] = { to: dto.to, data: dto.data, confirmations: [addr] };
    wallet.nonce += 1;

    await putChainObject(ctx, wallet);

    ctx.stub.setEvent("TxSubmitted", Buffer.from(JSON.stringify({ walletId: dto.walletId, nonce })));

    return nonce;
  }

  @Submit({ in: ConfirmTxDto, out: "boolean" })
  public async confirmTx(ctx: GalaChainContext, dto: ConfirmTxDto): Promise<boolean> {
    const key = ChainObject.getCompositeKeyFromParts(MultisigState.INDEX_KEY, [dto.walletId]);
    const wallet = await getObjectByKey(ctx, MultisigState, key);

    const publicKey = signatures.recoverPublicKey(dto.signature as string, dto, dto.prefix ?? "");
    const addr = PublicKeyService.getUserAddress(publicKey, SigningScheme.ETH);
    if (!wallet.owners.includes(addr)) {
      throw new ValidationFailedError(`Confirmer ${addr} is not an owner of wallet ${dto.walletId}`);
    }

    const pending = wallet.pendingTxs[dto.nonce];
    if (!pending) {
      throw new ValidationFailedError(`No pending transaction with nonce ${dto.nonce}`);
    }

    if (pending.confirmations.includes(addr)) {
      throw new ValidationFailedError(`Owner ${addr} already confirmed transaction ${dto.nonce}`);
    }

    pending.confirmations.push(addr);

    let executed = false;
    if (pending.confirmations.length >= wallet.threshold) {
      executed = true;
      delete wallet.pendingTxs[dto.nonce];
      ctx.stub.setEvent(
        "TxExecuted",
        Buffer.from(JSON.stringify({ walletId: dto.walletId, nonce: dto.nonce }))
      );
    }

    await putChainObject(ctx, wallet);

    return executed;
  }

  @Evaluate({ in: GetWalletDto, out: MultisigState })
  public async getWallet(ctx: GalaChainContext, dto: GetWalletDto): Promise<MultisigState> {
    const key = ChainObject.getCompositeKeyFromParts(MultisigState.INDEX_KEY, [dto.walletId]);
    return getObjectByKey(ctx, MultisigState, key);
  }
}

