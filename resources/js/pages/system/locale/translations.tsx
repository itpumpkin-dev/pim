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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentTranslationCoverage, type ContentGroup } from '@/components/system/content-translation-coverage';

const CONTENT_NAMESPACE = 'content';

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
        if (dirtyCount > 0 && !window.confirm(tSystem('unsavedTranslationsCount', { count: dirtyCount }) + ' — discard?')) {
            return;
        }

        router.get(`/system/locales/${localeModel.id}/translations`, { ns: namespace }, { preserveState: true, preserveScroll: true });
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${tSystem('translationsTitle')}: ${localeModel.code}`} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        {tSystem('translationsTitle')}: {localeModel.display_name || localeModel.code}
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {!isContentTab && dirtyCount > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {tSystem('unsavedTranslationsCount', { count: dirtyCount })}
                            </Typography>
                        )}
                        <Button
                            component={Link}
                            href="/system/locales"
                            variant="outlined"
                            sx={{ textTransform: 'none', fontWeight: 700, px: 2.5 }}
                        >
                            {t('cancel')}
                        </Button>
                        {!isContentTab && (
                            <Button
                                variant="contained"
                                disabled={dirtyCount === 0 || saving}
                                onClick={save}
                                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{ textTransform: 'none', fontWeight: 700, px: 2.5 }}
                            >
                                {saving ? 'Saving…' : tSystem('saveTranslations')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
                    <Tabs
                        value={activeNamespace ?? false}
                        onChange={(_, value: string) => switchNamespace(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ px: 1 }}
                    >
                        {namespaces.map((namespace) => (
                            <Tab key={namespace} value={namespace} label={namespace} sx={{ textTransform: 'none' }} />
                        ))}
                        <Tab
                            key={CONTENT_NAMESPACE}
                            value={CONTENT_NAMESPACE}
                            label={tSystem('contentTranslationsTab')}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                        />
                    </Tabs>
                </Paper>

                {isContentTab ? (
                    contentGroups && <ContentTranslationCoverage localeId={localeModel.id} groups={contentGroups} />
                ) : (
                    <>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tSystem('searchTranslations')}
                            size="small"
                            sx={{ mb: 2, minWidth: 320, bgcolor: '#fff' }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, width: '25%' }}>{tSystem('translationKey')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700, width: '35%' }}>{tSystem('translationSource')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700, width: '40%' }}>{tSystem('translationValue')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredEntries.map((entry) => (
                                        <TableRow key={entry.path} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b', verticalAlign: 'top', pt: 1.5 }}>
                                                {entry.path}
                                            </TableCell>
                                            <TableCell sx={{ color: 'text.secondary', verticalAlign: 'top', pt: 1.5 }}>{entry.source}</TableCell>
                                            <TableCell sx={{ verticalAlign: 'top' }}>
                                                <TextField
                                                    fullWidth
                                                    multiline
                                                    size="small"
                                                    value={values[entry.path] ?? ''}
                                                    onChange={(e) => setValues((prev) => ({ ...prev, [entry.path]: e.target.value }))}
                                                    sx={{
                                                        bgcolor: '#fff',
                                                        ...(dirty[entry.path] !== undefined && {
                                                            '& .MuiOutlinedInput-root': { borderColor: 'warning.main' },
                                                        }),
                                                    }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredEntries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                {tSystem('noTranslationEntriesFound')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
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
