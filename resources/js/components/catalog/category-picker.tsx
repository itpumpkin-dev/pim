import { ComboBox, ComboBoxItem } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';

export interface CategoryOption {
    id: number;
    name: string;
    path: string;
}

/**
 * ตัวค้นหา category ของ PIM เองจากชื่อ (ดูที่ CategoryController::searchCategories)
 * — เป็นด้านตรงข้ามของ ShopeeCategoryPicker ที่ค้นหาจาก tree ของ Shopee แทน
 * ใช้รองรับ action "กำหนด PIM category ให้กับ node ของ Shopee นี้" ในหน้า
 * categories/shopee-mapping.tsx ซึ่งตอนนี้การ map จะเริ่มจากแถวของ Shopee ก่อน
 * แล้วถามว่า "อันนี้ตรงกับ category ไหนของเรา" ไม่ใช่กลับกันแบบเดิม
 *
 * UI5 ComboBox ใช้ `filter="None"` เพราะการกรองทำที่ฝั่ง server แล้ว (ผลลัพธ์
 * ที่ได้มาคือรายการที่ตรงกับ query อยู่แล้ว) — path แสดงเป็น additionalText
 */
export function CategoryPicker({
    value,
    onChange,
    placeholder,
}: {
    value: CategoryOption | null;
    onChange: (next: CategoryOption | null) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState(value?.name ?? '');
    const [results, setResults] = useState<CategoryOption[]>([]);
    const [loading, setLoading] = useState(false);

    // ค่าที่เลือกถูกเปลี่ยนจากข้างนอก (เช่น reset หลังบันทึก) → sync ข้อความในช่องตาม
    useEffect(() => {
        setQuery(value?.name ?? '');
    }, [value?.id, value?.name]);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/categories/search?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: CategoryOption[] }) => setResults(body.data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    // keep the selected option in the item list so the ComboBox can show it as selected
    const items = value && !results.some((r) => r.id === value.id) ? [value, ...results] : results;

    return (
        <ComboBox
            style={{ width: '100%' }}
            filter="None"
            loading={loading}
            placeholder={placeholder}
            value={query}
            selectedValue={value ? String(value.id) : undefined}
            showClearIcon
            onInput={(e) => {
                const next = e.target.value ?? '';
                setQuery(next);
                if (next === '' && value) onChange(null);
            }}
            onSelectionChange={(e) => {
                const item = e.detail.item;
                if (!item) {
                    onChange(null);
                    return;
                }
                const option = items.find((o) => String(o.id) === item.value) ?? null;
                onChange(option);
                if (option) setQuery(option.name);
            }}
        >
            {items.map((option) => (
                <ComboBoxItem key={option.id} value={String(option.id)} text={option.name} additionalText={option.path} />
            ))}
        </ComboBox>
    );
}
