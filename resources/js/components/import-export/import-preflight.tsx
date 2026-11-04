import '@ui5/webcomponents-icons/dist/message-warning.js';
import '@ui5/webcomponents-icons/dist/status-negative.js';
import '@ui5/webcomponents-icons/dist/status-positive.js';
import { BusyIndicator, Icon, Text, Title } from '@ui5/webcomponents-react';
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
        pass: 'var(--sapPositiveColor)',
        warn: 'var(--sapCriticalColor)',
        fail: 'var(--sapNegativeColor)',
    };
    const toneIcon: Record<CheckTone, string> = {
        pass: 'status-positive',
        warn: 'message-warning',
        fail: 'status-negative',
    };
    const secondary = { color: 'var(--sapContent_LabelColor)' };
    const border = '1px solid var(--sapList_BorderColor)';

    return (
        <div style={{ marginTop: '1rem' }}>
            <Title level="H6" size="H6" style={{ marginBottom: '0.5rem' }}>
                {t('preflightTitle')}
            </Title>

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BusyIndicator active delay={0} size="S" />
                    <Text style={secondary}>{t('previewLoading')}</Text>
                </div>
            )}

            {!loading && error && <Text style={{ color: 'var(--sapNegativeTextColor, var(--sapNegativeColor))' }}>{error}</Text>}

            {!loading && !error && rows.length === 0 && <Text style={secondary}>{t('previewEmpty')}</Text>}

            {!loading && !error && rows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {checks.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <Icon
                                    name={toneIcon[item.tone]}
                                    style={{ width: 18, height: 18, color: toneColor[item.tone], marginTop: 1, flexShrink: 0 }}
                                />
                                <Text>{item.text}</Text>
                            </div>
                        ))}
                    </div>

                    <div style={{ overflowX: 'auto', border, borderRadius: 'var(--sapElement_BorderCornerRadius)' }}>
                        <table
                            style={{
                                borderCollapse: 'collapse',
                                width: '100%',
                                fontSize: '0.8125rem',
                                fontFamily: 'var(--sapFontFamily)',
                                color: 'var(--sapTextColor)',
                            }}
                        >
                            <thead style={{ background: 'var(--sapList_HeaderBackground)' }}>
                                <tr>
                                    {headers.map((header, idx) => (
                                        <th
                                            key={idx}
                                            style={{
                                                textAlign: 'left',
                                                whiteSpace: 'nowrap',
                                                padding: '0.5rem',
                                                fontWeight: 600,
                                                color:
                                                    headerCodeByIndex[idx] === null && header.trim() !== ''
                                                        ? 'var(--sapCriticalTextColor, var(--sapCriticalColor))'
                                                        : 'var(--sapList_HeaderTextColor, var(--sapTextColor))',
                                                borderBottom: border,
                                            }}
                                        >
                                            {header || '\u00a0'}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody style={{ background: 'var(--sapList_Background)' }}>
                                {dataRows.slice(0, PREVIEW_ROW_LIMIT).map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {headers.map((_, cIdx) => (
                                            <td key={cIdx} style={{ whiteSpace: 'nowrap', padding: '0.5rem', borderBottom: border }}>
                                                {row[cIdx] ?? ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Text style={{ ...secondary, fontSize: 'var(--sapFontSmallSize)' }}>
                        {t('previewRowsNote', { count: Math.min(dataRows.length, PREVIEW_ROW_LIMIT) })}
                    </Text>
                </div>
            )}
        </div>
    );
}
