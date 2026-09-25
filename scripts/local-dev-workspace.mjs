import { localDeveloperAccess } from "./local-developer-access.mjs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

// An old local prototype appended these columns. Keep them only in that
// database's build; never change the release schema or generated bindings.
const legacyColumns = {
  chatMessage: { sql: 'reaction_counts_json', field: 'reactionCountsJson', type: 'String', builder: 't.string().default("{}")', value: '"{}"' },
  socialMessage: { sql: 'reaction_counts_json', field: 'reactionCountsJson', type: 'String', builder: 't.string().default("{}")', value: '"{}"' },
  playerLifetime: { sql: 'chat_hearts_received', field: 'chatHeartsReceived', type: 'U64', builder: 't.u64().default(0n)', value: '0n' },
  bossDefeatWindow: { sql: 'accepted_map_ids', field: 'acceptedMapIds', type: 'Array', elementType: 'String', builder: 't.array(t.string()).default([])', value: '[]' },
};

export function localLegacyColumns(schema) {
  const types = schema.sections?.find(section => section.Typespace)?.Typespace.types;
  const tables = schema.sections?.find(section => section.Tables)?.Tables;
  if (!types || !tables) throw new Error('Unrecognized local database schema; no data was changed.');
  const result = {};
  for (const [name, column] of Object.entries(legacyColumns)) {
    const table = tables.find(table => table.source_name === name);
    const elements = table && types[table.product_type_ref]?.Product?.elements;
    const existing = elements?.find(element => element.name?.some === column.sql);
    if (!existing) continue;
    if (!(column.type in existing.algebraic_type) || (column.elementType && !(column.elementType in existing.algebraic_type[column.type])) || elements.at(-1) !== existing) {
      throw new Error(`Unexpected legacy column in ${name}; no data was changed.`);
    }
    result[name] = column;
  }
  return result;
}

export function preserveLocalColumns(source, columns) {
  const file = ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && columns[node.name.text]) {
      const column = columns[node.name.text];
      const call = node.initializer;
      if (call && ts.isCallExpression(call) && call.expression.getText(file) === 'table') {
        const row = call.arguments[1];
        if (!row || !ts.isObjectLiteralExpression(row)) throw new Error(`Cannot preserve ${node.name.text}.`);
        if (!row.properties.some(property => property.name?.getText(file) === column.field)) {
          const last = row.properties.at(-1);
          edits.push({ start: row.end - 1, end: row.end - 1,
            text: `${last && !source.slice(last.end, row.end).includes(',') ? ',' : ''}\n${column.field}: ${column.builder},\n` });
        }
      }
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const callee = node.expression.getText(file);
      const match = callee.match(/^(\w+\.db\.(\w+))(?:\.(\w+))?\.(insert|update)$/);
      const column = match && columns[match[2]];
      if (column) {
        const argument = node.arguments[0];
        const previous = match[4] === 'update' && match[3]
          ? `${match[1]}.${match[3]}.find(row.${match[3]})?.${column.field} ?? ` : '';
        edits.push({ start: argument.getStart(file), end: argument.end,
          text: `((row: any) => ({ ...row, ${column.field}: row.${column.field} ?? ${previous}${column.value} }))(${argument.getText(file)})` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

async function syncTree(source, destination, keep = []) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const name of await readdir(destination)) {
    if (!keep.includes(name) && !entries.some(entry => entry.name === name)) {
      await rm(join(destination, name), { recursive: true, force: true });
    }
  }
  for (const entry of entries) {
    if (keep.includes(entry.name)) continue;
    if (entry.isDirectory()) await syncTree(join(source, entry.name), join(destination, entry.name));
    else await cp(join(source, entry.name), join(destination, entry.name));
  }
}

export async function createLocalWorkspace(root, columns) {
  await mkdir(join(root, 'local-data'), { recursive: true });
  let localIdentity = process.env.WILDSTAT_LOCAL_DEVELOPER_IDENTITY;
  if (!localIdentity) {
    try { localIdentity = (await readFile(join(root, 'local-data/developer-identity.txt'), 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const directory = await mkdtemp(join(root, 'local-data/dev-workspace-'));
  await cp(join(root, 'package.json'), join(directory, 'package.json'));
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
  await symlink(join(root, 'public'), join(directory, 'public'), 'junction');
  await mkdir(join(directory, 'spacetimedb'));
  await symlink(join(root, 'node_modules'), join(directory, 'spacetimedb/node_modules'), 'junction');
  for (const name of ['package.json', 'tsconfig.json']) {
    await cp(join(root, 'spacetimedb', name), join(directory, 'spacetimedb', name));
  }
  const tsconfigPath = join(directory, 'spacetimedb/tsconfig.json');
  const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'));
  tsconfig.exclude = [...(tsconfig.exclude || []), 'src/**/*.test.ts'];
  await writeFile(tsconfigPath, JSON.stringify(tsconfig));
  return {
    directory,
    async sync() {
      for (const name of ['src', 'shared', 'config', 'spacetimedb/src']) {
        await syncTree(join(root, name), join(directory, name), name === 'src' ? ['module_bindings'] : []);
      }
      for (const [relative, server] of [['shared/developer-identity.ts', false], ['spacetimedb/src/index.ts', true]]) {
        const path = join(directory, relative);
        await writeFile(path, localDeveloperAccess(await readFile(path, 'utf8'), server, localIdentity));
      }
      if (!Object.keys(columns).length) return;
      const serverSource = join(directory, 'spacetimedb/src');
      for (const name of await readdir(serverSource)) {
        if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
        const path = join(serverSource, name);
        const source = await readFile(path, 'utf8');
        if (Object.keys(columns).some(table => source.includes(table))) {
          await writeFile(path, preserveLocalColumns(source, columns));
        }
      }
    },
    async close() { await rm(directory, { recursive: true, force: true }); },
  };
}
