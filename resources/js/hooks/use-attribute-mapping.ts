import { router } from '@inertiajs/react';
import { useMemo, useState } from 'react';

/**
 * Common shape every marketplace's attribute-mapping row reduces to —
 * WooCommerceAttributeMapping/ShopeeAttributeMapping/LazadaAttributeMapping/
 * TikTokAttributeMapping each carry `target_field` + one platform-specific
 * "custom attribute" id field (`woocommerce_attribute_id`/
 * `shopee_attribute_id`/`lazada_attribute_name`/`tiktok_attribute_id`) —
 * each panel normalizes its own row shape into this one as `custom_id`
 * before handing it to this hook.
 */
export interface MappingAttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: string | null;
    custom_id: string | number | null;
    sort_order: number;
}

export interface MappingPendingEntry {
    target_field: string;
    custom_id: string | number | null;
    sort_order: number;
}

interface SaveEntry {
    attribute_id: number;
    target_field: string | null;
    custom_id: string | number | null;
    sort_order: number;
}

export interface UseAttributeMappingOptions {
    attributes: MappingAttributeRow[];
    saveUrl: string;
    syncUrl: string;
    /** Maps one save entry into the platform-specific POST body shape (e.g. renames `custom_id` to `woocommerce_attribute_id`). */
    buildSavePayload: (entry: SaveEntry) => Record<string, string | number | null>;
}

/**
 * State/logic shared by every `*-attribute-mapping-panel.tsx` — search +
 * status filtering, the pending-edits map, save/sync POSTs. Extracted after
 * four near-identical copies of this same state machine drifted (one
 * platform's video field gained a safety guard the others didn't get)
 * — see `resources/js/components/catalog/attribute-mapping-table.tsx` for
 * the shared table markup this pairs with.
 */
export function useAttributeMapping({ attributes, saveUrl, syncUrl, buildSavePayload }: UseAttributeMappingOptions) {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | 'mapped' | 'unmapped'>('mapped');
    const [pending, setPending] = useState<Record<number, MappingPendingEntry>>({});
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const valueFor = (row: MappingAttributeRow): MappingPendingEntry =>
        pending[row.id] ?? {
            target_field: row.target_field ?? '',
            custom_id: row.custom_id ?? null,
            sort_order: row.sort_order,
        };

    const isMapped = (row: MappingAttributeRow) => valueFor(row).target_field !== '';
    const hasPendingChange = (row: MappingAttributeRow) => row.id in pending;

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return attributes.filter((a) => {
            if (needle && !a.code.toLowerCase().includes(needle) && !a.label.toLowerCase().includes(needle)) {
                return false;
            }

            if (status === 'mapped' && !isMapped(a)) return false;
            if (status === 'unmapped' && isMapped(a)) return false;

            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attributes, search, status, pending]);

    const setEntry = (row: MappingAttributeRow, entry: Partial<MappingPendingEntry>) => {
        setPending((prev) => ({ ...prev, [row.id]: { ...valueFor(row), ...entry } }));
    };

    const setSortOrder = (row: MappingAttributeRow, sort_order: number) => setEntry(row, { sort_order });

    const pendingCount = Object.keys(pending).length;

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([attributeId, entry]) =>
            buildSavePayload({
                attribute_id: Number(attributeId),
                target_field: entry.target_field || null,
                custom_id: entry.custom_id,
                sort_order: entry.sort_order,
            }),
        );

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post(
            saveUrl,
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => setPending({}),
                onFinish: () => setSaving(false),
            },
        );
    };

    const syncFromPlatform = () => {
        setSyncing(true);
        router.post(
            syncUrl,
            {},
            {
                preserveScroll: true,
                onFinish: () => setSyncing(false),
            },
        );
    };

    return {
        search,
        setSearch,
        status,
        setStatus,
        filtered,
        valueFor,
        isMapped,
        hasPendingChange,
        setEntry,
        setSortOrder,
        pendingCount,
        saving,
        syncing,
        saveChanges,
        syncFromPlatform,
    };
}
