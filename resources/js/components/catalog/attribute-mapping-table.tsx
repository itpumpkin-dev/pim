import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    InputAdornment,
    Menu,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CoverageStat, MappingCoverageSummary } from '@/components/catalog/mapping-coverage-summary';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { useLocale } from '@/hooks/use-locale';
import { MappingAttributeRow } from '@/hooks/use-attribute-mapping';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx, fioriSearchFieldSx } from '@/lib/fiori-style';
import { encodeQueryParams } from '@/lib/query-string';
import { mappedChipSx, naChipSx, pendingRowSx } from '@/lib/ui-style';

export interface AttributeMappingTableProps {
    /** Which marketplace tab this is — identifies the dataset to `MarketplaceAttributeMappingController::export()`. */
    platform: 'woocommerce' | 'shopee' | 'lazada' | 'tiktok';
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
    platform,
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
    const { locale } = useLocale();
    const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);

    // Column pop-in priority (SAP Fiori responsive table): the identifying
    // column and the "Map to" select — the field actually being edited here
    // — stay visible down to phone width; Status and Sort order reflow into
    // the label/value pop-in area beneath each row as space runs out.
    const columns: FioriResponsiveColumn<MappingAttributeRow>[] = [
        {
            key: 'attribute',
            header: t('attributeColumn'),
            priority: 'always',
            minWidth: 220,
            render: (row) => (
                <>
                    <Typography fontWeight={600}>{row.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {row.code} · {row.type}
                    </Typography>
                </>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'medium',
            render: (row) => {
                const mapped = isMapped(row);
                const caption = statusCaption(row);
                return (
                    <>
                        <Chip label={mapped ? t('statusMapped') : t('statusUnmapped')} size="small" sx={mapped ? mappedChipSx : naChipSx} />
                        {mapped && caption && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                {caption}
                            </Typography>
                        )}
                    </>
                );
            },
        },
        {
            key: 'mapTo',
            header: t('mapToColumn'),
            priority: 'high',
            minWidth: 260,
            render: (row) => renderMapToCell(row),
        },
        {
            key: 'sortOrder',
            header: t('sortOrder'),
            priority: 'low',
            align: 'right',
            width: 110,
            render: (row) =>
                isMapped(row) ? (
                    <TextField
                        type="number"
                        size="small"
                        value={sortOrderFor(row)}
                        onChange={(e) => onSortOrderChange(row, Number(e.target.value) || 0)}
                        sx={{ width: 90 }}
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                ) : null,
        },
    ];

    const handleExport = (format: 'csv' | 'xlsx') => {
        // search/status are passed explicitly since this tab's filter is
        // client-only state (see useAttributeMapping), never round-tripped
        // to the server otherwise; locale for the same reason as
        // AttributeController::export() — see its comment.
        const params = encodeQueryParams({ platform, format, search, status, locale });
        window.location.href = `/catalog/attributes/marketplace-mapping/export?${params.join('&')}`;
        setExportAnchor(null);
    };

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2} sx={{ mb: 3 }}>
                <Typography sx={{ color: FIORI.textSecondary, maxWidth: 840 }}>
                    {t(helpTextKey)}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        endIcon={<ArrowDropDownIcon />}
                        onClick={(e) => setExportAnchor(e.currentTarget)}
                        sx={fioriDefaultSx}
                    >
                        {t('quickExport')}
                    </Button>
                    <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
                        <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
                        <MenuItem onClick={() => handleExport('xlsx')}>XLSX</MenuItem>
                    </Menu>

                    <Button
                        variant="outlined"
                        disabled={syncing}
                        onClick={onSync}
                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
                        sx={fioriDefaultSx}
                    >
                        {t(syncLabelKey)}
                    </Button>

                    <Button
                        variant="contained"
                        disabled={pendingCount === 0 || saving}
                        onClick={onSave}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={fioriEmphasizedSx}
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
                    sx={{ ...fioriSearchFieldSx, minWidth: 320 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                            </InputAdornment>
                        ),
                    }}
                />

                <Select
                    value={status}
                    onChange={(e) => onStatusChange(e.target.value as 'all' | 'mapped' | 'unmapped')}
                    size="small"
                    sx={{
                        minWidth: 160,
                        bgcolor: FIORI.surface,
                        borderRadius: '8px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: FIORI.border },
                    }}
                >
                    <MenuItem value="all">{t('statusAll')}</MenuItem>
                    <MenuItem value="mapped">{t('statusMapped')}</MenuItem>
                    <MenuItem value="unmapped">{t('statusUnmapped')}</MenuItem>
                </Select>
            </Stack>

            <FioriResponsiveTable
                columns={columns}
                rows={filtered}
                getRowKey={(row) => row.id}
                rowSx={(row) => pendingRowSx(hasPendingChange(row))}
                emptyMessage={t('noAttributesFound')}
            />
        </Box>
    );
}
