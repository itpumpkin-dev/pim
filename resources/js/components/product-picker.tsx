import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { BusyIndicator, Button, FlexBox, Icon, Input, SuggestionItem, Text } from '@ui5/webcomponents-react';
import '@ui5/webcomponents/dist/features/InputSuggestions.js';
import { useEffect, useState } from 'react';

export interface ProductOption {
    id: number;
    sku: string;
    name: string;
}

const optionLabel = (opt: ProductOption) => `${opt.sku} — ${opt.name}`;

/**
 * Search-by-SKU-or-name picker for the product edit page's Associations
 * panel (Related/Up-sell/Cross-sell), also reused for BOM's "raw materials"
 * component picker (catalog/bom/edit.tsx, via `extraParams={{
 * raw_material_only: '1' }}`) and the "add to raw materials" picker
 * (catalog/raw-materials/index.tsx). Debounced server search against
 * catalog.products.search, excluding whatever's already picked.
 */
export function ProductPicker({
    value,
    onChange,
    extraParams,
    placeholder,
}: {
    value: ProductOption[];
    onChange: (next: ProductOption[]) => void;
    /** extra query params appended to every search request, e.g. `{ raw_material_only: '1' }` */
    extraParams?: Record<string, string>;
    placeholder?: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query, ...extraParams });
            value.forEach((p) => params.append('exclude[]', String(p.id)));

            fetch(`/catalog/products/search?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : []))
                .then((data: ProductOption[]) => setResults(data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const addProduct = (product: ProductOption) => {
        onChange([...value, product]);
        setQuery('');
        setResults([]);
    };

    const removeProduct = (id: number) => {
        onChange(value.filter((p) => p.id !== id));
    };

    return (
        <FlexBox direction="Column" style={{ gap: '0.5rem' }}>
            {/* UI5 Input + suggestions: ผลค้นหามาจาก server แล้ว เลยไม่ให้ Input
                กรองซ้ำ (filter ค่าเริ่มต้นคือ "None") — เลือกรายการ (คลิก/Enter)
                แล้ว Input ยิง change พร้อม value = ข้อความของรายการนั้น จึงจับคู่กลับ
                ไปหาสินค้าด้วย label */}
            <Input
                style={{ width: '100%' }}
                showSuggestions
                value={query}
                placeholder={placeholder ?? 'ค้นหาด้วย SKU หรือชื่อสินค้า'}
                icon={loading ? <BusyIndicator active size="S" delay={0} /> : <Icon name="search" />}
                onInput={(e) => setQuery(e.target.value)}
                onChange={(e) => {
                    const picked = results.find((opt) => optionLabel(opt) === e.target.value);
                    if (picked) addProduct(picked);
                }}
            >
                {results.map((opt) => (
                    <SuggestionItem key={opt.id} text={optionLabel(opt)} />
                ))}
            </Input>
            <FlexBox direction="Column" style={{ gap: '0.25rem' }}>
                {value.map((product) => (
                    <FlexBox
                        key={product.id}
                        alignItems="Center"
                        justifyContent="SpaceBetween"
                        style={{
                            border: '1px solid var(--sapGroup_ContentBorderColor)',
                            borderRadius: 'var(--sapElement_BorderCornerRadius)',
                            padding: '0.375rem 0.75rem',
                            gap: '0.5rem',
                        }}
                    >
                        <Text>
                            {product.sku} — {product.name}
                        </Text>
                        <Button design="Transparent" icon="decline" tooltip="ลบ" accessibleName="ลบ" onClick={() => removeProduct(product.id)} />
                    </FlexBox>
                ))}
                {value.length === 0 && (
                    <Text style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_DisabledTextColor, var(--sapContent_LabelColor))' }}>
                        ยังไม่มีสินค้า
                    </Text>
                )}
            </FlexBox>
        </FlexBox>
    );
}
