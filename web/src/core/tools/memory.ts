// Memory tools, same names and behavior as the Android MemoryToolProvider. Licensed under GPL-3.0.
import { del, get, getAll, kv, put } from '../db';
import type { ToolDef } from '../types';

export interface MemoryFile { name: string; description: string; content: string; updatedAt: number }

const ACTIVE = 'memory.active';

export const getActiveMemory = async () => (await kv.get<string>(ACTIVE)) ?? '';
export const setActiveMemory = (text: string) => kv.set(ACTIVE, text);
export const listMemoryFiles = async () => (await getAll<MemoryFile>('memory')).sort((a, b) => a.name.localeCompare(b.name));
export const deleteMemoryFile = (name: string) => del('memory', name);
export const saveMemoryFile = (f: MemoryFile) => put('memory', f);

const str = (description: string) => ({ type: 'string', description });

export const MEMORY_TOOLS: ToolDef[] = [
  { name: 'list_memory_files', description: 'List all files in the memory database with their names and descriptions.', parameters: { type: 'object', properties: {} } },
  { name: 'read_memory_file', description: 'Read the content of one or more files from the memory database.', parameters: { type: 'object', properties: { name: str('The file name to read.') }, required: ['name'] } },
  {
    name: 'create_memory_file', description: 'Create a new file in the memory database with the given content and optional description.',
    parameters: { type: 'object', properties: { name: str("The file name to create (e.g., 'notes.md')."), content: str('The file content.'), description: str('Optional short description.') }, required: ['name', 'content'] },
  },
  {
    name: 'edit_memory_file', description: 'Edit one aspect of a memory file. operation must be replace, patch, rename, or describe.',
    parameters: {
      type: 'object',
      properties: {
        name: str('The current file name.'), operation: str('One of: replace, patch, rename, describe.'),
        content: str('Complete replacement content for replace. May be empty.'), old_string: str('Exact non-empty unique text to replace for patch.'),
        new_string: str('Replacement text for patch. May be empty to delete the match.'), new_name: str('The target file name for rename.'),
        description: str('The new description for describe. May be empty to remove it.'),
      },
      required: ['name', 'operation'],
    },
  },
  { name: 'delete_memory_file', description: 'Delete a file from the memory database.', parameters: { type: 'object', properties: { name: str('The file name to delete.') }, required: ['name'] } },
  { name: 'read_active_memory', description: 'Read the current stored active memory. The copy in the system prompt is captured once per turn, so edits made during this turn appear here but not in the prompt until the next turn.', parameters: { type: 'object', properties: {} } },
  {
    name: 'update_active_memory',
    description: "Update the active memory context. Modes: 'replace' (overwrite with 'content'), 'append' (add 'content' to end), 'prepend' (add 'content' to beginning), 'patch' (find 'old_string' exactly once and replace with 'new_string'). Default is replace.",
    parameters: {
      type: 'object',
      properties: {
        content: str('The content to write (for replace/append/prepend modes).'), mode: str('One of: replace, append, prepend, patch. Default is replace.'),
        old_string: str('Exact string to find and replace in the active memory. Required for patch mode. Must match exactly once.'),
        new_string: str('Replacement string for old_string in patch mode. Pass empty string to delete the matched text.'),
      },
      required: ['content'],
    },
  },
];

export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS.map((t) => t.name));

function patchOnce(text: string, oldS: string, newS: string): string {
  if (!oldS) throw new Error('old_string must not be empty');
  const first = text.indexOf(oldS);
  if (first < 0) throw new Error('old_string not found');
  if (text.indexOf(oldS, first + 1) >= 0) throw new Error('old_string matches more than once');
  return text.slice(0, first) + newS + text.slice(first + oldS.length);
}

export async function executeMemoryTool(name: string, a: Record<string, unknown>): Promise<string> {
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  switch (name) {
    case 'list_memory_files': {
      const files = await listMemoryFiles();
      return JSON.stringify(files.map((f) => ({ name: f.name, description: f.description })));
    }
    case 'read_memory_file': {
      const f = await get<MemoryFile>('memory', s('name'));
      return f ? f.content : `File not found: ${s('name')}`;
    }
    case 'create_memory_file': {
      if (!s('name')) throw new Error('name is required');
      if (await get<MemoryFile>('memory', s('name'))) throw new Error(`File already exists: ${s('name')}`);
      await saveMemoryFile({ name: s('name'), description: s('description'), content: s('content'), updatedAt: Date.now() });
      return `Created ${s('name')}`;
    }
    case 'edit_memory_file': {
      const f = await get<MemoryFile>('memory', s('name'));
      if (!f) throw new Error(`File not found: ${s('name')}`);
      switch (s('operation')) {
        case 'replace': f.content = s('content'); break;
        case 'patch': f.content = patchOnce(f.content, s('old_string'), s('new_string')); break;
        case 'describe': f.description = s('description'); break;
        case 'rename': {
          const to = s('new_name');
          if (!to) throw new Error('new_name is required');
          if (await get<MemoryFile>('memory', to)) throw new Error(`File already exists: ${to}`);
          await deleteMemoryFile(f.name);
          f.name = to;
          break;
        }
        default: throw new Error('operation must be replace, patch, rename, or describe');
      }
      f.updatedAt = Date.now();
      await saveMemoryFile(f);
      return `Updated ${f.name}`;
    }
    case 'delete_memory_file':
      await deleteMemoryFile(s('name'));
      return `Deleted ${s('name')}`;
    case 'read_active_memory':
      return (await getActiveMemory()) || '(empty)';
    case 'update_active_memory': {
      const cur = await getActiveMemory();
      const mode = s('mode') || 'replace';
      const next = mode === 'append' ? (cur ? `${cur}\n${s('content')}` : s('content'))
        : mode === 'prepend' ? (cur ? `${s('content')}\n${cur}` : s('content'))
          : mode === 'patch' ? patchOnce(cur, s('old_string'), s('new_string'))
            : s('content');
      await setActiveMemory(next);
      return 'Active memory updated';
    }
  }
  throw new Error(`Unknown memory tool: ${name}`);
}
