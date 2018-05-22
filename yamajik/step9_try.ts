import repl from "repl";

import core from "./core";
import config from "./config";
import { MalEnv } from "./env";
import { readString } from "./reader";
import { printString, debugPrint, printError } from "./printer";
import {
  MalUnexceptedSyntax,
  MalParametersError,
  MalMultipleParametersError
} from "./errors";
import {
  MalType,
  MalList,
  MalNumber,
  MalSymbol,
  MalFunction,
  MalBoolean,
  MalNil,
  Symbols,
  MalVector,
  MalHashMap,
  MalString
} from "./types";
import {
  checkMalTypeIsMalSymbol,
  checkMalTypeIsMalList,
  checkMalInnerMultipleParameters,
  checkMalTypeIsMalType,
  checkMalInnerParameters,
  checkMalSequentialBaseLength,
  isMalHashMap,
  isMalVector,
  isPositive,
  isMalList,
  isMalSymbol,
  isMalFunction,
  isMalNativeFunction,
  checkMalTypeIsMalSequential,
  checkMalTypeIsMalFunction,
  checkMalBindings,
  checkCatchAst,
  isMalSequential,
  isMalError,
  checkMalTypeIsMalError
} from "./checker";

const GlobalEnv: MalEnv = new MalEnv();
core.forEach((value: MalType, symbol: MalSymbol) =>
  GlobalEnv.set(symbol, value)
);

rep("(def! not (fn* [a] (if a false true)))");
rep(
  '(def! load-file (fn* (path) (eval (read-str (str "(do " (slurp path) ")")))))'
);
rep(
  "(defmacro! cond (fn* (& xs) (if (> (count xs) 0) (list 'if (first xs) (if (> (count xs) 1) (nth xs 1) (throw \"odd number of forms to cond\")) (cons 'cond (rest (rest xs)))))))"
);
rep(
  "(defmacro! or (fn* (& xs) (if (empty? xs) nil (if (= 1 (count xs)) (first xs) `(let* (or_FIXME ~(first xs)) (if or_FIXME or_FIXME (or ~@(rest xs))))))))"
);

function READ(str: string): MalType {
  return readString(str);
}

function EVAL_AST(ast: MalType, env: MalEnv): MalType {
  if (isMalSymbol(ast)) {
    return env.get(ast);
  } else if (isMalList(ast)) {
    return new MalList(ast.map((item: MalType) => EVAL(item, env)));
  } else if (isMalVector(ast)) {
    return new MalVector(ast.map((item: MalType) => EVAL(item, env)));
  } else if (isMalHashMap(ast)) {
    const mapList: Array<[MalType, MalType]> = [];
    for (const [key, value] of ast) {
      mapList.push([key, EVAL(value, env)]);
    }
    return new MalHashMap(mapList);
  } else {
    return ast;
  }
}

function EVAL(ast: MalType, env: MalEnv): MalType {
  try {
    return EVAL_NOT_CATCH(ast, env);
  } catch (error) {
    if (isMalError(error)) {
      error.pushAst(ast);
      throw error;
    } else {
      throw error;
    }
  }
}

function EVAL_NOT_CATCH(ast: MalType, env: MalEnv): MalType {
  loop: while (true) {
    debugPrint(ast);

    if (!isMalList(ast)) {
      return EVAL_AST(ast, env);
    }

    ast = MACROEXPAND(env, [ast]);
    if (!isMalSequential(ast)) {
      return EVAL_AST(ast, env);
    }

    if (ast.length <= 0) {
      return MalNil.get();
    }

    if (isMalSymbol(ast.first())) {
      const [symbol, ...args] = ast;
      switch (symbol) {
        case MalSymbol.get(Symbols.Def):
          return DEF(env, args);
        case MalSymbol.get(Symbols.Let):
          [ast, env] = LET(env, args);
          continue loop;
        case MalSymbol.get(Symbols.Do):
          ast = DO(env, args);
          continue loop;
        case MalSymbol.get(Symbols.If):
          ast = IF(env, args);
          continue loop;
        case MalSymbol.get(Symbols.Fn):
          return FN(env, args);
        case MalSymbol.get(Symbols.Eval):
          ast = EVALFUNC(env, args);
          continue loop;
        case MalSymbol.get(Symbols.Quote):
          return QUOTE(env, args);
        case MalSymbol.get(Symbols.Quasiquote):
          ast = QUASIQUOTE(env, args);
          continue loop;
        case MalSymbol.get(Symbols.Defmacro):
          return DEFMACRO(env, args);
        case MalSymbol.get(Symbols.Macroexpand):
          ast = MACROEXPAND(env, args);
          continue loop;
        case MalSymbol.get(Symbols.Try):
          return TRY(env, args);
      }
    }

    const result = EVAL_AST(ast, env);
    checkMalTypeIsMalList(result);
    const [func, ...params] = result as MalList;
    if (isMalFunction(func)) {
      ast = func.ast;
      env = new MalEnv(func.env, func.params, new MalList(params));
      continue loop;
    }
    return func.call(...params);
  }
}

function DEF(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Def), args, 2);
  const [key, value] = args;
  checkMalTypeIsMalSymbol(key);
  return env.set(key as MalSymbol, EVAL(value, env));
}

function LET(env: MalEnv, args: Array<MalType>): [MalType, MalEnv] {
  checkMalInnerParameters(MalSymbol.get(Symbols.Let), args, 2);
  const [bindings, letAst] = args;
  checkMalTypeIsMalSequential(bindings);
  const newEnv = new MalEnv(env);
  checkMalSequentialBaseLength(bindings as MalVector, 2);
  for (const [key, value] of (bindings as MalList).group(2)) {
    checkMalTypeIsMalSymbol(key);
    newEnv.set(key as MalSymbol, EVAL(value, newEnv));
  }
  return [letAst, newEnv];
}

function DO(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerMultipleParameters(MalSymbol.get(Symbols.Do), args, 1);
  let results = EVAL_AST(new MalList(args), env);
  return (results as MalList).last();
}

function IF(env: MalEnv, args: Array<MalType>): MalType {
  if (args.length === 2) args.push(MalNil.get());
  checkMalInnerParameters(MalSymbol.get(Symbols.If), args, 3);
  const [condition, yes, no] = args;
  let result = EVAL(condition, env);
  return isPositive(result) ? yes : no;
}

function FN(env: MalEnv, args: Array<MalType>): MalFunction {
  const funcSymbol = MalSymbol.get(Symbols.Fn);
  checkMalInnerParameters(funcSymbol, args, 2);
  const [bindings, ast] = args;
  checkMalBindings(funcSymbol, bindings);
  const fn = (...fnArgs: Array<MalType>) =>
    EVAL(ast, new MalEnv(env, bindings as MalVector, new MalList(fnArgs)));
  return new MalFunction(ast, bindings as MalVector, env, fn);
}

function EVALFUNC(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Eval), args, 1);
  const [ast] = args;
  return EVAL(ast, env);
}

function QUOTE(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Quote), args, 1);
  return args[0];
}

function QUASIQUOTE(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Quasiquote), args, 1);
  const [ast] = args;
  if (!isMalList(ast) || ast.length < 1) {
    return new MalList([MalSymbol.get(Symbols.Quote), ast]);
  }

  const [ast1, ...astRest] = ast;
  if (MalSymbol.get(Symbols.Unquote).equal(ast1)) {
    checkMalInnerParameters(MalSymbol.get(Symbols.Unquote), astRest, 1);
    return astRest[0];
  }

  if (isMalList(ast1) && ast1.length > 0) {
    const [ast11, ...ast1Rest] = ast1 as MalList;
    if (MalSymbol.get(Symbols.SpliceUnquote).equal(ast11)) {
      checkMalInnerParameters(
        MalSymbol.get(Symbols.SpliceUnquote),
        ast1Rest,
        1
      );
      const [ast12] = ast1Rest;
      return new MalList([
        MalSymbol.get(Symbols.Concat),
        ast12,
        QUASIQUOTE(env, [new MalList(astRest)])
      ]);
    }
  }

  return new MalList([
    MalSymbol.get(Symbols.Cons),
    QUASIQUOTE(env, [ast1]),
    QUASIQUOTE(env, [new MalList(astRest)])
  ]);
}

function DEFMACRO(env: MalEnv, args: Array<MalType>): MalFunction {
  checkMalInnerParameters(MalSymbol.get(Symbols.Defmacro), args, 2);
  const [key, value] = args;
  checkMalTypeIsMalSymbol(key);
  const func = EVAL(value, env);
  checkMalTypeIsMalFunction(func);
  (func as MalFunction).isMacro = true;
  return env.set(key as MalSymbol, func) as MalFunction;
}

function MACROEXPAND(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Macroexpand), args, 1);
  let ast = args[0];
  while (isMacroFunction(env, ast)) {
    const [symbol, ...args] = ast as MalList;
    const func = env.get(symbol as MalSymbol);
    ast = func.call(...args);
  }
  return ast;
}

function TRY(env: MalEnv, args: Array<MalType>): MalType {
  checkMalInnerParameters(MalSymbol.get(Symbols.Try), args, 2);
  const [ast, catchAst] = args;
  checkCatchAst(catchAst);
  try {
    return EVAL(ast, env);
  } catch (error) {
    const [, errorSymbol, errorAst] = catchAst as MalList;
    const bindings = new MalList([errorSymbol]);
    const exprs = new MalList([error]);
    const newEnv = new MalEnv(env, bindings, exprs);
    return EVAL(errorAst, newEnv);
  }
}

function isMacroFunction(env: MalEnv, ast: MalType): boolean {
  if (!isMalList(ast) || ast.length < 1) {
    return false;
  }

  const symbol = ast.first();
  if (!isMalSymbol(symbol)) {
    return false;
  }

  if (!env.has(symbol)) {
    return false;
  }

  const func = env.get(symbol);
  if (!isMalFunction(func)) {
    return false;
  }

  return func.isMacro;
}

function PRINT(exp: MalType): string {
  return printString(exp);
}

function rep(str: string): string {
  return PRINT(EVAL(READ(str), GlobalEnv));
}

function runScript(path: string): string {
  try {
    return rep(`(load-file "${path}")`);
  } catch (error) {
    printError(error);
  }
}

function startRepl(): void {
  repl.start({ prompt: "> ", eval: malEval, writer: (v: any) => v });

  function malEval(
    cmd: string,
    context: any,
    filename: string,
    callback: Function
  ) {
    try {
      callback(null, rep(cmd));
    } catch (e) {
      callback(null, e.toString());
    }
  }
}

function main(): void {
  const [node, enter, path, ...argv] = process.argv;
  GlobalEnv.set(
    MalSymbol.get(Symbols.Argv),
    new MalVector(argv.map(arg => new MalString(arg)))
  );
  if (!path) {
    startRepl();
  } else {
    runScript(path);
  }
}

main();
