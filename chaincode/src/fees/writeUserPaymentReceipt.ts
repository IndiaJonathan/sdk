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
import { FeeReceiptStatus, FeeUserPaymentReceipt } from "@gala-chain/api";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";

import { GalaChainContext } from "../types";
import { putChainObject } from "../utils";

export interface WriteUserPaymentReceiptParams {
  paidByUser: string;
  year: string;
  month: string;
  day: string;
  feeCode: string;
  txId: string;
  quantity: BigNumber;
  status: FeeReceiptStatus;
}

export async function writeUserPaymentReceipt(
  ctx: GalaChainContext,
  data: WriteUserPaymentReceiptParams
): Promise<void> {
  const userPaymentReceipt: FeeUserPaymentReceipt = plainToInstance(FeeUserPaymentReceipt, data);

  await putChainObject(ctx, userPaymentReceipt);
}
