import { isInstance } from "./utils";
import {
  MalUnexpectedTokenType,
  MalMultipleParametersError,
  MalParametersError,
  MalUnexpectedLength,
  MalInvalidRestParameter
} from "./errors";
import {
  MalType,
  MalList,
  MalSymbol,
  MalBoolean,
  MalNil,
  MalNumber,
  MalKeyword,
  MalString,
  MalVector,
  MalFunction,
  MalHashMap,
  MalNativeFunction,
  MalAtom,
  Symbols,
  MalError
} from "./types";

export function checkMalBindings(symbol: MalSymbol, bindings: MalType): void {
  checkMalTypeIsMalSequential(bindings);
  for (let index = (bindings as MalVector).length - 1; index >= 0; index--) {
    const binding = (bindings as MalVector).get(index);
    checkMalTypeIsMalSymbol(binding);
    if (
      isRestMalSymbol(binding) &&
      index !== (bindings as MalVector).length - 2
    ) {
      throw new MalInvalidRestParameter(bindings);
    }
  }
}

export function checkMalInnerParameters(
  symbol: MalSymbol,
  parameters: Array<MalType>,
  excepted: number
): void {
  const calledNum = parameters.length;
  if (calledNum !== excepted)
    throw new MalParametersError(symbol, calledNum, excepted);
}

export function checkMalInnerMultipleParameters(
  symbol: MalSymbol,
  parameters: Array<MalType>,
  atLeastExcepted: number
): void {
  const calledNum = parameters.length;
  if (calledNum < atLeastExcepted)
    throw new MalMultipleParametersError(symbol, calledNum, atLeastExcepted);
}

export function checkMalSequentialBaseLength(
  instance: MalVector,
  base: number
): void {
  if (instance.length % base !== 0)
    throw new MalUnexpectedLength(instance, base);
}

export function checkMalTypeIsMalNumber(instance: MalType): void {
  checkMalType(instance, [MalNumber]);
}

export function checkMalTypeIsMalSymbol(instance: MalType): void {
  checkMalType(instance, [MalSymbol]);
}

export function checkMalTypeIsMalSequential(instance: MalType): void {
  checkMalType(instance, [MalVector]);
}

export function checkMalTypeIsMalVector(instance: MalType): void {
  checkMalType(instance, [MalVector], [MalList]);
}

export function checkMalTypeIsMalList(instance: MalType): void {
  checkMalType(instance, [MalList]);
}

export function checkMalTypeIsFunction(instance: MalType): void {
  checkMalType(instance, [MalFunction, MalNativeFunction]);
}

export function checkMalTypeIsMalNativeFunction(instance: MalType): void {
  checkMalType(instance, [MalNativeFunction]);
}

export function checkMalTypeIsMalFunction(instance: MalType): void {
  checkMalType(instance, [MalFunction]);
}

export function checkMalTypeIsMalFunctionOrMalNativeFunction(
  instance: MalType
): void {
  checkMalType(instance, [MalFunction, MalNativeFunction]);
}

export function checkMalTypeIsMalString(instance: MalType): void {
  checkMalType(instance, [MalString]);
}

export function checkMalTypeIsMalAtom(instance: MalType): void {
  checkMalType(instance, [MalAtom]);
}

export function checkMalTypeIsMalHashMap(instance: MalType): void {
  checkMalType(instance, [MalHashMap]);
}

export function checkMalTypeIsMalType(instance: MalType): void {
  checkMalType(instance, [MalType]);
}

export function checkMalTypeIsMalError(instance: MalType): void {
  checkMalType(instance, [MalError]);
}

export function checkMalType(
  instance: MalType,
  excepted: Array<any> = [],
  unexcepted: Array<any> = []
): void {
  if (
    excepted.every(excepted => !isInstance(instance, excepted)) ||
    unexcepted.some(excepted => isInstance(instance, excepted))
  ) {
    throw new MalUnexpectedTokenType(instance, ...excepted);
  }
}

export function checkCatchAst(instance: MalType): void {
  if (!isMalList(instance)) throw false;
  const [catchSymbol, ...catchParams] = instance;
  if (!isMalSymbolCatch(catchSymbol)) throw false;
  checkMalInnerParameters(MalSymbol.get(Symbols.Catch), catchParams, 2);
  const [errorSymbol, ast] = catchParams;
  checkMalTypeIsMalSymbol(errorSymbol);
}

export function isPositive(instance: MalType) {
  return !(isMalFalse(instance) || isInstance(instance, MalNil));
}

export function isMalNil(instance: MalType) {
  return isInstance(instance, MalNil);
}

export function isMalFalse(instance: MalType) {
  return isInstance(instance, MalBoolean) && instance.value === false;
}

export function isMalTrue(instance: MalType) {
  return isInstance(instance, MalBoolean) && instance.value === true;
}

export function isMalType(instance: any): instance is MalType {
  return isInstance(instance, MalType);
}

export function isMalList(instance: any): instance is MalList {
  return isInstance(instance, MalList);
}

export function isMalVector(instance: any): instance is MalVector {
  return isInstance(instance, MalVector) && !isInstance(instance, MalList);
}

export function isMalSequential(instance: any): instance is MalVector {
  return isInstance(instance, MalVector);
}

export function isMalHashMap(instance: any): instance is MalHashMap {
  return isInstance(instance, MalHashMap);
}

export function isMalSymbol(instance: any): instance is MalSymbol {
  return isInstance(instance, MalSymbol);
}

export function isMalKeyword(instance: any): instance is MalKeyword {
  return isInstance(instance, MalKeyword);
}

export function isMalString(instance: any): instance is MalString {
  return isInstance(instance, MalString);
}

export function isMalFunction(instance: any): instance is MalFunction {
  return isInstance(instance, MalFunction);
}

export function isMalNativeFunction(
  instance: any
): instance is MalNativeFunction {
  return isInstance(instance, MalNativeFunction);
}

export function isMalAtom(instance: any): instance is MalAtom {
  return isInstance(instance, MalAtom);
}

export function isFunction(instance: any): instance is Function {
  return isInstance(instance, Function);
}

export function isRestMalSymbol(instance: any): instance is Function {
  return isMalSymbol(instance) && instance.value === "&";
}

export function isMalSymbolCatch(instance: any): instance is Function {
  return isMalSymbol(instance) && instance.value === Symbols.Catch;
}

export function isMalError(instance: any): instance is Function {
  return isInstance(instance, MalError);
}
