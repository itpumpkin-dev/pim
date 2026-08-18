import {
    Box,
    CircularProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320, overflowX: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    {rows[0].map((cell, idx) => (
                                        <TableCell key={idx} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            {cell}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.slice(1).map((row, rIdx) => (
                                    <TableRow key={rIdx}>
                                        {row.map((cell, cIdx) => (
                                            <TableCell key={cIdx} sx={{ whiteSpace: 'nowrap' }}>
                                                {cell}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {t('previewRowsNote', { count: rows.length })}
                    </Typography>
                </>
            )}
        </Box>
    );
}
