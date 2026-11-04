import '@ui5/webcomponents-icons/dist/search.js';
import { ComboBox, ComboBoxItem, Icon, Label } from '@ui5/webcomponents-react';
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
            setQuery('');
            return;
        }
        setLoadingCurrent(true);
        fetch(`/catalog/marketplace-brands/${platform}/lookup?id=${value}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((opt: BrandOption | null) => {
                setSelected(opt);
                if (opt) setQuery(opt.name);
            })
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

    // รายการที่ให้ ComboBox แสดง — ต้องมีตัวที่เลือกไว้อยู่ด้วยเสมอ (แม้จะไม่อยู่ในผลค้นหา
    // ล่าสุด) ไม่งั้น UI5 จะหา item ที่ตรงกับ selectedValue ไม่เจอ
    const options = selected && !results.some((r) => r.id === selected.id) ? [selected, ...results] : results;
    const trimmed = query.trim();
    const showNoMatch = trimmed !== '' && !searching && results.length === 0 && trimmed !== selected?.name;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <Label showColon={false} style={{ fontWeight: 600 }}>
                {label}
            </Label>
            <ComboBox
                style={{ width: '100%' }}
                disabled={disabled}
                // ค้นหาฝั่ง server แล้ว (debounce 300ms ด้านบน) — ไม่ต้องให้ UI5 กรองซ้ำ
                filter="None"
                noTypeahead
                showClearIcon
                loading={searching || loadingCurrent}
                icon={<Icon name="search" />}
                placeholder={t('searchPlatformBrandPlaceholder', { platform: label })}
                value={query}
                selectedValue={selected ? String(selected.id) : undefined}
                onInput={(e) => {
                    const next = e.target.value ?? '';
                    setQuery(next);
                    // ช่องถูกล้าง (ปุ่ม clear หรือลบจนว่าง) = ล้าง override แบบเดียวกับปุ่ม × ของ MUI Autocomplete เดิม
                    if (next === '' && selected) {
                        setSelected(null);
                        onChange(null);
                    }
                }}
                onSelectionChange={(e) => {
                    const id = e.detail.item?.value;
                    if (!id) return;
                    const val = options.find((opt) => String(opt.id) === id) ?? null;
                    if (!val) return;
                    setSelected(val);
                    setQuery(val.name);
                    onChange(val.id);
                }}
                onChange={() => {
                    // blur/Enter โดยไม่ได้เลือก item — คืนข้อความในช่องเป็นชื่อของตัวที่เลือกไว้ (เหมือน MUI)
                    if (selected && query !== selected.name) setQuery(selected.name);
                }}
            >
                {options.map((opt) => (
                    <ComboBoxItem key={opt.id} text={opt.name} value={String(opt.id)} />
                ))}
            </ComboBox>
            {/* UI5 ComboBox ไม่มีข้อความ "no options" — แยกข้อความ "ยังไม่ได้พิมพ์" (placeholder) กับ "ค้นไม่เจอ" ให้ชัดเหมือนเดิม */}
            {showNoMatch && (
                <span style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>{t('noBrandMatching', { query })}</span>
            )}
        </div>
    );
}
