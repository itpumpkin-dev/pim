import { Box, CircularProgress, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';

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
                  priority: idx === 0 ? 'always' : idx === 1 ? 'high' : idx === 2 ? 'medium' : 'low',
                  render: (row: { key: number; cells: string[] }) => (
                      <span style={{ whiteSpace: 'nowrap' }}>{row.cells[idx]}</span>
                  ),
              }))
            : [];
    const previewRows = rows.slice(1).map((cells, idx) => ({ key: idx, cells }));

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                {t('filePreview')}
            </Typography>

            {loading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                        {t('previewLoading')}
                    </Typography>
                </Box>
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
                <>
                    <FioriResponsiveTable
                        size="small"
                        columns={previewColumns}
                        rows={previewRows}
                        getRowKey={(row) => row.key}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {t('previewRowsNote', { count: rows.length })}
                    </Typography>
                </>
            )}
        </Box>
    );
}
