import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Button } from '@ui5/webcomponents-react';

interface Props {
    /** total number of pages (Laravel `last_page`) */
    count: number;
    /** 1-based current page (Laravel `current_page`) */
    page: number;
    onChange: (page: number) => void;
}

/** Page numbers to show: first, last, current ± 1, with `null` for an ellipsis gap (same shape as MUI's Pagination). */
function pageItems(count: number, page: number): Array<number | null> {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

    const start = Math.max(2, Math.min(page - 1, count - 4));
    const end = Math.min(count - 1, Math.max(page + 1, 5));
    const items: Array<number | null> = [1];
    if (start > 2) items.push(null);
    for (let p = start; p <= end; p++) items.push(p);
    if (end < count - 1) items.push(null);
    items.push(count);
    return items;
}

/**
 * Numbered pager for the Import / Export list pages (UI5 has no Pagination
 * control): prev / page numbers with ellipses / next, centred under the table.
 */
export default function PagePagination({ count, page, onChange }: Props) {
    return (
        <nav style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem', marginTop: '2rem' }}>
            <Button design="Transparent" icon="slim-arrow-left" accessibleName="‹" disabled={page <= 1} onClick={() => onChange(page - 1)} />
            {pageItems(count, page).map((item, idx) =>
                item === null ? (
                    <span key={`gap-${idx}`} style={{ padding: '0 0.25rem', color: 'var(--sapContent_LabelColor)' }}>
                        …
                    </span>
                ) : (
                    <Button
                        key={item}
                        design={item === page ? 'Emphasized' : 'Transparent'}
                        aria-current={item === page ? 'page' : undefined}
                        style={{ minWidth: '2.25rem' }}
                        onClick={() => item !== page && onChange(item)}
                    >
                        {item}
                    </Button>
                ),
            )}
            <Button design="Transparent" icon="slim-arrow-right" accessibleName="›" disabled={page >= count} onClick={() => onChange(page + 1)} />
        </nav>
    );
}
