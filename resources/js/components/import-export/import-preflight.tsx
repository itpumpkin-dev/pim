import { FIORI } from '@/lib/fiori-style';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

// Validation scans the whole file, but caps the row count it walks so a
// pathologically large upload can't lock the tab up. The preview table only
// ever shows the first handful of rows.
const PREVIEW_ROW_LIMIT = 8;
const MAX_SCAN_ROWS = 20000;

export interface PreflightSchema {
    columns: string[];
    required: string[];
    labels: Record<string, string>;
}

interface Props {
    file: File | null;
    fileFormat: string;
    fieldSeparator: string;
    schema: PreflightSchema | null;
}

type CheckTone = 'pass' | 'warn' | 'fail';
interface CheckItem {
    tone: CheckTone;
    text: string;
}

const normalize = (value: string) => value.trim().toLowerCase();

export default function ImportPreflight({ file, fileFormat, fieldSeparator, schema }: Props) {
    const { t } = useTranslation('import_export');
    const [rows, setRows] = useState<string[][]>([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setRows([]);
            setError(null);
            setLoading(false);
            setTruncated(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const workbook =
                    fileFormat === 'csv'
                        ? XLSX.read(await file.text(), { type: 'string', FS: fieldSeparator || ',' })
                        : XLSX.read(await file.arrayBuffer(), { type: 'array' });

                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
                const capped = data.slice(0, MAX_SCAN_ROWS + 1);
                const parsed = capped.map((row) => (row as unknown[]).map((cell) => (cell === undefined || cell === null ? '' : String(cell))));

                if (!cancelled) {
                    setRows(parsed);
                    setTruncated(data.length > capped.length);
                }
            } catch {
                if (!cancelled) {
                    setError(t('previewError'));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [file, fileFormat, fieldSeparator, t]);

    const headers = rows[0] ?? [];
    const dataRows = useMemo(() => rows.slice(1), [rows]);

    // Which schema column (by code) each file header maps to — a header
    // matches either the raw code or its localized label, same rule the
    // server's RowHeaderNormalizer applies when the file is actually read.
    const headerCodeByIndex = useMemo(() => {
        if (!schema) return [];
        const bySlug = new Map<string, string>();
        for (const code of schema.columns) {
            bySlug.set(normalize(code), code);
            const label = schema.labels[code];
            if (label) bySlug.set(normalize(label), code);
        }
        return headers.map((header) => bySlug.get(normalize(header)) ?? null);
    }, [headers, schema]);

    const checks = useMemo<CheckItem[]>(() => {
        if (!schema || rows.length === 0) return [];

        const items: CheckItem[] = [];
        const mappedCodes = new Set(headerCodeByIndex.filter((code): code is string => code !== null));
        const labelFor = (code: string) => schema.labels[code] ?? code;

        // Required columns present?
        const missingRequired = schema.required.filter((code) => !mappedCodes.has(code));
        if (missingRequired.length === 0) {
            items.push({ tone: 'pass', text: t('preflightRequiredPresent') });
        } else {
            items.push({
                tone: 'fail',
                text: t('preflightRequiredMissing', { columns: missingRequired.map(labelFor).join(', ') }),
            });
        }

        // Unknown columns (ignored on import).
        const unknown = headers.filter((_, idx) => headerCodeByIndex[idx] === null && headers[idx].trim() !== '');
        if (unknown.length > 0) {
            items.push({ tone: 'warn', text: t('preflightUnknownColumns', { columns: unknown.join(', ') }) });
        }

        // Row count.
        if (dataRows.length === 0) {
            items.push({ tone: 'fail', text: t('preflightNoRows') });
        } else {
            items.push({
                tone: 'pass',
                text: truncated ? t('preflightRowCountCapped', { count: dataRows.length }) : t('preflightRowCount', { count: dataRows.length }),
            });
        }

        // Empty cells in a required column.
        schema.required.forEach((code) => {
            const idx = headerCodeByIndex.indexOf(code);
            if (idx === -1 || dataRows.length === 0) return;
            const blank = dataRows.filter((row) => (row[idx] ?? '').trim() === '').length;
            if (blank > 0) {
                items.push({ tone: 'fail', text: t('preflightEmptyCells', { column: labelFor(code), count: blank }) });
            }
        });

        // Duplicate SKU (products).
        const skuIdx = headerCodeByIndex.indexOf('sku');
        if (skuIdx !== -1 && dataRows.length > 0) {
            const seen = new Set<string>();
            const dupes = new Set<string>();
            for (const row of dataRows) {
                const sku = (row[skuIdx] ?? '').trim();
                if (sku === '') continue;
                if (seen.has(sku)) dupes.add(sku);
                else seen.add(sku);
            }
            if (dupes.size > 0) {
                items.push({ tone: 'warn', text: t('preflightDuplicateSku', { count: dupes.size }) });
            }
        }

        if (items.every((item) => item.tone === 'pass')) {
            items.push({ tone: 'pass', text: t('preflightAllGood') });
        }

        return items;
    }, [schema, rows, headers, headerCodeByIndex, dataRows, truncated, t]);

    if (!file) return null;

    const toneColor: Record<CheckTone, string> = {
        pass: FIORI.success,
        warn: FIORI.warning,
        fail: FIORI.error,
    };
    const toneIcon: Record<CheckTone, typeof CheckCircleIcon> = {
        pass: CheckCircleIcon,
        warn: WarningIcon,
        fail: CancelIcon,
    };

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: FIORI.textPrimary }}>
                {t('preflightTitle')}
            </Typography>

            {loading && (
                <Stack direction="row" alignItems="center" spacing={1}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                        {t('previewLoading')}
                    </Typography>
                </Stack>
            )}

            {!loading && error && (
                <Typography variant="body2" color="error">
                    {error}
                </Typography>
            )}

            {!loading && !error && rows.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    {t('previewEmpty')}
                </Typography>
            )}

            {!loading && !error && rows.length > 0 && (
                <Stack spacing={2}>
                    <Stack spacing={0.75}>
                        {checks.map((item, idx) => {
                            const Icon = toneIcon[item.tone];
                            return (
                                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                                    <Icon sx={{ fontSize: 18, color: toneColor[item.tone], mt: '1px', flexShrink: 0 }} />
                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                        {item.text}
                                    </Typography>
                                </Stack>
                            );
                        })}
                    </Stack>

                    <Box sx={{ overflowX: 'auto', border: `1px solid ${FIORI.border}`, borderRadius: '8px' }}>
                        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8125rem' }}>
                            <Box component="thead" sx={{ bgcolor: FIORI.headerBg }}>
                                <Box component="tr">
                                    {headers.map((header, idx) => (
                                        <Box
                                            component="th"
                                            key={idx}
                                            sx={{
                                                textAlign: 'left',
                                                whiteSpace: 'nowrap',
                                                p: 1,
                                                fontWeight: 600,
                                                color: headerCodeByIndex[idx] === null && header.trim() !== '' ? FIORI.warning : FIORI.textPrimary,
                                                borderBottom: `1px solid ${FIORI.border}`,
                                            }}
                                        >
                                            {header || ' '}
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                            <Box component="tbody">
                                {dataRows.slice(0, PREVIEW_ROW_LIMIT).map((row, rIdx) => (
                                    <Box component="tr" key={rIdx}>
                                        {headers.map((_, cIdx) => (
                                            <Box
                                                component="td"
                                                key={cIdx}
                                                sx={{
                                                    whiteSpace: 'nowrap',
                                                    p: 1,
                                                    color: FIORI.textPrimary,
                                                    borderBottom: `1px solid ${FIORI.border}`,
                                                }}
                                            >
                                                {row[cIdx] ?? ''}
                                            </Box>
                                        ))}
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                        {t('previewRowsNote', { count: Math.min(dataRows.length, PREVIEW_ROW_LIMIT) })}
                    </Typography>
                </Stack>
            )}
        </Box>
    );
}
