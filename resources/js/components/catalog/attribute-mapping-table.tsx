import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CoverageStat, MappingCoverageSummary } from '@/components/catalog/mapping-coverage-summary';
import { MappingAttributeRow } from '@/hooks/use-attribute-mapping';
import { mappedChipSx, naChipSx, pendingRowSx, solidActionSx, UI_BORDER } from '@/lib/ui-style';

export interface AttributeMappingTableProps {
    helpTextKey: string;
    syncLabelKey: string;
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };

    search: string;
    onSearchChange: (value: string) => void;
    status: 'all' | 'mapped' | 'unmapped';
    onStatusChange: (value: 'all' | 'mapped' | 'unmapped') => void;

    filtered: MappingAttributeRow[];
    isMapped: (row: MappingAttributeRow) => boolean;
    hasPendingChange: (row: MappingAttributeRow) => boolean;
    /** Text under the status chip naming which kind of mapping it is ("Payload field" / "Shopee attribute" / ...) — null renders nothing (WooCommerce's non-payload content fields have no such distinction). */
    statusCaption: (row: MappingAttributeRow) => string | null;
    /** The platform-specific <Select> for this row's "Map to" cell — groups/prefix-encoding differ enough per platform (structured fields, content fields, custom-attribute list with its own disabled rules) that this stays a render prop rather than shared config. */
    renderMapToCell: (row: MappingAttributeRow) => ReactNode;
    sortOrderFor: (row: MappingAttributeRow) => number;
    onSortOrderChange: (row: MappingAttributeRow, value: number) => void;

    pendingCount: number;
    saving: boolean;
    onSave: () => void;
    syncing: boolean;
    onSync: () => void;
}

/**
 * Shared table shell for every "จับคู่เนื้อหา <Platform>" mapping panel —
 * search/status filter, the coverage summary, and the attribute table
 * itself. Each platform's own thin panel component supplies the "Map to"
 * Select (via `renderMapToCell`, since the dropdown's groups/prefix-encoding
 * genuinely differ per platform) and the save/sync wiring (via
 * `useAttributeMapping`).
 */
export function AttributeMappingTable({
    helpTextKey,
    syncLabelKey,
    coverage,
    search,
    onSearchChange,
    status,
    onStatusChange,
    filtered,
    isMapped,
    hasPendingChange,
    statusCaption,
    renderMapToCell,
    sortOrderFor,
    onSortOrderChange,
    pendingCount,
    saving,
    onSave,
    syncing,
    onSync,
}: AttributeMappingTableProps) {
    const { t } = useTranslation('catalog');

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2} sx={{ mb: 3 }}>
                <Typography color="text.secondary" sx={{ maxWidth: 840 }}>
                    {t(helpTextKey)}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                    <Button
                        variant="outlined"
                        disabled={syncing}
                        onClick={onSync}
                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
                    >
                        {t(syncLabelKey)}
                    </Button>

                    <Button
                        variant="contained"
                        disabled={pendingCount === 0 || saving}
                        onClick={onSave}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={solidActionSx}
                    >
                        {t('saveChanges')}{pendingCount > 0 ? ` (${pendingCount})` : ''}
                    </Button>
                </Stack>
            </Stack>

            <MappingCoverageSummary payloadFields={coverage.payloadFields} platformAttributes={coverage.platformAttributes} />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t('searchAttributes')}
                    size="small"
                    sx={{ minWidth: 320 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />

                <Select
                    value={status}
                    onChange={(e) => onStatusChange(e.target.value as 'all' | 'mapped' | 'unmapped')}
                    size="small"
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="all">{t('statusAll')}</MenuItem>
                    <MenuItem value="mapped">{t('statusMapped')}</MenuItem>
                    <MenuItem value="unmapped">{t('statusUnmapped')}</MenuItem>
                </Select>
            </Stack>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, borderColor: UI_BORDER }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('attributeColumn')}</TableCell>
                            <TableCell>{t('status')}</TableCell>
                            <TableCell>{t('mapToColumn')}</TableCell>
                            <TableCell align="right">{t('sortOrder')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtered.map((row) => {
                            const mapped = isMapped(row);
                            const caption = statusCaption(row);

                            return (
                                <TableRow key={row.id} sx={pendingRowSx(hasPendingChange(row))}>
                                    <TableCell sx={{ minWidth: 220 }}>
                                        <Typography fontWeight={600}>{row.label}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                            {row.code} · {row.type}
                                        </Typography>
                                    </TableCell>

                                    <TableCell>
                                        <Chip
                                            label={mapped ? t('statusMapped') : t('statusUnmapped')}
                                            size="small"
                                            sx={mapped ? mappedChipSx : naChipSx}
                                        />
                                        {mapped && caption && (
                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                                {caption}
                                            </Typography>
                                        )}
                                    </TableCell>

                                    <TableCell sx={{ minWidth: 260 }}>{renderMapToCell(row)}</TableCell>

                                    <TableCell align="right" sx={{ width: 110 }}>
                                        {mapped && (
                                            <TextField
                                                type="number"
                                                size="small"
                                                value={sortOrderFor(row)}
                                                onChange={(e) => onSortOrderChange(row, Number(e.target.value) || 0)}
                                                sx={{ width: 90 }}
                                                slotProps={{ htmlInput: { min: 0 } }}
                                            />
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}

                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">{t('noAttributesFound')}</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
