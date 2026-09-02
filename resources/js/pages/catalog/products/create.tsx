import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FioriField,
    FioriFormErrorSummary,
    FioriFormGroup,
    fioriFieldStateSx,
    fioriMultiInputSx,
    valueStateOf,
} from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { mappedChipSx, solidActionSx, UI_BORDER, UI_BORDER_STRONG } from '@/lib/ui-style';
import { type BreadcrumbItem } from '@/types';
import { type FormDataConvertible } from '@inertiajs/core';
import { Head, Link, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SaveIcon from '@mui/icons-material/Save';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    options?: AttributeOption[];
    family_ids?: number[];
}

/** แอตทริบิวต์ "Product Type" (producttype) — options mirror มาจาก master
 * product_types (ดู ProductController::productTypeAttributeFor()) คนละตัวกับ
 * data.type ด้านล่าง (Simple/Configurable) ที่ชื่อชนกันโดยบังเอิญ */
interface ProductTypeAttribute {
    id: number;
    code: string;
    name: string;
    options?: AttributeOption[];
}

interface Props {
    attributes: AttributeItem[];
    productTypeAttribute?: ProductTypeAttribute | null;
}

interface ProductForm {
    [key: string]: FormDataConvertible;
    enabled: boolean;
    type: string;
    sku: string;
    product_type_code: string;
    configurable_attributes: number[];
    variants: {
        sku: string;
        price: string;
        qty: string;
        attributes: Record<number, string>;
        label: string;
    }[];
}

function cartesian(sets: any[][]): any[][] {
    return sets.reduce((acc, set) => acc.flatMap((x) => set.map((y) => [...x, y])), [[]]);
}

// Every combination becomes a table row with three MUI text fields. A few of
// the option-bearing attributes have hundreds of options (taxonomy/brand
// fields), so an unguarded cartesian of two of them is tens of thousands of
// rows — enough to freeze the tab the instant an attribute is ticked. Past
// this many combinations we refuse to generate and tell the user to narrow
// the selection.
const MAX_VARIANT_COMBINATIONS = 200;

/** Size of the cartesian product without building it. */
function comboCount(sets: unknown[][]): number {
    return sets.reduce((n, set) => n * Math.max(set.length, 1), 1);
}

export default function ProductCreate({ attributes, productTypeAttribute }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('products'), href: '/catalog/products' },
        { title: t('createProduct'), href: '/catalog/products/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm<ProductForm>({
        enabled: true,
        type: 'simple',
        sku: '',
        product_type_code: '',
        configurable_attributes: [],
        variants: [],
    });

    const [configModalOpen, setConfigModalOpen] = useState(false);
    // Set to the rejected combination count when a selection would produce too
    // many variant rows to render — surfaced as a warning, no rows generated.
    const [variantOverflow, setVariantOverflow] = useState<number | null>(null);

    // กรองเอาเฉพาะ attribute ที่มี options ให้เลือก (เช่น สี, ไซส์)
    const selectedAttributeObjects = useMemo(
        () => attributes.filter((attr) => data.configurable_attributes.includes(attr.id)),
        [attributes, data.configurable_attributes],
    );

    // ตัวเลือกใน variant-attribute picker — เมื่อก่อนจำกัดตาม family ที่เลือกไว้
    // ในหน้านี้ แต่หน้า Create ไม่มีให้เลือก family/กลุ่มสินค้าอีกต่อไปแล้ว (เลือก
    // ทีหลังตอนแก้ไขสินค้าแทน ผ่านกลุ่มสินค้า — ดู catalog/product-groups/edit.tsx)
    // เลยเหลือแค่กรองว่ามี options ให้เลือกจริงๆ (เช่น สี, ไซส์) เท่านั้น — ไม่ได้
    // กระทบอะไรในทางปฏิบัติอยู่แล้ว เพราะ Product Type ที่นี่ล็อกไว้ที่ "Simple"
    // เสมอ (ดู MenuItem value="configurable" disabled ด้านล่าง) จุดนี้เลยไม่มีวัน
    // ถูกใช้งานจริงตอนสร้างสินค้าใหม่
    const familyScopedAttributeOptions = useMemo(() => attributes.filter((attr) => (attr.options || []).length > 0), [attributes]);

    const handleGenerateVariants = (selectedAttrIds: number[]) => {
        const selectedAttrs = attributes.filter((attr) => selectedAttrIds.includes(attr.id));

        const optionSets = selectedAttrs.map((attr) => {
            return (attr.options || []).map((opt) => ({
                attribute_id: attr.id,
                attribute_code: attr.code,
                option_id: opt.id,
                option_code: opt.code || opt.admin_label || String(opt.id),
                label: opt.admin_label || opt.code || String(opt.id),
            }));
        });

        if (optionSets.length === 0) {
            setVariantOverflow(null);
            setData((prev) => ({ ...prev, configurable_attributes: selectedAttrIds, variants: [] }));
            return;
        }

        const total = comboCount(optionSets);
        if (total > MAX_VARIANT_COMBINATIONS) {
            // Keep the picked attributes so the user sees what they chose, but
            // don't build the (huge) row set — that's what locks the browser.
            setVariantOverflow(total);
            setData((prev) => ({ ...prev, configurable_attributes: selectedAttrIds, variants: [] }));
            return;
        }
        setVariantOverflow(null);

        const combos = cartesian(optionSets);
        const generated = combos.map((combo) => {
            const suffix = combo.map((c) => String(c.option_code).toUpperCase()).join('-');
            const varSku = data.sku ? `${data.sku}-${suffix}` : suffix;

            const combinationAttrs = combo.reduce(
                (acc, c) => {
                    acc[c.attribute_id] = c.option_code;
                    return acc;
                },
                {} as Record<number, string>,
            );

            return {
                sku: varSku,
                price: '',
                qty: '',
                attributes: combinationAttrs,
                label: combo.map((c) => c.label).join(' / '),
            };
        });

        setData((prev) => ({
            ...prev,
            configurable_attributes: selectedAttrIds,
            variants: generated,
        }));
    };

    const handleVariantFieldChange = (index: number, field: 'sku' | 'price' | 'qty', value: string) => {
        const updated = [...data.variants];
        updated[index] = { ...updated[index], [field]: value };
        setData('variants', updated);
    };

    // แต่ละแถวต้องรู้ index เดิมในอาเรย์ (เพื่อเรียก handleVariantFieldChange
    // และเอาไปใช้เป็น key ของ error message) แต่ FioriResponsiveColumn.render
    // ส่งมาแค่ตัวแถวเฉยๆ เลยต้องแนบ index ติดไปกับ object ของแต่ละแถวด้วย
    type VariantRow = ProductForm['variants'][number] & { __index: number };
    const variantRows: VariantRow[] = data.variants.map((variant, index) => ({ ...variant, __index: index }));

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // label ของตัวเลือกที่ generate มาเป็นตัวระบุแถว ส่วน SKU เป็นช่องที่ผู้ใช้ต้อง
    // กรอกเองต่อ variant เลยให้โชว์ต่อจากกัน ส่วน price/qty เป็นข้อมูลรองเลยซ่อนก่อน
    const variantColumns: FioriResponsiveColumn<VariantRow>[] = [
        {
            key: 'label',
            header: 'ตัวเลือกย่อย',
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.label}</Typography>,
        },
        {
            key: 'sku',
            header: 'SKU ย่อย *',
            priority: 'high',
            render: (row) => (
                <TextField
                    size="small"
                    required
                    value={row.sku}
                    onChange={(e) => handleVariantFieldChange(row.__index, 'sku', e.target.value)}
                    error={Boolean(errors[`variants.${row.__index}.sku` as keyof typeof errors])}
                    helperText={errors[`variants.${row.__index}.sku` as keyof typeof errors]}
                />
            ),
        },
        {
            key: 'price',
            header: 'ราคา',
            priority: 'medium',
            render: (row) => (
                <TextField
                    size="small"
                    type="number"
                    value={row.price}
                    onChange={(e) => handleVariantFieldChange(row.__index, 'price', e.target.value)}
                    placeholder="ราคา"
                />
            ),
        },
        {
            key: 'qty',
            header: 'จำนวนสต๊อก (Qty)',
            priority: 'medium',
            render: (row) => (
                <TextField
                    size="small"
                    type="number"
                    value={row.qty}
                    onChange={(e) => handleVariantFieldChange(row.__index, 'qty', e.target.value)}
                    placeholder="สต๊อก"
                />
            ),
        },
    ];

    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const handleFormSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();
        // ฝั่ง server จะ redirect ไปหน้า Edit ทันที (หรือไปหน้า list ถ้า role นั้น
        // สร้างได้แต่แก้ไม่ได้) — Inertia ตาม redirect นี้ให้อยู่แล้ว เลยไม่ต้องทำ
        // อะไรเพิ่มตรงนี้ตอน success
        skipNavigationGuardRef.current = true;
        post('/catalog/products', {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductTitle')} />
            {/* <Box component="form" onSubmit={handleFormSubmit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 1000, mx: 'auto' }}> */}
            <Box component="form" onSubmit={handleFormSubmit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%', width: '100%', maxWidth: 760 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700}>
                        {t('createProductTitle')}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/products" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button
                            sx={solidActionSx}
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                        >
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3}>
                    <FioriFormGroup title={t('productInfo')} sx={{ maxWidth: 760 }}>
                        {/* สถานะ */}
                        <FioriField label={t('status')}>
                            <Stack direction="row" spacing={3}>
                                <FormControlLabel
                                    control={<Checkbox checked={data.enabled === true} onChange={() => setData('enabled', true)} />}
                                    label={t('active')}
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.enabled === false} onChange={() => setData('enabled', false)} />}
                                    label={t('nonActive')}
                                />
                            </Stack>
                        </FioriField>

                        {/* เดิมมีช่อง "ประเภทสินค้า" (Simple/Configurable) อยู่ตรงนี้ — เอาออก
                            ตามที่ user ขอ เพราะชนชื่อกับฟิลด์ "ประเภทสินค้า" (แอตทริบิวต์
                            producttype) ด้านล่าง ทั้งที่เป็นคนละเรื่องกันในระบบ: ตัวนี้กำหนดว่ามี
                            variant ย่อยหรือไม่ ส่วนฟิลด์ด้านล่างคือหมวดหมู่สินค้า และ Configurable
                            ก็ถูกปิดใช้งานถาวรอยู่แล้วด้วย (MenuItem disabled ด้านบนเดิม ไม่เคย
                            เลือกได้จริงตั้งแต่ต้น) data.type จึงยังคงเป็น 'simple' เสมอสำหรับ
                            สินค้าที่สร้างใหม่ทุกตัว — ไม่ต้องมี field ให้ผู้ใช้เลือกอีกต่อไป */}

                        {/* SKU หลัก */}
                        <FioriField
                            label={t('sku')}
                            htmlFor="product-sku"
                            required
                            valueState={valueStateOf(errors.sku)}
                            message={errors.sku}
                        >
                            <TextField
                                id="product-sku"
                                fullWidth
                                size="small"
                                value={data.sku}
                                onChange={(e) => setData('sku', e.target.value)}
                                placeholder={t('skuPlaceholder')}
                                sx={fioriFieldStateSx(valueStateOf(errors.sku))}
                            />
                        </FioriField>

                        {/* ประเภทสินค้า — แอตทริบิวต์ producttype ที่ options mirror มาจาก
                            catalog/product-types (คนละเรื่องกับ Simple/Configurable ที่เอาออก
                            ไปด้านบนแล้ว) เลือกได้ทันทีตอนสร้าง ไม่บังคับ — ถ้าไม่เลือก ไปเลือก
                            ทีหลังที่หน้าแก้ไขได้ */}
                        {productTypeAttribute && (
                            <FioriField
                                label={t('masterProductTypeFieldLabel')}
                                htmlFor="product-type-master"
                                valueState={valueStateOf(errors.product_type_code)}
                                message={errors.product_type_code}
                            >
                                <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.product_type_code))}>
                                    <Select
                                        id="product-type-master"
                                        IconComponent={KeyboardArrowDownIcon}
                                        displayEmpty
                                        value={data.product_type_code}
                                        onChange={(e) => setData('product_type_code', e.target.value)}
                                    >
                                        <MenuItem value="">{t('masterProductTypeNone')}</MenuItem>
                                        {(productTypeAttribute.options || []).map((opt) => (
                                            <MenuItem key={opt.id} value={opt.code || ''}>
                                                {opt.admin_label || opt.code}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </FioriField>
                        )}
                    </FioriFormGroup>

                    {/* ตาราง Variants ที่ generate แบบ cartesian */}
                    {data.type === 'configurable' && data.variants.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5, borderColor: UI_BORDER }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                <Typography variant="h6" fontWeight={700}>
                                    สร้างตัวเลือกสินค้าย่อย (Variants Cartesian List)
                                </Typography>
                                <Button variant="outlined" size="small" onClick={() => setConfigModalOpen(true)}>
                                    เลือกคุณสมบัติย่อยเพิ่ม ({selectedAttributeObjects.length})
                                </Button>
                            </Stack>

                            <FioriResponsiveTable variant="plain" columns={variantColumns} rows={variantRows} getRowKey={(row) => row.__index} />
                        </Paper>
                    )}
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>

            {/* Dialog เลือก Attribute สำหรับ Configurable */}
            <Dialog
                open={configModalOpen}
                onClose={() => setConfigModalOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 2, border: `1px solid ${UI_BORDER_STRONG}` } }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>
                        {t('configurableAttributesTitle')}
                    </Typography>
                    <IconButton onClick={() => setConfigModalOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    {variantOverflow !== null && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            {t('tooManyVariantCombinations', { count: variantOverflow, max: MAX_VARIANT_COMBINATIONS })}
                        </Alert>
                    )}
                    <Autocomplete
                        multiple
                        size="small"
                        options={familyScopedAttributeOptions}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedAttributeObjects}
                        onChange={(_, newValue) => {
                            const newIds = newValue.map((item) => item.id);
                            handleGenerateVariants(newIds);
                        }}
                        sx={fioriMultiInputSx('none')}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip label={option.name || option.code} size="small" {...getTagProps({ index })} key={option.id} sx={mappedChipSx} />
                            ))
                        }
                        renderInput={(params) => <TextField {...params} placeholder={t('selectAttributesPlaceholder')} variant="outlined" />}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
                    <Button onClick={() => setConfigModalOpen(false)} sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'none' }}>
                        {t('back')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => setConfigModalOpen(false)}
                        sx={{ ...solidActionSx, fontWeight: 700, borderRadius: 1.5, px: 2.5, textTransform: 'none' }}
                    >
                        Save Configurations
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
