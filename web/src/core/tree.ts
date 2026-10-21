// Message tree and branch selection. Messages link through parentId; a conversation stores the
// selected child per parent, so the visible path is derived and every branch is kept.
// Licensed under GPL-3.0.
import type { Conversation, Message } from './types';

export const ROOT = 'root';
export const keyOf = (parentId: string | null) => parentId ?? ROOT;

export function childrenOf(messages: Iterable<Message>, parentId: string | null): Message[] {
  const out: Message[] = [];
  for (const m of messages) if (m.parentId === parentId) out.push(m);
  return out.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/** The visible path: at each level take the selected child, or the newest one. */
export function activePath(conv: Pick<Conversation, 'selected'>, messages: Iterable<Message>): Message[] {
  const list = [...messages];
  const byParent = new Map<string, Message[]>();
  for (const m of list) {
    const k = keyOf(m.parentId);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(m);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const path: Message[] = [];
  let parent: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const kids = byParent.get(keyOf(parent));
    if (!kids?.length) break;
    const sel: string | undefined = conv.selected[keyOf(parent)];
    const pick: Message = kids.find((k) => k.id === sel) ?? kids[kids.length - 1];
    if (seen.has(pick.id)) break;
    seen.add(pick.id);
    path.push(pick);
    parent = pick.id;
  }
  return path;
}

export function siblingInfo(msg: Message, messages: Iterable<Message>): { index: number; count: number; siblings: Message[] } {
  const siblings = childrenOf(messages, msg.parentId);
  return { index: siblings.findIndex((s) => s.id === msg.id), count: siblings.length, siblings };
}

/** Selects the sibling `delta` steps away. Returns the new selection map (immutable). */
export function selectSibling(conv: Conversation, msg: Message, messages: Iterable<Message>, delta: number): Record<string, string> {
  const { index, siblings } = siblingInfo(msg, messages);
  const next = siblings[Math.min(siblings.length - 1, Math.max(0, index + delta))];
  return { ...conv.selected, [keyOf(msg.parentId)]: next.id };
}

/** All descendants of a message (for deleting a subtree). */
export function descendants(rootId: string, messages: Iterable<Message>): Message[] {
  const list = [...messages];
  const out: Message[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const m of list) if (m.parentId === id) { out.push(m); stack.push(m.id); }
  }
  return out;
}
