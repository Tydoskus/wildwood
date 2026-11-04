import { localDeveloperAccess, localRewardMultiplier } from "./local-developer-access.mjs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

// Old local prototypes appended these columns, last in each table and in this order. Keep them only in that
// database's build; never change the release schema or generated bindings.
const legacyColumns = {
  chatMessage: [{ sql: 'reaction_counts_json', field: 'reactionCountsJson', type: 'String', builder: 't.string().default("{}")', value: '"{}"' }],
  socialMessage: [{ sql: 'reaction_counts_json', field: 'reactionCountsJson', type: 'String', builder: 't.string().default("{}")', value: '"{}"' }],
  playerLifetime: [{ sql: 'chat_hearts_received', field: 'chatHeartsReceived', type: 'U64', builder: 't.u64().default(0n)', value: '0n' }],
  bossDefeatWindow: [{ sql: 'accepted_map_ids', field: 'acceptedMapIds', type: 'Array', elementType: 'String', builder: 't.array(t.string()).default([])', value: '[]' }],
};

/**
 * More such columns, from branches tried on the local database, listed in local-data/legacy-columns.json as
 * { "tableName": [{ "sql", "field", "type", "builder", "value" }] } in the same form as those above.
 */
export async function localColumnsFile(root) {
  try { return JSON.parse(await readFile(join(root, 'local-data/legacy-columns.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function localLegacyColumns(schema, extra = {}) {
  const types = schema.sections?.find(section => section.Typespace)?.Typespace.types;
  const tables = schema.sections?.find(section => section.Tables)?.Tables;
  if (!types || !tables) throw new Error('Unrecognized local database schema; no data was changed.');
  const result = {};
  for (const [name, columns] of Object.entries({ ...legacyColumns, ...extra })) {
    const table = tables.find(table => table.source_name === name);
    const elements = table && types[table.product_type_ref]?.Product?.elements;
    const found = columns.filter(column => elements?.some(element => element.name?.some === column.sql));
    if (!found.length) continue;
    const trailing = elements.slice(-found.length);
    const matches = found.every((column, index) => trailing[index].name?.some === column.sql && column.type in trailing[index].algebraic_type
      && (!column.elementType || column.elementType in trailing[index].algebraic_type[column.type]));
    if (!matches) throw new Error(`Unexpected legacy column in ${name}; no data was changed.`);
    result[name] = found;
  }
  return result;
}

export function preserveLocalColumns(source, columns) {
  const file = ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && columns[node.name.text]) {
      const call = node.initializer;
      if (call && ts.isCallExpression(call) && call.expression.getText(file) === 'table') {
        const row = call.arguments[1];
        if (!row || !ts.isObjectLiteralExpression(row)) throw new Error(`Cannot preserve ${node.name.text}.`);
        const missing = columns[node.name.text].filter(column => !row.properties.some(property => property.name?.getText(file) === column.field));
        if (missing.length) {
          const last = row.properties.at(-1);
          edits.push({ start: row.end - 1, end: row.end - 1,
            text: `${last && !source.slice(last.end, row.end).includes(',') ? ',' : ''}\n${missing.map(column => `${column.field}: ${column.builder},`).join('\n')}\n` });
        }
      }
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const callee = node.expression.getText(file);
      const match = callee.match(/^(\w+\.db\.(\w+))(?:\.(\w+))?\.(insert|update)$/);
      const kept = match && columns[match[2]];
      if (kept) {
        const argument = node.arguments[0];
        const previous = column => match[4] === 'update' && match[3]
          ? `${match[1]}.${match[3]}.find(row.${match[3]})?.${column.field} ?? ` : '';
        const fields = kept.map(column => `${column.field}: row.${column.field} ?? ${previous(column)}${column.value}`).join(', ');
        edits.push({ start: argument.getStart(file), end: argument.end, text: `((row: any) => ({ ...row, ${fields} }))(${argument.getText(file)})` });
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

const WORKSPACE_PREFIX = 'dev-workspace-';
const OWNER_FILE = '.owner-pid';

const processAlive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
};

/**
 * Removes workspaces left by runs that ended without cleaning up (killed, crashed, terminal closed): those
 * whose owning process is gone, or older ones with no owner recorded. A workspace another run still uses stays.
 */
export async function sweepStaleWorkspaces(root, alive = processAlive) {
  const folder = join(root, 'local-data');
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(WORKSPACE_PREFIX)) continue;
    const directory = join(folder, entry.name);
    const pid = Number((await readFile(join(directory, OWNER_FILE), 'utf8').catch(() => '')).trim());
    if (Number.isInteger(pid) && pid > 0 && alive(pid)) continue;
    await rm(directory, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

export async function createLocalWorkspace(root, columns) {
  await mkdir(join(root, 'local-data'), { recursive: true });
  const swept = await sweepStaleWorkspaces(root);
  if (swept.length) console.log(`Removed ${swept.length} leftover local workspace${swept.length === 1 ? '' : 's'}.`);
  let localIdentity = process.env.WILDSTAT_LOCAL_DEVELOPER_IDENTITY;
  if (!localIdentity) {
    try { localIdentity = (await readFile(join(root, 'local-data/developer-identity.txt'), 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let rewardMultiplier = process.env.WILDSTAT_LOCAL_REWARD_MULTIPLIER;
  if (!rewardMultiplier) {
    try { rewardMultiplier = (await readFile(join(root, 'local-data/reward-multiplier.txt'), 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const rewards = rewardMultiplier ? Number(rewardMultiplier) : 1;
  if (rewards !== 1) console.log(`Local stat rewards ×${rewards} (local-data/reward-multiplier.txt).`);
  const directory = await mkdtemp(join(root, `local-data/${WORKSPACE_PREFIX}`));
  await writeFile(join(directory, OWNER_FILE), String(process.pid));
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
      for (const [relative, server] of [['shared/developer-identity.ts', false], ['spacetimedb/src/session-guards.ts', true]]) {
        const path = join(directory, relative);
        await writeFile(path, localDeveloperAccess(await readFile(path, 'utf8'), server, localIdentity));
      }
      const research = join(directory, 'shared/research.ts');
      await writeFile(research, localRewardMultiplier(await readFile(research, 'utf8'), rewards));
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
