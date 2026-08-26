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
    /** แท็บของตลาดไหนอยู่ — ใช้ระบุว่าจะ export ชุดข้อมูลไหนใน `MarketplaceAttributeMappingController::export()` */
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
    /** ข้อความใต้ chip สถานะที่บอกว่าเป็น mapping แบบไหน ("Payload field" / "Shopee attribute" / ...) — ถ้าเป็น null จะไม่แสดงอะไรเลย (ฟิลด์ content ของ WooCommerce ที่ไม่ใช่ payload ไม่มีความต่างแบบนี้ให้บอก) */
    statusCaption: (row: MappingAttributeRow) => string | null;
    /** <Select> เฉพาะแต่ละแพลตฟอร์มสำหรับ cell "Map to" ของแถวนี้ — เพราะกลุ่ม/รูปแบบการเข้ารหัส prefix ต่างกันมากพอในแต่ละแพลตฟอร์ม (structured fields, content fields, ลิสต์ custom-attribute ที่มีกฎ disabled ของตัวเอง) เลยให้เป็น render prop แทนที่จะทำเป็น config กลาง */
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
 * เชลล์ตารางกลางที่ใช้ร่วมกันของทุกหน้า mapping panel แบบ "จับคู่เนื้อหา <Platform>"
 * — มีตัวกรอง search/status, สรุป coverage และตัวตารางแอตทริบิวต์เอง
 * ส่วน panel component บางๆ ของแต่ละแพลตฟอร์มจะเป็นคนส่ง Select "Map to"
 * เข้ามาเอง (ผ่าน `renderMapToCell` เพราะกลุ่ม/รูปแบบการเข้ารหัส prefix ของ
 * dropdown ต่างกันจริงๆ ในแต่ละแพลตฟอร์ม) และส่วน save/sync ก็ต่อเข้ามาเอง
 * (ผ่าน `useAttributeMapping`)
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

    // ลำดับความสำคัญของคอลัมน์ตอนจอเล็ก (SAP Fiori responsive table): คอลัมน์
    // ที่ใช้ระบุตัวตน กับ select "Map to" — ฟิลด์ที่กำลังแก้ไขจริงๆ ตรงนี้ — จะ
    // ยังคงแสดงอยู่แม้จอเล็กระดับมือถือ ส่วน Status กับ Sort order จะไหลไป
    // อยู่ในพื้นที่ label/value ใต้แต่ละแถวเมื่อพื้นที่ไม่พอ
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
        // ส่ง search/status ตรงๆ แบบนี้เพราะตัวกรองของแท็บนี้เป็น state ฝั่ง
        // client ล้วนๆ (ดู useAttributeMapping) ปกติจะไม่ถูกส่งไปเซิร์ฟเวอร์เลย
        // ส่วน locale ก็ด้วยเหตุผลเดียวกับ AttributeController::export() —
        // ดูคอมเมนต์ที่นั่น
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
