import '@ui5/webcomponents-icons/dist/add-employee.js';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/error.js';
import '@ui5/webcomponents-icons/dist/group.js';
import '@ui5/webcomponents-icons/dist/history.js';
import '@ui5/webcomponents-icons/dist/key.js';
import '@ui5/webcomponents-icons/dist/log.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/role.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-up.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import '@ui5/webcomponents-icons/dist/tree.js';
import '@ui5/webcomponents-icons/dist/visits.js';
import { Button, SegmentedButton, SegmentedButtonItem, Text, Timeline, TimelineItem } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';

interface TimelineDiffRow {
    key: string;
    old: unknown;
    new: unknown;
}

type TimelineCategory = 'signin' | 'account' | 'work';

interface TimelineEntry {
    event: string;
    // Older responses (other endpoints reusing this panel) may omit these.
    category?: TimelineCategory;
    subject_type?: string | null;
    subject_id?: number | string | null;
    created_at: string | null;
    actor: string;
    diff: TimelineDiffRow[];
}

const CATEGORY_FILTERS: Array<{ key: 'all' | TimelineCategory; labelKey: string }> = [
    { key: 'all', labelKey: 'timelineFilterAll' },
    { key: 'signin', labelKey: 'timelineFilterSignin' },
    { key: 'work', labelKey: 'timelineFilterWork' },
    { key: 'account', labelKey: 'timelineFilterAccount' },
];

type EventState = 'None' | 'Positive' | 'Negative' | 'Critical' | 'Information';

// icon = SAP-icons name (side-effect imported above); state = UI5 value state that tints the timeline icon
const EVENT_META: Record<string, { label: string; icon: string; state: EventState }> = {
    // "created"/"updated"/"deleted" are the generic events the Auditable
    // trait fires automatically for ANY model (see app/Models/Concerns/
    // Auditable.php) — kept entity-agnostic ("Record ...") since this panel
    // is shared across users, products, and anything else Auditable.
    created: { label: 'Record created', icon: 'add-employee', state: 'Positive' },
    updated: { label: 'Record updated', icon: 'edit', state: 'Information' },
    deleted: { label: 'Record deleted', icon: 'delete', state: 'Negative' },
    login: { label: 'Logged in', icon: 'visits', state: 'Positive' },
    logout: { label: 'Logged out', icon: 'log', state: 'None' },
    login_failed: { label: 'Failed login attempt', icon: 'error', state: 'Negative' },
    password_reset: { label: 'Password changed', icon: 'key', state: 'Critical' },
    groups_updated: { label: 'Groups updated', icon: 'group', state: 'Information' },
    roles_updated: { label: 'Roles updated', icon: 'role', state: 'Information' },
    duplicated: { label: 'Duplicated', icon: 'product', state: 'Information' },
    labels_set: { label: 'Labels set', icon: 'edit', state: 'Information' },
    labels_updated: { label: 'Labels updated', icon: 'edit', state: 'Information' },
    published_shops_updated: { label: 'Sales channels updated', icon: 'edit', state: 'Information' },
    import_run: { label: 'Import run', icon: 'history', state: 'Information' },
    // ProductController::recordProductValueChanges() — the two events that
    // cover almost every real product edit (plain product-row column
    // changes already fall under "updated" above via the Auditable trait).
    attribute_values_updated: { label: 'Product details updated', icon: 'edit', state: 'Information' },
    variant_values_updated: { label: 'Variant details updated', icon: 'edit', state: 'Information' },
    // AutoTranslateProductValueJob → AttributeAutoTranslator::fillMissingProductValue()
    attribute_values_auto_translated: { label: 'AI translated', icon: 'translate', state: 'Information' },
    // Lazada category/attribute mapping journey — see
    // LazadaMappingTimelineBuilder and the AuditLog::record() call sites it
    // pulls from (CategoryController::bulkMapMarketplaceCategory(),
    // LazadaAttributeFamilyGenerator, LazadaMappedAttributeCreator).
    lazada_category_mapped: { label: 'Lazada category mapped', icon: 'tree', state: 'Critical' },
    lazada_synced: { label: 'Attribute family re-synced', icon: 'synchronize', state: 'Information' },
    lazada_family_attributes_synced: { label: 'Attribute family fields updated', icon: 'edit', state: 'Information' },
    lazada_family_attached_to_category: { label: 'Attribute family attached to category', icon: 'chain-link', state: 'Information' },
    // Shopee mirror ของ 4 event ข้างบน — ดู ShopeeAttributeFamilyGenerator /
    // CategoryController::bulkMapShopee()
    shopee_category_mapped: { label: 'Shopee category mapped', icon: 'tree', state: 'Critical' },
    shopee_synced: { label: 'Attribute family re-synced', icon: 'synchronize', state: 'Information' },
    shopee_family_attributes_synced: { label: 'Attribute family fields updated', icon: 'edit', state: 'Information' },
    shopee_family_attached_to_category: { label: 'Attribute family attached to category', icon: 'chain-link', state: 'Information' },
    option_created: { label: 'Option created', icon: 'add-employee', state: 'Positive' },
};

// 'work' entries land on humanize() for their label; keep a distinct icon/tint
// so they read differently from account/sign-in rows at a glance.
const WORK_FALLBACK: { icon: string; state: EventState } = { icon: 'product', state: 'Information' };

function humanize(value: unknown): string {
    return String(value)
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function eventMeta(event: string, category?: TimelineCategory) {
    if (EVENT_META[event]) return EVENT_META[event];
    const fallback: { icon: string; state: EventState } = category === 'work' ? WORK_FALLBACK : { icon: 'history', state: 'None' };
    return { label: humanize(event), ...fallback };
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return '—';
        // list payloads can hold objects (e.g. permissions: {resource, action})
        return value.map((item) => (item !== null && typeof item === 'object' ? Object.values(item).join('.') : String(item))).join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function formatDateTime(value: string | null): { display: string; relative: string } {
    if (!value) return { display: '-', relative: '' };

    // `value` is ISO 8601 with an explicit UTC offset (see
    // UserController::history()), so this already localizes to the
    // viewer's own timezone — no manual offset math needed.
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { display: value, relative: '' };

    const pad = (n: number) => String(n).padStart(2, '0');
    const display = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    let relative: string;
    if (diffSeconds < 60) relative = 'just now';
    else if (diffSeconds < 3600) relative = `${Math.floor(diffSeconds / 60)} minutes ago`;
    else if (diffSeconds < 86400) relative = `${Math.floor(diffSeconds / 3600)} hours ago`;
    else relative = `${Math.floor(diffSeconds / 86400)} days ago`;

    return { display, relative };
}

const DIFF_COLUMNS: FioriResponsiveColumn<TimelineDiffRow>[] = [
    { key: 'field', header: 'Field', priority: 'always', render: (row) => humanize(row.key) },
    {
        key: 'old',
        header: <span style={{ fontWeight: 700, color: 'var(--sapNegativeTextColor)' }}>Before</span>,
        popinText: 'Before',
        priority: 'high',
        render: (row) => <span style={{ color: 'var(--sapNegativeTextColor)' }}>{formatValue(row.old)}</span>,
    },
    {
        key: 'new',
        header: <span style={{ fontWeight: 700, color: 'var(--sapLinkColor)' }}>After</span>,
        popinText: 'After',
        priority: 'high',
        render: (row) => <span style={{ color: 'var(--sapLinkColor)', fontWeight: 600 }}>{formatValue(row.new)}</span>,
    },
];

/**
 * Vertical activity timeline fed by any backend endpoint that returns
 * `{ timeline: TimelineEntry[] }` (see UserController::history).
 */
export function TimelinePanel({ timelineUrl }: { timelineUrl: string }) {
    const { t } = useTranslation('system');
    const [entries, setEntries] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [filter, setFilter] = useState<'all' | TimelineCategory>('all');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetch(timelineUrl, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { timeline: [] }))
            .then((json) => {
                if (!cancelled) setEntries(json.timeline ?? []);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [timelineUrl]);

    const counts = useMemo(() => {
        const base: Record<'all' | TimelineCategory, number> = { all: entries.length, signin: 0, account: 0, work: 0 };
        for (const entry of entries) {
            if (entry.category) base[entry.category] += 1;
        }
        return base;
    }, [entries]);

    const visible = useMemo(() => (filter === 'all' ? entries : entries.filter((entry) => entry.category === filter)), [entries, filter]);

    // Some categories may not exist for a given user (e.g. a user who has
    // never performed a 'work' action) — hide those filter chips entirely.
    const availableFilters = CATEGORY_FILTERS.filter((option) => option.key === 'all' || counts[option.key] > 0);

    if (!loading && entries.length === 0) {
        return <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('timelineEmpty')}</Text>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {availableFilters.length > 2 && (
                <SegmentedButton accessibleName={t('timelineFilterAll')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    {availableFilters.map((option) => (
                        <SegmentedButtonItem
                            key={option.key}
                            selected={filter === option.key}
                            onClick={() => {
                                setFilter(option.key);
                                setExpanded(null);
                            }}
                        >
                            {`${t(option.labelKey)} (${counts[option.key]})`}
                        </SegmentedButtonItem>
                    ))}
                </SegmentedButton>
            )}

            {visible.length === 0 ? (
                <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('timelineEmptyFiltered')}</Text>
            ) : (
                <Timeline loading={loading} accessibleName={t('timelineFilterAll')}>
                    {visible.map((entry, index) => {
                        const { label, icon, state } = eventMeta(entry.event, entry.category);
                        const { display, relative } = formatDateTime(entry.created_at);
                        const subject = entry.subject_type ? `${entry.subject_type}${entry.subject_id != null ? ` #${entry.subject_id}` : ''}` : null;
                        const hasDiff = entry.diff.length > 0;
                        const isOpen = expanded === index;

                        return (
                            <TimelineItem
                                key={index}
                                icon={icon}
                                state={state}
                                titleText={label}
                                subtitleText={`${entry.actor} · ${subject ? `${subject} · ` : ''}${display}${relative ? ` (${relative})` : ''}`}
                            >
                                {hasDiff && (
                                    <div>
                                        <Button
                                            design="Transparent"
                                            icon={isOpen ? 'slim-arrow-up' : 'slim-arrow-down'}
                                            accessibleName={label}
                                            onClick={() => setExpanded(isOpen ? null : index)}
                                        />
                                        {isOpen && (
                                            <FioriResponsiveTable
                                                size="small"
                                                columns={DIFF_COLUMNS}
                                                rows={entry.diff}
                                                getRowKey={(row) => row.key}
                                                style={{ marginTop: '0.5rem' }}
                                            />
                                        )}
                                    </div>
                                )}
                            </TimelineItem>
                        );
                    })}
                </Timeline>
            )}
        </div>
    );
}
