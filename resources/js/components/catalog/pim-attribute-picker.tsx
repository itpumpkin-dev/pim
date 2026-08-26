import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface PimAttributeOption {
    id: number;
    name: string;
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
 * พร้อมกันได้เหมือนกัน
 */
export function PimAttributePicker({
    value,
    onChange,
    placeholder,
    disabled,
}: {
    value: PimAttributeOption | null;
    onChange: (next: PimAttributeOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimAttributeOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/attributes/search-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: PimAttributeOption[] }) => setResults(body.data))
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
            onInputChange={(_, val, reason) => {
                if (reason === 'input') setQuery(val);
            }}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
