import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Button, FlexBox, Icon, Input, Link, ProgressIndicator, Tag, Text, Title } from '@ui5/webcomponents-react';
import { useMemo, useState } from 'react';

export interface ContentMissingRow {
    id: number;
    code: string;
    name: string;
    editUrl: string;
}

export interface ContentGroup {
    key: string;
    label: string;
    total: number;
    translated: number;
    missing: ContentMissingRow[];
}

/**
 * Translation-coverage view for the dynamic (EAV) catalog content —
 * Attributes, Attribute Options, Categories, Category Fields — as opposed to
 * the static i18n JSON tabs on the rest of this page. One card per content
 * type: progress bar, a "Translate All Missing" bulk action, and a
 * searchable list of the records still missing a label in this locale, each
 * with its own one-off "Translate" action.
 */
export function ContentTranslationCoverage({ localeId, groups }: { localeId: number; groups: ContentGroup[] }) {
    const [translatingGroup, setTranslatingGroup] = useState<string | null>(null);
    const [translatingRow, setTranslatingRow] = useState<string | null>(null);
    const [search, setSearch] = useState<Record<string, string>>({});

    const translateAllMissing = (type: string) => {
        setTranslatingGroup(type);
        router.post(
            `/system/locales/${localeId}/translations/queue-missing`,
            { type },
            { preserveScroll: true, onFinish: () => setTranslatingGroup(null) },
        );
    };

    const translateOne = (type: string, id: number) => {
        const key = `${type}:${id}`;
        setTranslatingRow(key);
        router.post(
            `/system/locales/${localeId}/translations/queue-one`,
            { type, id },
            { preserveScroll: true, onFinish: () => setTranslatingRow(null) },
        );
    };

    return (
        <FlexBox direction="Column" style={{ gap: '1rem' }}>
            {groups.map((group) => (
                <ContentGroupCard
                    key={group.key}
                    group={group}
                    search={search[group.key] ?? ''}
                    onSearchChange={(value) => setSearch((prev) => ({ ...prev, [group.key]: value }))}
                    translatingGroup={translatingGroup === group.key}
                    translatingRowKey={translatingRow}
                    onTranslateAll={() => translateAllMissing(group.key)}
                    onTranslateOne={(id) => translateOne(group.key, id)}
                />
            ))}
        </FlexBox>
    );
}

function ContentGroupCard({
    group,
    search,
    onSearchChange,
    translatingGroup,
    translatingRowKey,
    onTranslateAll,
    onTranslateOne,
}: {
    group: ContentGroup;
    search: string;
    onSearchChange: (value: string) => void;
    translatingGroup: boolean;
    translatingRowKey: string | null;
    onTranslateAll: () => void;
    onTranslateOne: (id: number) => void;
}) {
    const percent = group.total > 0 ? Math.round((group.translated / group.total) * 100) : 100;
    // ไล่สีตามความครบ: เขียว ≥100%, เหลือง ≥50%, แดงต่ำกว่านั้น
    const state = percent >= 100 ? ('Positive' as const) : percent >= 50 ? ('Critical' as const) : ('Negative' as const);

    const filteredMissing = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return group.missing;
        return group.missing.filter((row) => row.code.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle));
    }, [group.missing, search]);

    // Code identifies the row and Actions are the point of the table, so both
    // stay always-visible; Name is readable context that can reflow into the
    // pop-in area first on a narrow screen.
    const columns: FioriResponsiveColumn<ContentMissingRow>[] = [
        {
            key: 'code',
            header: 'Code',
            priority: 'always',
            render: (row) => <Text style={{ fontFamily: 'monospace', fontSize: 'var(--sapFontSmallSize)' }}>{row.code}</Text>,
        },
        {
            key: 'name',
            header: 'Name',
            priority: 'high',
            render: (row) => <Text style={{ fontSize: 'var(--sapFontSmallSize)' }}>{row.name || '—'}</Text>,
        },
        {
            key: 'actions',
            header: 'Actions',
            priority: 'always',
            align: 'right',
            render: (row) => {
                const rowKey = `${group.key}:${row.id}`;
                const isTranslating = translatingRowKey === rowKey;

                return (
                    <FlexBox justifyContent="End" alignItems="Center" style={{ gap: '0.25rem' }}>
                        <Button
                            design="Transparent"
                            icon="translate"
                            tooltip="Translate this one"
                            accessibleName="Translate this one"
                            disabled={isTranslating}
                            loading={isTranslating}
                            onClick={() => onTranslateOne(row.id)}
                        />
                        <Link
                            href={row.editUrl}
                            tooltip="Edit"
                            style={{ padding: '0 0.25rem', fontSize: 'var(--sapFontSmallSize)' }}
                            onClick={(event) => {
                                event.preventDefault();
                                router.visit(row.editUrl);
                            }}
                        >
                            Edit
                        </Link>
                    </FlexBox>
                );
            },
        },
    ];

    return (
        <div
            style={{
                background: 'var(--sapGroup_ContentBackground)',
                border: '1px solid var(--sapGroup_ContentBorderColor)',
                borderRadius: 'var(--sapElement_BorderCornerRadius)',
                padding: '1.25rem',
            }}
        >
            <FlexBox justifyContent="SpaceBetween" alignItems="Center" style={{ gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <FlexBox alignItems="Center" style={{ gap: '0.75rem' }}>
                        <Title level="H5" style={{ fontWeight: 700 }}>
                            {group.label}
                        </Title>
                        <Tag design={state} hideStateIcon>
                            {`${group.translated} / ${group.total} · ${percent}%`}
                        </Tag>
                    </FlexBox>
                    <ProgressIndicator value={percent} valueState={state} hideValue style={{ marginTop: '0.5rem', maxWidth: 320, height: 6 }} />
                </div>
                <Button
                    icon="translate"
                    loading={translatingGroup}
                    disabled={translatingGroup || group.missing.length === 0}
                    onClick={onTranslateAll}
                    style={{ whiteSpace: 'nowrap' }}
                >
                    {translatingGroup ? 'Queuing…' : `Translate all missing (${group.missing.length})`}
                </Button>
            </FlexBox>

            {group.missing.length > 0 && (
                <>
                    <Input
                        value={search}
                        onInput={(e) => onSearchChange(e.target.value)}
                        placeholder="Search code or name"
                        icon={<Icon name="search" />}
                        style={{ marginBottom: '0.5rem', minWidth: 240 }}
                    />
                    <div
                        style={{
                            maxHeight: 280,
                            overflowY: 'auto',
                            border: '1px solid var(--sapList_BorderColor)',
                            borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        }}
                    >
                        <FioriResponsiveTable
                            variant="plain"
                            size="small"
                            columns={columns}
                            rows={filteredMissing}
                            getRowKey={(row) => row.id}
                            emptyMessage="No matches."
                        />
                    </div>
                </>
            )}
        </div>
    );
}
