import { FIORI } from '@/lib/fiori-style';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    List,
    ListItemButton,
    ListItemText,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

export interface PimAttributeOption {
    id: number;
    name: string;
    /** null = สร้างเองในระบบ PIM ตามปกติ — ไม่ null = สร้างอัตโนมัติตอนกด
     * "สร้าง/อัปเดต Attribute Family" ของแพลตฟอร์มนั้น (ดู
     * {Platform}MappedAttributeCreator::findOrCreateAttribute()) — ใช้โชว์
     * chip บอกที่มาในดรอปดาวน์ด้านล่าง ไม่มีค่า (undefined) เมื่อ endpoint ที่
     * เรียกยังไม่ได้ส่งฟิลด์นี้มา (เช่น response เก่าที่แคชไว้) ให้ถือว่าไม่รู้
     * ที่มา ไม่โชว์ chip เลยดีกว่าโชว์ผิด */
    auto_created_platform?: 'shopee' | 'lazada' | 'tiktok' | null;
}

/** แถวจาก listAllPimAttributes() — มี code/type เพิ่มมาจาก PimAttributeOption
 * เฉยๆ เพราะหน้าต่าง "ดู attributes ทั้งหมด" มีที่ว่างพอจะโชว์รายละเอียด
 * มากกว่าดรอปดาวน์ค้นหาแบบย่อ */
interface PimAttributeRow extends PimAttributeOption {
    code: string;
    type: string;
}

type SourceFilter = 'all' | 'pim' | 'shopee' | 'lazada' | 'tiktok';

const PLATFORM_CHIP: Record<'shopee' | 'lazada' | 'tiktok', { label: string; color: string; bg: string }> = {
    shopee: { label: 'Shopee', color: FIORI.brand, bg: FIORI.brandBg },
    lazada: { label: 'Lazada', color: FIORI.warning, bg: FIORI.warningBg },
    tiktok: { label: 'TikTok', color: FIORI.success, bg: FIORI.successBg },
};

/** chip เล็กๆ ท้ายตัวเลือกในดรอปดาวน์/หน้าต่างรายการทั้งหมด บอกว่า attribute
 * ตัวนี้มาจากไหน — สร้างเองในระบบ PIM ตามปกติ (เทา, "PIM") หรือถูกสร้าง
 * อัตโนมัติตอนกด "สร้าง/อัปเดต Attribute Family" ของแพลตฟอร์มไหน (สีตาม
 * แพลตฟอร์มนั้น) */
function AttributeSourceChip({ platform }: { platform: PimAttributeOption['auto_created_platform'] }) {
    if (platform === undefined) return null;

    const meta = platform ? PLATFORM_CHIP[platform] : null;

    return (
        <Chip
            label={meta ? meta.label : 'PIM'}
            size="small"
            sx={{
                height: 18,
                fontSize: '0.65rem',
                fontWeight: 700,
                flexShrink: 0,
                bgcolor: meta ? meta.bg : FIORI.neutralBg,
                color: meta ? meta.color : FIORI.textSecondary,
            }}
        />
    );
}

/**
 * หน้าต่าง "ดู attributes ทั้งหมด" — ทางเลือกแทนการค้นหาทีละคำใน Autocomplete
 * ด้านล่าง สำหรับตอนที่ผู้ใช้อยากไล่ดู/กรองทั้งรายการเพื่อหา attribute ที่
 * เหมาะสม (เช่น กรองดูเฉพาะที่ระบบสร้างอัตโนมัติให้ Shopee ไว้ก่อนหน้านี้)
 * โหลดทั้งหมดครั้งเดียวตอนเปิด (จำนวน attribute ทั้งระบบหลักร้อยเท่านั้น —
 * ดู ShopeeAttributeMappingController::listAllPimAttributes()'s docblock)
 * แล้วกรองด้วยคำค้นหา/แหล่งที่มาแบบ client-side ทั้งหมด ไม่ยิง request ซ้ำ
 */
function PimAttributeBrowserDialog({
    open,
    onClose,
    onSelect,
    typeFilter,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (attr: PimAttributeOption) => void;
    typeFilter?: string[];
}) {
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState<PimAttributeRow[]>([]);
    const [search, setSearch] = useState('');
    const [source, setSource] = useState<SourceFilter>('all');

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const params = new URLSearchParams();
        if (typeFilter && typeFilter.length > 0) {
            params.set('type', typeFilter.join(','));
        }

        fetch(`/catalog/attributes/list-all-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: PimAttributeRow[] }) => setAttributes(body.data))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, typeFilter?.join(',')]);

    // เคลียร์ตัวกรองทุกครั้งที่ปิด ไม่งั้นเปิดใหม่รอบหน้าจะเห็นตัวกรองเดิมค้าง
    // อยู่โดยไม่ได้ตั้งใจ
    useEffect(() => {
        if (!open) {
            setSearch('');
            setSource('all');
        }
    }, [open]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return attributes.filter((attr) => {
            const matchesSearch =
                needle === '' || attr.name.toLowerCase().includes(needle) || attr.code.toLowerCase().includes(needle);
            const matchesSource =
                source === 'all' ||
                (source === 'pim' ? !attr.auto_created_platform : attr.auto_created_platform === source);

            return matchesSearch && matchesSource;
        });
    }, [attributes, search, source]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { height: '80vh' } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Attributes ทั้งหมด
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0 }}>
                <Stack spacing={1.5} sx={{ p: 2 }}>
                    <TextField
                        size="small"
                        autoFocus
                        placeholder="ค้นหาด้วยชื่อหรือโค้ด..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={source}
                        onChange={(_, val: SourceFilter | null) => val && setSource(val)}
                        sx={{ flexWrap: 'wrap' }}
                    >
                        <ToggleButton value="all">ทั้งหมด</ToggleButton>
                        <ToggleButton value="pim">PIM</ToggleButton>
                        <ToggleButton value="shopee">Shopee</ToggleButton>
                        <ToggleButton value="lazada">Lazada</ToggleButton>
                        <ToggleButton value="tiktok">TikTok</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>

                <Box sx={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${FIORI.border}` }}>
                    {loading ? (
                        <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                            <CircularProgress size={28} />
                        </Stack>
                    ) : filtered.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                            ไม่พบ attribute ที่ตรงกับตัวกรอง
                        </Typography>
                    ) : (
                        <List disablePadding>
                            {filtered.map((attr) => (
                                <ListItemButton
                                    key={attr.id}
                                    onClick={() => {
                                        onSelect(attr);
                                        onClose();
                                    }}
                                    sx={{ py: 1 }}
                                >
                                    <ListItemText
                                        primary={attr.name}
                                        secondary={`${attr.code} · ${attr.type}`}
                                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                                        secondaryTypographyProps={{ variant: 'caption' }}
                                    />
                                    <AttributeSourceChip platform={attr.auto_created_platform} />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </Box>
            </DialogContent>
        </Dialog>
    );
}

/**
 * ตัว picker ค้นหาด้วยชื่อ บนแอตทริบิวต์ของ PIM (ดู
 * ShopeeAttributeMappingController::searchPimAttributes) — เป็นเวอร์ชัน
 * attribute ของ PimBrandPicker ใช้รองรับคอลัมน์ "เลือกแอตทริบิวต์ PIM ให้
 * แอตทริบิวต์ Shopee ตัวนี้" บนตาราง Shopee Attributes ที่
 * categories/shopee-mapping.tsx ซึ่งจะแสดงเฉพาะแถวที่เป็น FREE_TEXT_FILED
 * เท่านั้น (ดู column definition ของตารางนั้น) เพราะ
 * ShopeeAttributeMappingController::update() จะปฏิเสธ input_type แบบอื่น
 * ทั้งหมด
 *
 * ใช้วิธี fetch แบบมีเงื่อนไขต้องเปิด dropdown ก่อนเหมือนกับ PimBrandPicker
 * ด้วยเหตุผลเดียวกัน คือตารางนี้ก็ render ตัวนี้หนึ่งตัวต่อหนึ่งแถวแอตทริบิวต์
 * พร้อมกันได้เหมือนกัน — ปุ่ม "ดู attributes ทั้งหมด" ด้านล่างเปิด
 * <PimAttributeBrowserDialog> เป็นทางเลือกสำหรับตอนที่อยากไล่ดู/กรองทั้ง
 * รายการแทนการพิมพ์ค้นหาทีละคำ
 */
export function PimAttributePicker({
    value,
    onChange,
    placeholder,
    disabled,
    typeFilter,
}: {
    value: PimAttributeOption | null;
    onChange: (next: PimAttributeOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
    // จำกัดผลค้นหาให้เหลือแค่ PIM attribute type ที่ระบุ (เช่น ['image','file']
    // สำหรับ Lazada `img`-type attribute — ดู LazadaAttributeMappingController's
    // update() ที่บังคับเงื่อนไขเดียวกันฝั่ง backend) ไม่ระบุ = ค้นหาได้ทุก type เหมือนเดิม
    typeFilter?: string[];
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimAttributeOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [browserOpen, setBrowserOpen] = useState(false);

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });
            if (typeFilter && typeFilter.length > 0) {
                params.set('type', typeFilter.join(','));
            }

            fetch(`/catalog/attributes/search-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: PimAttributeOption[] }) => setResults(body.data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, open, typeFilter?.join(',')]);

    return (
        <Box>
            <Autocomplete
                size="small"
                disabled={disabled}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                options={results}
                loading={loading}
                filterOptions={(options) => options}
                getOptionLabel={(opt) => opt.name}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                value={value}
                onChange={(_, val) => onChange(val)}
                onInputChange={(_, val, reason) => {
                    if (reason === 'input') setQuery(val);
                }}
                renderOption={(props, option) => (
                    <Stack
                        component="li"
                        {...props}
                        key={option.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                    >
                        <Typography variant="body2" noWrap>
                            {option.name}
                        </Typography>
                        <AttributeSourceChip platform={option.auto_created_platform} />
                    </Stack>
                )}
                renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
            />
            <Button
                size="small"
                disabled={disabled}
                onClick={() => setBrowserOpen(true)}
                sx={{ mt: 0.25, p: 0, minWidth: 0, textTransform: 'none', fontSize: '0.75rem', fontWeight: 600 }}
            >
                ดู attributes ทั้งหมด
            </Button>
            <PimAttributeBrowserDialog
                open={browserOpen}
                onClose={() => setBrowserOpen(false)}
                onSelect={onChange}
                typeFilter={typeFilter}
            />
        </Box>
    );
}
