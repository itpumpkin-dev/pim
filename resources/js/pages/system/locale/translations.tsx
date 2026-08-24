import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    CircularProgress,
    InputAdornment,
    Paper,
    Snackbar,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentTranslationCoverage, type ContentGroup } from '@/components/system/content-translation-coverage';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriGhostSx, fioriSearchFieldSx } from '@/lib/fiori-style';

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

    const original = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.path, entry.value])), [entries]);
    const [values, setValues] = useState<Record<string, string>>(original);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    // Switching tabs here is a real server round-trip (router.get — the
    // "Content" tab in particular runs a heavy DB scan across attributes/
    // options/categories, worst at categories' 1000+ scale), not a client-
    // side toggle — with no visual feedback the click looked like it did
    // nothing until the new page finished loading. Tracks that gap so the
    // Tabs can show a spinner and the content area can dim instead.
    const [switchingTab, setSwitchingTab] = useState(false);

    useEffect(() => {
        setValues(original);
    }, [original]);

    const dirty = useMemo(
        () => Object.fromEntries(Object.entries(values).filter(([path, value]) => value !== original[path])),
        [values, original],
    );
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

    const switchNamespace = (namespace: string) => {
        if (namespace === activeNamespace) {
            return;
        }

        if (dirtyCount > 0 && !window.confirm(tSystem('unsavedTranslationsCount', { count: dirtyCount }) + ' — discard?')) {
            return;
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
            render: (entry) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                    {entry.path}
                </Typography>
            ),
        },
        {
            key: 'source',
            header: tSystem('translationSource'),
            priority: 'medium',
            render: (entry) => (
                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                    {entry.source}
                </Typography>
            ),
        },
        {
            key: 'value',
            header: tSystem('translationValue'),
            priority: 'high',
            minWidth: 260,
            render: (entry) => (
                <TextField
                    fullWidth
                    multiline
                    size="small"
                    value={values[entry.path] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [entry.path]: e.target.value }))}
                    sx={{
                        bgcolor: FIORI.surface,
                        ...(dirty[entry.path] !== undefined && {
                            '& .MuiOutlinedInput-root': { borderColor: FIORI.warning },
                        }),
                    }}
                />
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${tSystem('translationsTitle')}: ${localeModel.code}`} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        {tSystem('translationsTitle')}: {localeModel.display_name || localeModel.code}
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {!isContentTab && dirtyCount > 0 && (
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {tSystem('unsavedTranslationsCount', { count: dirtyCount })}
                            </Typography>
                        )}
                        <Button
                            component={Link}
                            href="/system/locales"
                            variant="outlined"
                            sx={fioriDefaultSx}
                        >
                            {t('cancel')}
                        </Button>
                        {!isContentTab && (
                            <Button
                                variant="contained"
                                disabled={dirtyCount === 0 || saving}
                                onClick={save}
                                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={fioriEmphasizedSx}
                            >
                                {saving ? 'Saving…' : tSystem('saveTranslations')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                <Paper elevation={0} sx={{ ...fioriCardSx, mb: 2, display: 'flex', alignItems: 'center' }}>
                    <Tabs
                        value={activeNamespace ?? false}
                        onChange={(_, value: string) => switchNamespace(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ px: 1, flex: 1, opacity: switchingTab ? 0.6 : 1, pointerEvents: switchingTab ? 'none' : 'auto' }}
                    >
                        {namespaces.map((namespace) => (
                            <Tab key={namespace} value={namespace} label={namespaceLabel(namespace)} sx={{ textTransform: 'none' }} />
                        ))}
                        <Tab
                            key={CONTENT_NAMESPACE}
                            value={CONTENT_NAMESPACE}
                            label={tSystem('contentTranslationsTab')}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                        />
                    </Tabs>
                    {switchingTab && <CircularProgress size={18} thickness={5} sx={{ mr: 2 }} />}
                </Paper>

                <Box sx={{ position: 'relative' }}>
                    {switchingTab && (
                        <Box
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 1.5,
                                pt: 8,
                                bgcolor: 'rgba(247,247,247,0.7)',
                            }}
                        >
                            <CircularProgress size={32} />
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {tSystem('translationsTabLoading')}
                            </Typography>
                        </Box>
                    )}

                {isContentTab ? (
                    contentGroups && <ContentTranslationCoverage localeId={localeModel.id} groups={contentGroups} />
                ) : (
                    <>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tSystem('searchTranslations')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, mb: 2, minWidth: 320 }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: FIORI.textSecondary }} />
                                    </InputAdornment>
                                ),
                            }}
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
                </Box>
            </Box>

            <Snackbar
                open={saved}
                autoHideDuration={5000}
                onClose={() => setSaved(false)}
                message={tSystem('saveTranslations')}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            />
        </AppLayout>
    );
}
