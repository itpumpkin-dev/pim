import { FIORI, fioriSearchFieldSx } from '@/lib/fiori-style';
import { Autocomplete, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketplacePlatform } from './marketplace-category-picker';

interface BrandOption {
    id: number;
    name: string;
}

/**
 * Per-product override picker for a single marketplace's brand — same
 * override/onChange contract as MarketplaceCategoryPicker, but a plain
 * debounced-search Autocomplete instead of a multi-column dialog: unlike
 * categories, marketplace brand lists are flat (Lazada alone has 153,600
 * rows, see BrandController::MARKETPLACE_BRAND_MODELS's docblock) with no
 * hierarchy to drill through, so this mirrors the simpler existing
 * LazadaCategoryPicker/PimBrandPicker search pattern instead.
 *
 * `value`/`onChange` carry a marketplace-brand id (or null to clear the
 * override) — see Shopee/Lazada/TikTok/WooCommerceProductSyncService::
 * resolve*BrandId(), which prefer this per-product value over the shared,
 * brand-option-level default (this product's `pbrand` value's mapping) when
 * set.
 *
 * `shopeeCategoryId` (Shopee only) scopes the search to that Shopee
 * category's own brand list — best-effort using whatever this product's own
 * Shopee category override currently is, not a full resolution of the
 * product's *effective* Shopee category (which could instead come from its
 * PIM category's mapping when no override is set) — good enough to narrow
 * results in the common case without adding that cross-panel lookup.
 */
export function MarketplaceBrandPicker({
    platform,
    label,
    value,
    onChange,
    disabled,
    shopeeCategoryId,
}: {
    platform: MarketplacePlatform;
    label: string;
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
    shopeeCategoryId?: number | null;
}) {
    const { t } = useTranslation('catalog');
    const [selected, setSelected] = useState<BrandOption | null>(null);
    const [loadingCurrent, setLoadingCurrent] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<BrandOption[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!value) {
            setSelected(null);
            return;
        }
        setLoadingCurrent(true);
        fetch(`/catalog/marketplace-brands/${platform}/lookup?id=${value}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then(setSelected)
            .finally(() => setLoadingCurrent(false));
    }, [platform, value]);

    useEffect(() => {
        const q = query.trim();
        if (q === '') {
            setResults([]);
            return;
        }
        setSearching(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q });
            if (platform === 'shopee' && shopeeCategoryId) {
                params.set('category_id', String(shopeeCategoryId));
            }
            fetch(`/catalog/marketplace-brands/${platform}/search?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : []))
                .then(setResults)
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(timer);
    }, [platform, query, shopeeCategoryId]);

    return (
        <Stack spacing={0.5}>
            <Typography variant="caption" fontWeight={600} color="#334155">
                {label}
            </Typography>
            <Autocomplete
                size="small"
                disabled={disabled}
                options={results}
                loading={searching || loadingCurrent}
                filterOptions={(options) => options}
                getOptionLabel={(opt) => opt.name}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                value={selected}
                onChange={(_, val) => {
                    setSelected(val);
                    onChange(val ? val.id : null);
                }}
                inputValue={query}
                onInputChange={(_, val) => setQuery(val)}
                // MUI เปิด dropdown ทันทีที่ช่อง focus (ก่อนพิมพ์อะไรเลยด้วยซ้ำ) —
                // ไม่ได้แปลว่า request พังหรือหาไม่เจอ แค่ยังไม่เริ่มค้นหาเพราะ
                // ยังไม่มีตัวอักษรให้ค้น (ดู useEffect ด้านบน: query ว่าง = ไม่ยิง
                // request เลย เหตุผลเดียวกับที่ categorySearchPlaceholder ใช้ —
                // ชุดข้อมูลนี้ใหญ่เกินจะโหลดมาแสดงทั้งหมดไว้ก่อน) ข้อความ default
                // ของ MUI ตรงนี้คือ "No options" เฉยๆ ซึ่งดูเหมือนพังไปเลย เลย
                // ต้องแยกข้อความสองแบบนี้ออกจากกันชัดเจน
                noOptionsText={query.trim() === '' ? t('categorySearchPlaceholder') : t('noBrandMatching', { query })}
                renderInput={(params) => (
                    <TextField {...params} placeholder={t('searchPlatformBrandPlaceholder', { platform: label })} sx={fioriSearchFieldSx} />
                )}
                sx={{ '& .MuiOutlinedInput-root': { borderColor: FIORI.border } }}
            />
        </Stack>
    );
}
