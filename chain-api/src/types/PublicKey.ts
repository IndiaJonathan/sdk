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
import { ArrayNotEmpty, IsInt, IsOptional, IsString, Min } from "class-validator";

import { SigningScheme, signatures } from "../utils";
import { StringEnumProperty } from "../validators";
import { ChainObject } from "./ChainObject";

export class PublicKey extends ChainObject {
  @IsString({ each: true })
  @ArrayNotEmpty()
  public publicKeys: string[];

  @IsInt()
  @Min(1)
  public requiredSignatures: number;

  @IsOptional()
  @StringEnumProperty(SigningScheme)
  public signing?: SigningScheme;

  // backwards compatibility helper for single-key usage
  get publicKey(): string {
    return this.publicKeys?.[0];
  }

  set publicKey(value: string) {
    this.publicKeys = [value];
    this.requiredSignatures = 1;
  }
}

export const PK_INDEX_KEY = "GCPK";

export function normalizePublicKeys(input: string[]): string[] {
  const normalized = input.map((pk) => signatures.normalizePublicKey(pk).toString("base64"));
  return normalized.sort();
}
