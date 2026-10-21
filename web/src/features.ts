// Registers tools and their settings sections. Licensed under GPL-3.0.
import { h } from 'preact';
import { installToolHost } from './core/tools/host';
import { extraSections } from './ui/Settings';
import { McpSection, MemorySection, SearchSection } from './ui/ToolsSettings';
import { DataSection } from './ui/DataSection';

let installed = false;

export function installFeatures(): void {
  if (installed) return;
  installed = true;
  installToolHost();
  extraSections.push(
    { title: 'Memory', render: () => h(MemorySection, {}) },
    { title: 'Web search', render: () => h(SearchSection, {}) },
    { title: 'MCP servers', render: () => h(McpSection, {}) },
    { title: 'Data', render: () => h(DataSection, {}) },
  );
}
