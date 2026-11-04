import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ContentTranslationCoverage, type ContentGroup } from '@/components/system/content-translation-coverage';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { FioriBusyIndicator } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Button, Icon, Input, Tab, TabContainer, Text, TextArea, Title, Toast } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './locale-pages.module.css';

const CONTENT_NAMESPACE = 'content';

// The tab strip used to show each i18n JSON file's raw filename
// (auth/catalog/common/grid/...) verbatim — meaningless to anyone who
// doesn't already know this app's own file layout. Maps each known
// namespace to a translation key for a real display name instead; any
// namespace not listed here (e.g. a new locale file added later) falls
// back to showing its raw name rather than crashing.
const NAMESPACE_LABEL_KEYS: Record<string, string> = {
    auth: 'translationNamespaceAuth',
    catalog: 'translationNamespaceCatalog',
    common: 'translationNamespaceCommon',
    dashboard: 'translationNamespaceDashboard',
    grid: 'translationNamespaceGrid',
    home: 'translationNamespaceHome',
    import_export: 'translationNamespaceImportExport',
    nav: 'translationNamespaceNav',
    settings: 'translationNamespaceSettings',
    system: 'translationNamespaceSystem',
};

interface LocaleModel {
    id: number;
    code: string;
    display_name: string | null;
}

interface TranslationEntry {
    path: string;
    source: string;
    value: string;
}

interface Props {
    localeModel: LocaleModel;
    namespaces: string[];
    activeNamespace: string | null;
    entries: TranslationEntry[];
    contentGroups: ContentGroup[] | null;
}

export default function LocaleTranslations({ localeModel, namespaces, activeNamespace, entries, contentGroups }: Props) {
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const { t } = useTranslation('grid');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('locales'), href: '/system/locales' },
        { title: `${tSystem('translationsTitle')}: ${localeModel.display_name || localeModel.code}`, href: '#' },
    ];

    // Fiori Message Box แทน window.confirm() ของเบราว์เซอร์ (ดู switchNamespace()
    // ด้านล่าง) — {confirmElement} ต้อง render ไว้ในต้นไม้ JSX ของหน้านี้ด้วย
    const { confirm, confirmElement } = useFioriConfirm();

    const original = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.path, entry.value])), [entries]);
    const [values, setValues] = useState<Record<string, string>>(original);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    // ปุ่มแปลรายคีย์ (ไอคอนในช่องคำแปล) — แปลแค่คีย์นั้นผ่าน provider ตั้งต้น แล้ว
    // ใส่ผลลงช่องทันทีเป็น "ยังไม่บันทึก" เหมือนแก้เอง (ยังต้องกดบันทึกการเปลี่ยนแปลง)
    const [translatingPaths, setTranslatingPaths] = useState<Set<string>>(new Set());
    const [translateError, setTranslateError] = useState<string | null>(null);
    // Switching tabs here is a real server round-trip (router.get — the
    // "Content" tab in particular runs a heavy DB scan across attributes/
    // options/categories, worst at categories' 1000+ scale), not a client-
    // side toggle — with no visual feedback the click looked like it did
    // nothing until the new page finished loading. Tracks that gap so the
    // Tabs can show a spinner and the content area can dim instead.
    const [switchingTab, setSwitchingTab] = useState(false);
    // UI5 TabContainer selects the clicked tab itself; when the "discard
    // unsaved changes?" confirm is cancelled, bumping this key remounts the
    // strip so the selection snaps back to activeNamespace.
    const [tabStripKey, setTabStripKey] = useState(0);

    useEffect(() => {
        setValues(original);
    }, [original]);

    const dirty = useMemo(() => Object.fromEntries(Object.entries(values).filter(([path, value]) => value !== original[path])), [values, original]);
    const dirtyCount = Object.keys(dirty).length;

    const filteredEntries = useMemo(() => {
        if (!search.trim()) {
            return entries;
        }

        const needle = search.trim().toLowerCase();

        return entries.filter(
            (entry) =>
                entry.path.toLowerCase().includes(needle) ||
                entry.source.toLowerCase().includes(needle) ||
                (values[entry.path] ?? '').toLowerCase().includes(needle),
        );
    }, [entries, search, values]);

    const switchNamespace = async (namespace: string) => {
        if (namespace === activeNamespace) {
            return;
        }

        if (dirtyCount > 0) {
            const confirmed = await confirm({
                title: 'Discard unsaved changes?',
                message: `${tSystem('unsavedTranslationsCount', { count: dirtyCount })} — discard?`,
                severity: 'warning',
                confirmLabel: 'Discard',
                destructive: true,
            });
            if (!confirmed) {
                setTabStripKey((key) => key + 1);
                return;
            }
        }

        setSwitchingTab(true);
        router.get(
            `/system/locales/${localeModel.id}/translations`,
            { ns: namespace },
            {
                preserveState: true,
                preserveScroll: true,
                onFinish: () => setSwitchingTab(false),
            },
        );
    };

    const save = () => {
        if (dirtyCount === 0 || !activeNamespace) {
            return;
        }

        setSaving(true);
        router.put(
            `/system/locales/${localeModel.id}/translations`,
            { namespace: activeNamespace, values: dirty },
            {
                preserveScroll: true,
                onSuccess: () => setSaved(true),
                onFinish: () => setSaving(false),
            },
        );
    };

    const translateEntry = async (path: string) => {
        if (!activeNamespace || translatingPaths.has(path)) {
            return;
        }

        setTranslatingPaths((prev) => new Set(prev).add(path));
        try {
            const res = await fetch(`/system/locales/${localeModel.id}/translations/translate-entry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
                body: JSON.stringify({ namespace: activeNamespace, path }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || typeof body.value !== 'string') {
                throw new Error(body.message || `HTTP ${res.status}`);
            }
            setValues((prev) => ({ ...prev, [path]: body.value }));
        } catch (e) {
            setTranslateError(tSystem('translateEntryFailed', { key: path, error: e instanceof Error ? e.message : String(e) }));
        } finally {
            setTranslatingPaths((prev) => {
                const next = new Set(prev);
                next.delete(path);
                return next;
            });
        }
    };

    const isContentTab = activeNamespace === CONTENT_NAMESPACE;

    const namespaceLabel = (namespace: string): string => {
        const key = NAMESPACE_LABEL_KEYS[namespace];
        return key ? tSystem(key) : namespace;
    };

    // Column pop-in priority (SAP Fiori responsive table): the translation
    // key identifies the row and the value is the field actually being
    // edited here, so both stay visible longest; the source path is
    // secondary context and reflows into the pop-in area first.
    const columns: FioriResponsiveColumn<TranslationEntry>[] = [
        {
            key: 'path',
            header: tSystem('translationKey'),
            priority: 'always',
            minWidth: 200,
            render: (entry) => <span className={styles.monoText}>{entry.path}</span>,
        },
        {
            key: 'source',
            header: tSystem('translationSource'),
            priority: 'medium',
            render: (entry) => <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{entry.source}</Text>,
        },
        {
            key: 'value',
            header: tSystem('translationValue'),
            priority: 'high',
            minWidth: 260,
            render: (entry) => (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.25rem', width: '100%' }}>
                    <TextArea
                        rows={1}
                        growing
                        value={values[entry.path] ?? ''}
                        onInput={(e) => {
                            const value = e.target.value;
                            setValues((prev) => ({ ...prev, [entry.path]: value }));
                        }}
                        disabled={translatingPaths.has(entry.path)}
                        className={dirty[entry.path] !== undefined ? styles.dirtyField : undefined}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                    <Button
                        design="Transparent"
                        icon="translate"
                        tooltip={tSystem('translateEntry')}
                        accessibleName={tSystem('translateEntry')}
                        disabled={translatingPaths.has(entry.path)}
                        loading={translatingPaths.has(entry.path)}
                        onClick={() => translateEntry(entry.path)}
                    />
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${tSystem('translationsTitle')}: ${localeModel.code}`} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <Title level="H2" size="H4" wrappingType="Normal">
                        {tSystem('translationsTitle')}: {localeModel.display_name || localeModel.code}
                    </Title>
                    <div className={styles.headerActions}>
                        {!isContentTab && dirtyCount > 0 && (
                            <span className={styles.mutedText}>{tSystem('unsavedTranslationsCount', { count: dirtyCount })}</span>
                        )}
                        <Button onClick={() => router.visit('/system/locales')}>{t('cancel')}</Button>
                        {!isContentTab && (
                            <Button design="Emphasized" disabled={dirtyCount === 0 || saving} loading={saving} onClick={save}>
                                {saving ? 'Saving…' : tSystem('saveTranslations')}
                            </Button>
                        )}
                    </div>
                </div>

                <div className={`${styles.tabStrip} ${switchingTab ? styles.tabStripBusy : ''}`}>
                    <TabContainer
                        key={tabStripKey}
                        collapsed
                        tabLayout="Inline"
                        onTabSelect={(e) => {
                            const namespace = e.detail.tab.dataset.ns;
                            if (namespace) {
                                void switchNamespace(namespace);
                            }
                        }}
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        {namespaces.map((namespace) => (
                            <Tab key={namespace} data-ns={namespace} text={namespaceLabel(namespace)} selected={activeNamespace === namespace} />
                        ))}
                        <Tab
                            key={CONTENT_NAMESPACE}
                            data-ns={CONTENT_NAMESPACE}
                            text={tSystem('contentTranslationsTab')}
                            selected={activeNamespace === CONTENT_NAMESPACE}
                        />
                    </TabContainer>
                    {switchingTab && <FioriBusyIndicator size="S" style={{ marginRight: '1rem' }} />}
                </div>

                <div style={{ position: 'relative' }}>
                    {switchingTab && (
                        <div className={styles.loadingOverlay}>
                            <FioriBusyIndicator size="M" />
                            <span className={styles.mutedText}>{tSystem('translationsTabLoading')}</span>
                        </div>
                    )}

                    {isContentTab ? (
                        contentGroups && <ContentTranslationCoverage localeId={localeModel.id} groups={contentGroups} />
                    ) : (
                        <>
                            <Input
                                value={search}
                                onInput={(e) => setSearch(e.target.value ?? '')}
                                placeholder={tSystem('searchTranslations')}
                                icon={<Icon name="search" />}
                                style={{ marginBottom: '1rem', minWidth: 320, maxWidth: '100%' }}
                            />

                            <FioriResponsiveTable
                                columns={columns}
                                rows={filteredEntries}
                                getRowKey={(entry) => entry.path}
                                size="small"
                                emptyMessage={tSystem('noTranslationEntriesFound')}
                            />
                        </>
                    )}
                </div>
            </div>

            <Toast open={saved} duration={5000} placement="TopEnd" onClose={() => setSaved(false)}>
                {tSystem('saveTranslations')}
            </Toast>
            <Toast open={translateError !== null} duration={8000} placement="TopEnd" onClose={() => setTranslateError(null)}>
                {translateError}
            </Toast>
            {confirmElement}
        </AppLayout>
    );
}
