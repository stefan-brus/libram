import { writeFile } from "fs/promises";
import path from "path";
import { BaseJavaCstVisitorWithDefaults, parse } from "java-parser";
import nodeFetch from "node-fetch";

/**
 *
import type {
  VariableDeclaratorListCtx,
  VariableInitializerListCstNode
} from "java-parser";
 */

const MODIFIERS_SOURCE_FILE =
  "https://raw.githubusercontent.com/kolmafia/kolmafia/main/src/net/sourceforge/kolmafia/Modifiers.java";

const MODIFIERS_FILE = path.join(__dirname, "../src/modifierTypes.ts");

const tc = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const aggregateTypeMapping = {
  Class: "class",
  Effect: "effect",
  "Plumber Stat": "stat",
  "Rollover Effect": "effect",
  Skill: "skill",
  Avatar: "monster",
} as const;

// Use "BaseJavaCstVisitor" if you need to implement all the visitor methods yourself.
class ModifiersVisitor extends BaseJavaCstVisitorWithDefaults {
  modifiers = {
    boolean: [] as string[],
    class: [] as string[],
    double: [] as string[],
    effect: [] as string[],
    monster: [] as string[],
    skill: [] as string[],
    stat: [] as string[],
    string: [] as string[],
  };

  constructor() {
    super();
    this.validateVisitor();
  }

  processModifier(
    modifierType: keyof ModifiersVisitor["modifiers"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list: any
  ) {
    const modifierDefinition = list.children.variableInitializer;
    const name = modifierDefinition[0].children.expression?.[0].children;
    if (!name) return;

    const literal =
      name.ternaryExpression?.[0].children.binaryExpression[0].children
        .unaryExpression[0].children.primary[0].children.primaryPrefix[0]
        .children.literal?.[0].children.StringLiteral?.[0].image;

    if (!literal) return;

    const unquoted = literal.substring(1, literal.length - 1);

    let mType = modifierType;

    if (unquoted in aggregateTypeMapping) {
      mType =
        aggregateTypeMapping[unquoted as keyof typeof aggregateTypeMapping];
    }

    this.modifiers[mType].push(unquoted);
  }

  processModifiers(
    modifierType: keyof ModifiersVisitor["modifiers"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list: any
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list.children.variableInitializer.forEach((v: any) => {
      const list =
        v.children.arrayInitializer?.[0].children.variableInitializerList?.[0];
      if (list) {
        this.processModifier(modifierType, list);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variableDeclaratorList(ctx: any) {
    const name =
      ctx.variableDeclarator[0].children.variableDeclaratorId[0].children
        .Identifier[0].image;

    const modifierType = Object.keys(this.modifiers).find(
      (m) => name === `${m}Modifiers`
    ) as keyof ModifiersVisitor["modifiers"] | undefined;

    if (modifierType) {
      const list =
        ctx.variableDeclarator?.[0].children.variableInitializer?.[0].children
          .arrayInitializer?.[0].children.variableInitializerList?.[0];
      if (list) {
        this.processModifiers(modifierType, list);
      }
    }
  }
}

async function main() {
  const response = await nodeFetch(MODIFIERS_SOURCE_FILE);
  const text = await response.text();
  const cst = parse(text);

  const visitor = new ModifiersVisitor();
  visitor.visit(cst);

  let contents = `// THIS FILE IS AUTOMATICALLY GENERATED. See tools/parseModifiers.ts for more information\n`;

  Object.entries(visitor.modifiers).forEach(([type, values]) => {
    const typeName = type === "double" ? "numeric" : type;
    console.log(`Storing ${values.length} props of type ${typeName}`);
    contents += `export const ${typeName}Modifiers = ${JSON.stringify(
      values
    )} as const;\n`;
    contents += `export type ${tc(
      typeName
    )}Modifier = typeof ${typeName}Modifiers[number];\n`;
  });

  await writeFile(MODIFIERS_FILE, contents);
}

main();
