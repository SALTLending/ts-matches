import { object, Parser } from ".";
import { saferStringify } from "../utils";
import { IParser, OnParse, ISimpleParsedError, _ } from "./interfaces";
import { identity } from "./utils";

export type DictionaryTuple<A> = A extends [
  Parser<unknown, infer Keys>,
  Parser<unknown, infer Values>
]
  ? Keys extends string | number
    ? { [key in Keys]: Values }
    : never
  : never;
// prettier-ignore
export type DictionaryShaped<T> =
    T extends [infer A] | readonly [infer A] ? DictionaryTuple<A>
    : T extends [infer A, ...infer B] | readonly [infer A, ...infer B] ? DictionaryTuple<A> & DictionaryShaped<B>
    : never
export class DictionaryParser<
  A extends object | {},
  Parsers extends Array<[Parser<unknown, unknown>, Parser<unknown, unknown>]>
> implements IParser<A, DictionaryShaped<Parsers>> {
  constructor(
    readonly parsers: Parsers,
    readonly name: string = `{${parsers
      .map(
        ([keyType, value]) => `${saferStringify(keyType.name)}: ${value.name}`
      )
      .join(",")}}`
  ) {}
  parse<C, D>(
    a: A,
    onParse: OnParse<A, DictionaryShaped<Parsers>, C, D>
  ): C | D {
    const { parsers } = this;
    const parser = this;
    const answer: any = { ...a };
    for (const key in a) {
      let parseError: false | ISimpleParsedError = false;
      for (const [keyParser, valueParser] of parsers) {
        parseError = keyParser.parse(key, {
          parsed(newKey: string | number) {
            return valueParser.parse((a as any)[key], {
              parsed(newValue) {
                delete answer[key];
                answer[newKey] = newValue;
                return false as const;
              },
              invalid: identity,
            });
          },
          invalid: identity,
        });
        if (!parseError) break;
      }
      if (!!parseError) {
        parseError.parser = parser;
        const keys = parseError.keys || [];
        keys.push(key);
        parseError.keys = keys;
        return onParse.invalid(parseError);
      }
    }

    return onParse.parsed(answer);
  }
}
export const dictionary = <
  FirstParserSet extends [Parser<unknown, unknown>, Parser<unknown, unknown>],
  RestParserSets extends [Parser<unknown, unknown>, Parser<unknown, unknown>][]
>(
  firstParserSet: FirstParserSet,
  ...restParserSets: RestParserSets
): Parser<
  unknown,
  _<DictionaryShaped<[FirstParserSet, ...RestParserSets]>>
> => {
  return object.concat(
    new DictionaryParser([firstParserSet, ...restParserSets])
  ) as any;
};