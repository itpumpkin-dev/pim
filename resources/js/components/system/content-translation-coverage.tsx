import TranslateIcon from '@mui/icons-material/Translate';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    LinearProgress,
    Link as MuiLink,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { Link, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';

export interface ContentMissingRow {
    id: number;
    code: string;
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
        <Stack spacing={2}>
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
        </Stack>
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
    const color = percent >= 100 ? '#22c55e' : percent >= 50 ? '#f59e0b' : '#ef4444';

    const filteredMissing = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return group.missing;
        return group.missing.filter((row) => row.code.toLowerCase().includes(needle));
    }, [group.missing, search]);

    return (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
                <Box sx={{ flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Typography variant="subtitle1" fontWeight={700}>
                            {group.label}
                        </Typography>
                        <Chip
                            label={`${group.translated} / ${group.total} · ${percent}%`}
                            size="small"
                            sx={{ bgcolor: color, color: '#fff', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
                        />
                    </Stack>
                    <LinearProgress
                        variant="determinate"
                        value={percent}
                        sx={{
                            mt: 1,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: '#e2e8f0',
                            maxWidth: 320,
                            '& .MuiLinearProgress-bar': { bgcolor: color },
                        }}
                    />
                </Box>
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={translatingGroup ? <CircularProgress size={14} /> : <TranslateIcon fontSize="small" />}
                    disabled={translatingGroup || group.missing.length === 0}
                    onClick={onTranslateAll}
                    sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                    {translatingGroup ? 'Queuing…' : `Translate all missing (${group.missing.length})`}
                </Button>
            </Stack>

            {group.missing.length > 0 && (
                <>
                    <TextField
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search code"
                        size="small"
                        sx={{ mb: 1, minWidth: 240 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <TableContainer sx={{ maxHeight: 280, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        Actions
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredMissing.map((row) => {
                                    const rowKey = `${group.key}:${row.id}`;
                                    const isTranslating = translatingRowKey === rowKey;

                                    return (
                                        <TableRow key={row.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.code}</TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title="Translate this one">
                                                        <span>
                                                            <IconButton size="small" disabled={isTranslating} onClick={() => onTranslateOne(row.id)}>
                                                                {isTranslating ? <CircularProgress size={16} /> : <TranslateIcon fontSize="small" />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <Tooltip title="Edit">
                                                        <span>
                                                            <MuiLink component={Link} href={row.editUrl} sx={{ display: 'flex', alignItems: 'center', px: 0.5 }}>
                                                                <Typography variant="caption">Edit</Typography>
                                                            </MuiLink>
                                                        </span>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {filteredMissing.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={2} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                                            No matches.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}
        </Paper>
    );
}
