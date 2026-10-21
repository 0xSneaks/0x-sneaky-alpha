// Conversation persistence. Licensed under GPL-3.0.
import { deleteMany, getAll, getByIndex, put, putMany } from './db';
import type { Conversation, Message } from './types';

export async function listConversations(): Promise<Conversation[]> {
  return (await getAll<Conversation>('conversations')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadMessages(convId: string): Promise<Message[]> {
  return getByIndex<Message>('messages', 'convId', convId);
}

export function saveConversation(conv: Conversation): Promise<void> {
  return put('conversations', conv);
}

export function saveMessage(msg: Message): Promise<void> {
  return put('messages', msg);
}

/** Saves a conversation and messages in one transaction. */
export function saveTurn(conv: Conversation, messages: Message[]): Promise<void> {
  return putMany([{ store: 'conversations', value: conv }, ...messages.map((m) => ({ store: 'messages' as const, value: m }))]);
}

export async function deleteConversation(id: string): Promise<void> {
  const msgs = await loadMessages(id);
  await deleteMany([{ store: 'conversations', key: id }, ...msgs.map((m) => ({ store: 'messages' as const, key: m.id }))]);
}
