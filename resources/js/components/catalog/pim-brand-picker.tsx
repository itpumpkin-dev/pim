import { useEffect, useState } from 'react';

import { AsyncSearchComboBox } from '@/components/catalog/async-search-combo-box';

export interface PimBrandOption {
    id: number;
    name: string;
}

/**
 * ตัว picker ค้นหาด้วยชื่อ บน options ของแอตทริบิวต์ `pbrand` ของ PIM เอง (ดู
 * BrandController::searchPimBrands) — เป็นภาพสะท้อนกลับด้านของ
 * ShopeeBrandPicker ตัวเก่า (ที่ค้นหาแบรนด์จาก cache ของ Shopee ด้วยชื่อ)
 * ใช้รองรับคอลัมน์ "เลือกแบรนด์ PIM ให้แบรนด์ Shopee ตัวนี้" บนตาราง Shopee
 * Brands ที่ categories/shopee-mapping.tsx ซึ่งการ mapping ที่นี่เริ่มจากแถว
 * แบรนด์ของ Shopee (ตามหมวดหมู่ที่เลือกไว้ด้านบน) ไม่ใช่เริ่มจากลิสต์แบรนด์
 * PIM ทั้งหมด
 *
 * ต่างจาก picker แบบ debounce ทั่วไป ตรงที่การ fetch จะเริ่มทำงานก็ต่อเมื่อ
 * ผู้ใช้แตะช่องนี้จริงๆ แล้ว (`active` / `onActivate` ด้านล่าง — ตอน focus
 * ครั้งแรก) ไม่ใช่ยิงตอน mount — เพราะตารางนั้น render ตัวนี้หนึ่งตัวต่อหนึ่งแถวแบรนด์ (ปกติเป็น
 * สิบๆ ตัวพร้อมกัน มองเห็นทุกตัวพร้อมกันแบบ select) ถ้ายิง fetch ตอน mount
 * แบบไม่มีเงื่อนไข จะยิง request query ว่างพร้อมกันเยอะขนาดนั้นทันทีที่
 * แบรนด์ของหมวดหมู่โหลดเสร็จ ทั้งที่ผู้ใช้ยังไม่ได้แตะตัวไหนเลย
 */
export function PimBrandPicker({
    value,
    onChange,
    placeholder,
    disabled,
}: {
    value: PimBrandOption | null;
    onChange: (next: PimBrandOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [active, setActive] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimBrandOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!active) return;

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/brands/search-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: PimBrandOption[] }) => setResults(body.data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, active]);

    // ตั้งใจให้ AsyncSearchComboBox ถือข้อความในช่องเอง (ไม่ผูกกับ `query`) —
    // component นี้ mount ค้างอยู่ถาวร (หนึ่งตัวต่อหนึ่งแถวแบรนด์) เลยต้องคงแสดง
    // label ของ `value` ไว้ตอนที่ไม่ได้พิมพ์อยู่ ส่วน `query` ใช้แค่กับการค้นหา
    // แบบ debounce ด้านบนเท่านั้น
    return (
        <AsyncSearchComboBox
            value={value}
            onChange={onChange}
            results={results}
            loading={loading}
            getKey={(opt) => opt.id}
            getLabel={(opt) => opt.name}
            onQueryChange={setQuery}
            onActivate={() => setActive(true)}
            placeholder={placeholder}
            disabled={disabled}
        />
    );
}
