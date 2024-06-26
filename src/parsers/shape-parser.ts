// deno-lint-ignore-file no-explicit-any ban-types
import { every, object, Parser } from "./index";
import { saferStringify } from "../utils";
import { IParser, OnParse } from "./interfaces";
type _<T> = T;
// prettier-ignore
// deno-fmt-ignore
export type MergeAll<T> =
  T extends ReadonlyArray<infer U> ? ReadonlyArray<MergeAll<U>> :
  T extends object ?
  T extends null | undefined | never ? T :
  _<{ [k in keyof T]: MergeAll<T[k]> }>
  : T;
/**
 * Given an object, we want to make sure the key exists and that the value on
 * the key matches the parser
 */
export class ShapeParser<
  A extends unknown,
  Key extends string | number | symbol,
  B
> implements IParser<A, B>
{
  constructor(
    readonly parserMap: { [key in keyof B]: Parser<unknown, B[key]> },
    readonly isPartial: boolean,
    readonly parserKeys = Object.keys(parserMap) as Array<
      string & keyof typeof parserMap
    >,
    readonly description = {
      name: isPartial ? "Partial" : "Shape",
      children: parserKeys.map((key) => parserMap[key]),
      extras: parserKeys,
    } as const
  ) {}
  parse<C, D>(a: A, onParse: OnParse<A, B, C, D>): C | D {
    // deno-lint-ignore no-this-alias
    const parser: IParser<unknown, unknown> = this;
    if (!object.test(a)) {
      return onParse.invalid({
        value: a,
        keys: [],
        parser,
      });
    }
    const { parserMap, isPartial } = this;
    const value: any = { ...(a as object) };
    if (Array.isArray(a)) {
      value.length = a.length;
    }
    for (const key in parserMap) {
      if (key in value) {
        const parser = parserMap[key];
        const state = parser.enumParsed((a as any)[key]);
        if ("error" in state) {
          const { error } = state;
          error.keys.push(saferStringify(key));
          return onParse.invalid(error);
        }
        const smallValue = state.value;
        value[key] = smallValue;
      } else if (!isPartial) {
        return onParse.invalid({
          value: "missingProperty",
          parser,
          keys: [saferStringify(key)],
        });
      }
    }

    return onParse.parsed(value);
  }
}
export const isPartial = <A extends {}>(testShape: {
  [key in keyof A]: Parser<unknown, A[key]>;
}): Parser<unknown, Partial<A>> => {
  return new Parser(new ShapeParser(testShape, true)) as any;
};

/**
 * Good for duck typing an object, with optional values
 * @param testShape Shape of validators, to ensure we match the shape
 */
export const partial = isPartial;
/**
 * Good for duck typing an object
 * @param testShape Shape of validators, to ensure we match the shape
 */

export const isShape = <A extends {}>(testShape: {
  [key in keyof A]: Parser<unknown, A[key]>;
}): Parser<unknown, A> => {
  return new Parser(new ShapeParser(testShape, false)) as any;
};

export function shape<A extends {}, Overwrites extends keyof A>(
  testShape: {
    [key in keyof A]: Parser<unknown, A[key]>;
  },
  optionals: Overwrites[]
): Parser<
  unknown,
  MergeAll<
    { [K in keyof Omit<A, Overwrites>]: A[K] } & {
      [K in keyof Pick<A, Overwrites>]?: A[K];
    }
  >
>;
export function shape<
  A extends {},
  Overwrites extends keyof A,
  Defaults extends { [K in Overwrites]?: A[K] }
>(
  testShape: {
    [key in keyof A]: Parser<unknown, A[key]>;
  },
  optionals: Overwrites[],
  defaults: Defaults
): Parser<
  unknown,
  MergeAll<
    { [K in keyof Omit<A, Overwrites>]: A[K] } & {
      [K in keyof Omit<Pick<A, Overwrites>, keyof Defaults>]?: A[K];
    } & {
      [K in keyof Pick<Pick<A, Overwrites>, keyof Defaults & Overwrites>]: A[K];
    }
  >
>;
export function shape<A extends {}>(testShape: {
  [key in keyof A]: Parser<unknown, A[key]>;
}): Parser<unknown, A>;
export function shape<
  A extends {},
  Overwrites extends keyof A,
  OptionalDefaults extends { [K in Overwrites]: A[K] }
>(
  testShape: {
    [key in keyof A]: Parser<unknown, A[key]>;
  },
  optionals?: Overwrites[],
  optionalAndDefaults?: OptionalDefaults
) {
  if (optionals) {
    const defaults = optionalAndDefaults || {};
    const entries = Object.entries(testShape) as Array<
      [keyof A, Parser<unknown, A[keyof A]>]
    >;
    const optionalSet = new Set(Array.from(optionals as Array<Overwrites>));
    return every(
      partial(
        Object.fromEntries(
          entries
            .filter(([key, _]) => optionalSet.has(key as any))
            .map(([key, parser]) => [key, parser.optional()])
        )
      ),
      isShape(
        Object.fromEntries(
          entries.filter(([key, _]) => !optionalSet.has(key as any))
        )
      )
    ).map((ret) => {
      for (const key of optionalSet) {
        const keyAny = key as any;
        if (!(keyAny in ret) && keyAny in defaults) {
          ret[keyAny] = (defaults as any)[keyAny];
        }
      }
      return ret;
    });
  }
  return isShape(testShape);
}
