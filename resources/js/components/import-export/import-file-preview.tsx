import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { BusyIndicator, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

const PREVIEW_ROW_LIMIT = 10;

interface Props {
    file: File | null;
    fileFormat: string;
    fieldSeparator: string;
}

export default function ImportFilePreview({ file, fileFormat, fieldSeparator }: Props) {
    const { t } = useTranslation('import_export');
    const [rows, setRows] = useState<string[][]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setRows([]);
            setError(null);
            setLoading(false);
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
                const parsedRows = data
                    .slice(0, PREVIEW_ROW_LIMIT)
                    .map((row) => row.map((cell) => (cell === undefined || cell === null ? '' : String(cell))));

                if (!cancelled) {
                    setRows(parsedRows);
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

    if (!file) {
        return null;
    }

    // Column pop-in priority (SAP Fiori responsive table): the source file's
    // columns aren't known ahead of time (they come straight from whatever
    // headers the uploaded file has), so priority falls out of column order —
    // the same convention as the server-driven grid in attributes/index.tsx.
    const previewColumns: FioriResponsiveColumn<{ key: number; cells: string[] }>[] =
        rows.length > 0
            ? rows[0].map((header, idx) => ({
                  key: String(idx),
                  header: <span style={{ whiteSpace: 'nowrap' }}>{header}</span>,
                  popinText: header,
                  priority: idx === 0 ? 'always' : idx === 1 ? 'high' : idx === 2 ? 'medium' : 'low',
                  render: (row: { key: number; cells: string[] }) => <span style={{ whiteSpace: 'nowrap' }}>{row.cells[idx]}</span>,
              }))
            : [];
    const previewRows = rows.slice(1).map((cells, idx) => ({ key: idx, cells }));

    const secondary = { color: 'var(--sapContent_LabelColor)' };

    return (
        <div style={{ marginTop: '1rem' }}>
            <Title level="H6" size="H6" style={{ marginBottom: '0.5rem' }}>
                {t('filePreview')}
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
                <>
                    <FioriResponsiveTable size="small" columns={previewColumns} rows={previewRows} getRowKey={(row) => row.key} />
                    <Text style={{ ...secondary, display: 'block', marginTop: '0.25rem', fontSize: 'var(--sapFontSmallSize)' }}>
                        {t('previewRowsNote', { count: rows.length })}
                    </Text>
                </>
            )}
        </div>
    );
}
