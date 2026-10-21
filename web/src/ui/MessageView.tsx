// One chat message with branch navigation, edit, regenerate and copy. Licensed under GPL-3.0.
import { useMemo, useState } from 'preact/hooks';
import { renderMarkdown } from '../core/markdown';
import { siblingInfo } from '../core/tree';
import type { Attachment, Message, Part } from '../core/types';
import { editMessage, regenerate, switchBranch } from '../core/chat';
import { toast } from './toast';

export function AttachmentChips({ attachments, onRemove }: { attachments: Attachment[]; onRemove?: (id: string) => void }) {
  return (
    <div class="chips">
      {attachments.map((a) => (
        <div class={'chip' + (a.kind === 'image' ? ' img' : '')} key={a.id} data-testid="attachment-chip" title={a.name}>
          {a.kind === 'image' && a.data
            ? <img src={`data:${a.mime};base64,${a.data}`} alt={a.name} />
            : <span class="file">{a.kind === 'pdf' ? '📕' : '📄'} {a.name}</span>}
          {onRemove && <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a.id)}>✕</button>}
        </div>
      ))}
    </div>
  );
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
}

function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div class={'md' + (streaming ? ' cursor' : '')} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ToolBlock({ part }: { part: Extract<Part, { type: 'tool' }> }) {
  const icon = part.status === 'running' ? '⏳' : part.status === 'error' ? '⚠️' : '🔧';
  const label = part.status === 'running' ? `Calling ${part.call.name}…` : `Called ${part.call.name}`;
  return (
    <details class="tool" data-testid="tool-block">
      <summary>{icon} {label}</summary>
      <pre>{part.call.arguments}</pre>
      {part.result !== undefined && <pre>{part.result.length > 4000 ? part.result.slice(0, 4000) + '\n…' : part.result}</pre>}
    </details>
  );
}

function BranchNav({ msg, all, disabled }: { msg: Message; all: Map<string, Message>; disabled: boolean }) {
  const { index, count } = siblingInfo(msg, all.values());
  if (count < 2) return null;
  return (
    <span class="branch" data-testid="branch-nav">
      <button aria-label="Previous branch" disabled={disabled || index === 0} onClick={() => switchBranch(msg.id, -1)}>‹</button>
      <span data-testid="branch-count">{index + 1}/{count}</span>
      <button aria-label="Next branch" disabled={disabled || index === count - 1} onClick={() => switchBranch(msg.id, 1)}>›</button>
    </span>
  );
}

export function MessageView({ msg, all, busy }: { msg: Message; all: Map<string, Message>; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.text);

  if (msg.role === 'user') {
    return (
      <div class="msg user" data-testid="msg-user">
        {editing ? (
          <div>
            <textarea class="textarea" data-testid="edit-input" value={draft} onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
            <div class="btn-row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
              <button class="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button class="btn primary" data-testid="edit-save" disabled={!draft.trim() && !msg.attachments?.length} onClick={() => { setEditing(false); editMessage(msg.id, draft); }}>Send</button>
            </div>
          </div>
        ) : (
          <>
            {!!msg.attachments?.length && <AttachmentChips attachments={msg.attachments} />}
            {msg.text && <div class="bubble">{msg.text}</div>}
          </>
        )}
        <div class="meta">
          <BranchNav msg={msg} all={all} disabled={busy} />
          {!editing && <button aria-label="Edit" data-testid="edit" disabled={busy} onClick={() => { setDraft(msg.text); setEditing(true); }}>✎</button>}
          <button aria-label="Copy" onClick={() => copy(msg.text)}>⧉</button>
        </div>
      </div>
    );
  }

  const streaming = msg.status === 'streaming';
  const lastText = [...msg.parts].reverse().find((p) => p.type === 'text');
  const plain = msg.parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('');
  return (
    <div class="msg assistant" data-testid="msg-assistant" data-status={msg.status}>
      <div class="bubble">
        {msg.parts.map((p, i) =>
          p.type === 'thought' ? (
            <details class="thought" key={i}><summary>Thinking</summary><div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div></details>
          ) : p.type === 'tool' ? (
            <ToolBlock key={i} part={p} />
          ) : (
            <Markdown key={i} text={p.text} streaming={streaming && p === lastText} />
          ),
        )}
        {streaming && msg.parts.length === 0 && <div class="subtle cursor">Thinking</div>}
        {msg.status === 'stopped' && <div class="subtle">Stopped</div>}
        {msg.status === 'error' && <div class="err" data-testid="msg-error">{msg.error}</div>}
      </div>
      {!streaming && (
        <div class="meta">
          <BranchNav msg={msg} all={all} disabled={busy} />
          <button aria-label="Regenerate" data-testid="regenerate" disabled={busy} onClick={() => regenerate(msg.id)}>↻</button>
          <button aria-label="Copy" onClick={() => copy(plain)}>⧉</button>
          {msg.model && <span class="subtle" style={{ marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.model}</span>}
        </div>
      )}
    </div>
  );
}
