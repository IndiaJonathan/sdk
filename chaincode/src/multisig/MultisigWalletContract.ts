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

import { ChainCallDTO, SubmitCallDTO } from "@gala-chain/api";
import { Info } from "fabric-contract-api";

import { GalaContract } from "../contracts/GalaContract";
import { Evaluate, Submit } from "../contracts/GalaTransaction";
import { GalaChainContext } from "../types";

export interface PendingTx {
  id: string;
  to: string;
  amount: string;
  confirmations: string[];
}

interface MultisigWallet {
  owners: string[];
  threshold: number;
  pending: Record<string, PendingTx>;
}

class CreateWalletDto extends SubmitCallDTO {
  walletId!: string;
  owners!: string[];
  threshold!: number;
}

class SubmitTxDto extends SubmitCallDTO {
  walletId!: string;
  txId!: string;
  to!: string;
  amount!: string;
}

class ConfirmTxDto extends SubmitCallDTO {
  walletId!: string;
  txId!: string;
}

class QueryWalletDto extends ChainCallDTO {
  walletId!: string;
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

  private walletKey(walletId: string): string {
    return `multisig:${walletId}`;
  }

  private async getWallet(ctx: GalaChainContext, walletId: string): Promise<MultisigWallet | undefined> {
    const data = await ctx.stub.getCachedState(this.walletKey(walletId));
    if (!data || data.length === 0) {
      return undefined;
    }
    return JSON.parse(data.toString()) as MultisigWallet;
  }

  @Submit({ in: CreateWalletDto })
  public async Create(ctx: GalaChainContext, dto: CreateWalletDto): Promise<void> {
    const key = this.walletKey(dto.walletId);
    const exists = await ctx.stub.getCachedState(key);
    if (exists && exists.length > 0) {
      throw new Error(`Wallet ${dto.walletId} already exists`);
    }
    if (dto.threshold > dto.owners.length) {
      throw new Error("Threshold cannot exceed number of owners");
    }

    const wallet: MultisigWallet = {
      owners: dto.owners,
      threshold: dto.threshold,
      pending: {}
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(wallet)));
    ctx.stub.setEvent("MultisigCreated", Buffer.from(JSON.stringify({ walletId: dto.walletId })));
  }

  @Submit({ in: SubmitTxDto })
  public async Submit(ctx: GalaChainContext, dto: SubmitTxDto): Promise<void> {
    const wallet = await this.getWallet(ctx, dto.walletId);
    if (!wallet) {
      throw new Error(`Wallet ${dto.walletId} not found`);
    }
    if (!wallet.owners.includes(ctx.callingUser)) {
      throw new Error("Only wallet owners may submit transactions");
    }
    if (wallet.pending[dto.txId]) {
      throw new Error(`Transaction ${dto.txId} already exists`);
    }

    wallet.pending[dto.txId] = {
      id: dto.txId,
      to: dto.to,
      amount: dto.amount,
      confirmations: [ctx.callingUser]
    };

    await ctx.stub.putState(this.walletKey(dto.walletId), Buffer.from(JSON.stringify(wallet)));
    ctx.stub.setEvent(
      "TxSubmitted",
      Buffer.from(JSON.stringify({ walletId: dto.walletId, txId: dto.txId }))
    );
  }

  @Submit({ in: ConfirmTxDto })
  public async Confirm(ctx: GalaChainContext, dto: ConfirmTxDto): Promise<void> {
    const wallet = await this.getWallet(ctx, dto.walletId);
    if (!wallet) {
      throw new Error(`Wallet ${dto.walletId} not found`);
    }
    if (!wallet.owners.includes(ctx.callingUser)) {
      throw new Error("Only wallet owners may confirm transactions");
    }
    const tx = wallet.pending[dto.txId];
    if (!tx) {
      throw new Error(`Transaction ${dto.txId} not found`);
    }
    if (!tx.confirmations.includes(ctx.callingUser)) {
      tx.confirmations.push(ctx.callingUser);
    }

    let executed = false;
    if (tx.confirmations.length >= wallet.threshold) {
      executed = true;
      delete wallet.pending[dto.txId];
    }

    await ctx.stub.putState(this.walletKey(dto.walletId), Buffer.from(JSON.stringify(wallet)));

    if (executed) {
      ctx.stub.setEvent(
        "TxExecuted",
        Buffer.from(JSON.stringify({ walletId: dto.walletId, txId: dto.txId }))
      );
    }
  }

  @Evaluate({ in: QueryWalletDto })
  public async Query(ctx: GalaChainContext, dto: QueryWalletDto): Promise<MultisigWallet | undefined> {
    return this.getWallet(ctx, dto.walletId);
  }
}

export default MultisigWalletContract;
