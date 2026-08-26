import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

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
 * ต่างจาก Autocomplete แบบ debounce ทั่วไป ตรงที่การ fetch จะทำงานก็ต่อเมื่อ
 * dropdown ถูกเปิดอยู่จริงๆ (`open`/`onOpen`/`onClose` ด้านล่าง) ไม่ใช่ยิงตอน
 * mount — เพราะตารางนั้น render ตัวนี้หนึ่งตัวต่อหนึ่งแถวแบรนด์ (ปกติเป็น
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
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimBrandOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

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
    }, [query, open]);

    return (
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
            // ตั้งใจไม่ควบคุม `inputValue` เอง — component นี้จะ mount ค้างอยู่
            // ถาวร (หนึ่งตัวต่อหนึ่งแถวแบรนด์ แบบ select) ไม่ได้ unmount ทันที
            // หลังเลือกเหมือน category picker ตัวอื่น เลยต้องคงแสดง label ของ
            // `value` ไว้ตอนที่ปิดอยู่ ถ้าไปควบคุม `inputValue` ให้ผูกกับ
            // `query` จะทำให้ field ค้างอยู่กับค่าที่พิมพ์ล่าสุด (ว่างเปล่า
            // สำหรับแถวที่ยังไม่มีใครค้นหาเลย) แล้วโชว์เป็นช่องว่างแทนที่จะ
            // เป็นชื่อแบรนด์ที่ map ไว้ แค่ `onInputChange` อย่างเดียวก็พอแล้ว
            // สำหรับจับสิ่งที่ผู้ใช้พิมพ์ไปใช้กับการค้นหาแบบ debounce ด้านล่าง
            onInputChange={(_, val, reason) => {
                if (reason === 'input') setQuery(val);
            }}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
