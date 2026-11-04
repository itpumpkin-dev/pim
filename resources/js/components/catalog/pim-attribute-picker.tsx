import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import {
    Bar,
    BusyIndicator,
    Button,
    Dialog,
    FlexBox,
    Icon,
    Input,
    List,
    ListItemStandard,
    SegmentedButton,
    SegmentedButtonItem,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';

import { AsyncSearchComboBox } from '@/components/catalog/async-search-combo-box';

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

/** ป้ายบอกที่มาของ attribute (ท้ายแถวในหน้าต่างรายการทั้งหมด) — สร้างเองในระบบ
 * PIM ตามปกติ ("PIM", ไม่มีสี) หรือถูกสร้างอัตโนมัติตอนกด "สร้าง/อัปเดต
 * Attribute Family" ของแพลตฟอร์มไหน (สีตามแพลตฟอร์มนั้น) */
const PLATFORM_CHIP: Record<'shopee' | 'lazada' | 'tiktok', { label: string; state: 'Information' | 'Critical' | 'Positive' }> = {
    shopee: { label: 'Shopee', state: 'Information' },
    lazada: { label: 'Lazada', state: 'Critical' },
    tiktok: { label: 'TikTok', state: 'Positive' },
};

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'pim', label: 'PIM' },
    { value: 'shopee', label: 'Shopee' },
    { value: 'lazada', label: 'Lazada' },
    { value: 'tiktok', label: 'TikTok' },
];

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
            const matchesSearch = needle === '' || attr.name.toLowerCase().includes(needle) || attr.code.toLowerCase().includes(needle);
            const matchesSource = source === 'all' || (source === 'pim' ? !attr.auto_created_platform : attr.auto_created_platform === source);

            return matchesSearch && matchesSource;
        });
    }, [attributes, search, source]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            style={{ width: '37.5rem', maxWidth: '100%', height: '80vh' }}
            header={
                <Bar
                    startContent={<Title level="H5">Attributes ทั้งหมด</Title>}
                    endContent={<Button design="Transparent" icon="decline" tooltip="Close" accessibleName="Close" onClick={onClose} />}
                />
            }
        >
            <FlexBox direction="Column" style={{ height: '100%', margin: '-1rem' }}>
                <FlexBox direction="Column" style={{ gap: '0.75rem', padding: '1rem' }}>
                    <Input
                        placeholder="ค้นหาด้วยชื่อหรือโค้ด..."
                        value={search}
                        onInput={(e) => setSearch(e.target.value)}
                        icon={<Icon name="search" />}
                        style={{ width: '100%' }}
                    />
                    <SegmentedButton
                        style={{ flexWrap: 'wrap' }}
                        onSelectionChange={(e) => {
                            const val = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as SourceFilter | undefined;
                            if (val) setSource(val);
                        }}
                    >
                        {SOURCE_FILTERS.map((opt) => (
                            <SegmentedButtonItem key={opt.value} data-value={opt.value} selected={source === opt.value}>
                                {opt.label}
                            </SegmentedButtonItem>
                        ))}
                    </SegmentedButton>
                </FlexBox>

                <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }}>
                    {loading ? (
                        <FlexBox alignItems="Center" justifyContent="Center" style={{ height: '100%' }}>
                            <BusyIndicator active size="M" />
                        </FlexBox>
                    ) : filtered.length === 0 ? (
                        <Text style={{ display: 'block', textAlign: 'center', padding: '2rem 0', color: 'var(--sapContent_LabelColor)' }}>
                            ไม่พบ attribute ที่ตรงกับตัวกรอง
                        </Text>
                    ) : (
                        <List>
                            {filtered.map((attr) => {
                                const meta = attr.auto_created_platform ? PLATFORM_CHIP[attr.auto_created_platform] : null;

                                return (
                                    <ListItemStandard
                                        key={attr.id}
                                        text={attr.name}
                                        description={`${attr.code} · ${attr.type}`}
                                        additionalText={attr.auto_created_platform === undefined ? undefined : meta ? meta.label : 'PIM'}
                                        additionalTextState={meta ? meta.state : 'None'}
                                        onClick={() => {
                                            onSelect(attr);
                                            onClose();
                                        }}
                                    />
                                );
                            })}
                        </List>
                    )}
                </div>
            </FlexBox>
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
        <div>
            <AsyncSearchComboBox
                value={value}
                onChange={onChange}
                results={results}
                loading={loading}
                getKey={(opt) => opt.id}
                getLabel={(opt) => opt.name}
                onQueryChange={setQuery}
                onActivate={() => setOpen(true)}
                placeholder={placeholder}
                disabled={disabled}
            />
            <Button
                design="Transparent"
                disabled={disabled}
                onClick={() => setBrowserOpen(true)}
                style={{ marginTop: '0.125rem', fontSize: 'var(--sapFontSmallSize)' }}
            >
                ดู attributes ทั้งหมด
            </Button>
            <PimAttributeBrowserDialog open={browserOpen} onClose={() => setBrowserOpen(false)} onSelect={onChange} typeFilter={typeFilter} />
        </div>
    );
}
