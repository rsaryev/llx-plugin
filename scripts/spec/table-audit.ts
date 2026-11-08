/** Record a rejected table row only if no other rule for that table admits it. */
import { keysOf, type Page } from './markdown.ts';
import type { Excluded } from './sections.ts';
import type { TableRule } from './sources.ts';

interface RowAudit {
  readonly excluded: Excluded;
  readonly admitted: boolean;
}

export function createTableAudit(): {
  readonly visit: (rule: TableRule, page: Page) => void;
  readonly excluded: () => readonly Excluded[];
} {
  const rows = new Map<string, RowAudit>();
  return {
    visit(rule, page) {
      for (const table of page.tables) {
        if (!rule.section.test(table.heading.text)) continue;
        const header = table.header.map((cell) => cell.replace(/`/g, '')).join(' | ');
        if (rule.header && !rule.header.test(header)) continue;
        for (const row of table.rows) {
          const name = keysOf(row[0] ?? '').join(' / ');
          const section = `${table.heading.text} — ${name}`;
          const key = `${rule.page}:${header}:${section}`;
          rows.set(key, {
            admitted: (rows.get(key)?.admitted ?? false) || (rule.where?.(row) ?? true),
            excluded: {
              page: rule.page,
              section,
              reason: rule.excludedRowReason?.(row) ?? 'runtime',
            },
          });
        }
      }
    },
    excluded: () => [...rows.values()].filter((row) => !row.admitted).map((row) => row.excluded),
  };
}
