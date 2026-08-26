import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { type FormDataConvertible } from '@inertiajs/core';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
    FormHelperText,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { mappedChipSx, solidActionSx, UI_BORDER, UI_BORDER_STRONG } from '@/lib/ui-style';

interface AttributeFamily {
    id: number;
    code: string;
    name: string;
}

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

interface Props {
    families: AttributeFamily[];
    attributes: AttributeItem[];
}

interface ProductForm {
    [key: string]: FormDataConvertible;
    enabled: boolean;
    family_id: string | number;
    type: string;
    sku: string;
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
    return sets.reduce((acc, set) => acc.flatMap(x => set.map(y => [...x, y])), [[]]);
}

export default function ProductCreate({ families, attributes }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('products'), href: '/catalog/products' },
        { title: t('createProduct'), href: '/catalog/products/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm<ProductForm>({
        enabled: true,
        family_id: families.length > 0 ? families[0].id : '',
        type: 'simple',
        sku: '',
        configurable_attributes: [],
        variants: [],
    });

    const [configModalOpen, setConfigModalOpen] = useState(false);

    // กรองเอาเฉพาะ attribute ที่มี options ให้เลือก (เช่น สี, ไซส์)
    const selectedAttributeObjects = attributes.filter((attr) =>
        data.configurable_attributes.includes(attr.id)
    );

    // จำกัดตัวเลือกใน variant-attribute picker ให้เหลือแค่ attribute ที่ผูกกับ
    // family ที่เลือกไว้จริงๆ — แต่ก่อนเลือก attribute ระบบไหนก็ได้ที่มี options
    // มาใช้ตรงนี้ได้หมด ถึงจะไม่เกี่ยวกับ family ที่เลือกเลยก็ตาม สุดท้าย value
    // ของ variant ที่ได้ก็จะไม่โผล่ในกลุ่ม attribute ของ family นั้นตอนไปหน้า Edit
    const familyScopedAttributeOptions = attributes.filter(
        (attr) => (attr.options || []).length > 0 && (attr.family_ids || []).includes(Number(data.family_id)),
    );

    const handleGenerateVariants = (selectedAttrIds: number[]) => {
        const selectedAttrs = attributes.filter((attr) =>
            selectedAttrIds.includes(attr.id)
        );

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
            setData((prev) => ({ ...prev, variants: [] }));
            return;
        }

        const combos = cartesian(optionSets);
        const generated = combos.map((combo) => {
            const suffix = combo.map((c) => String(c.option_code).toUpperCase()).join('-');
            const varSku = data.sku ? `${data.sku}-${suffix}` : suffix;

            const combinationAttrs = combo.reduce((acc, c) => {
                acc[c.attribute_id] = c.option_code;
                return acc;
            }, {} as Record<number, string>);

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
            <Box component="form" onSubmit={handleFormSubmit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 1000, mx: 'auto' }}>
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
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5, borderColor: UI_BORDER }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                            {t('productInfo')}
                        </Typography>

                        <Stack spacing={3}>
                            {/* สถานะ */}
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                                    {t('status')}
                                </Typography>
                                <Stack direction="row" spacing={3}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={data.enabled === true}
                                                onChange={() => setData('enabled', true)}
                                            />
                                        }
                                        label={t('active')}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={data.enabled === false}
                                                onChange={() => setData('enabled', false)}
                                            />
                                        }
                                        label={t('nonActive')}
                                    />
                                </Stack>
                            </Box>

                            {/* Family (กลุ่มสินค้า) */}
                            <FormControl fullWidth required error={Boolean(errors.family_id)}>
                                <InputLabel id="family-label">{t('familyRequired')}</InputLabel>
                                <Select
                                    labelId="family-label"
                                    label={t('familyRequired')}
                                    value={data.family_id}
                                    onChange={(e) =>
                                        setData((prev) => ({
                                            ...prev,
                                            family_id: e.target.value,
                                            // แกน variant ที่เลือกไว้จาก family เดิม อาจใช้ไม่ได้กับ
                                            // family ใหม่ เลยต้องล้าง matrix ที่ generate ไว้ทิ้งไปด้วย
                                            configurable_attributes: [],
                                            variants: [],
                                        }))
                                    }
                                >
                                    {families.map((fam) => (
                                        <MenuItem key={fam.id} value={fam.id}>
                                            {fam.name || fam.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.family_id && <FormHelperText>{errors.family_id}</FormHelperText>}
                            </FormControl>

                            {/* ประเภทสินค้า */}
                            <FormControl fullWidth required error={Boolean(errors.type)}>
                                <InputLabel id="product-type-label">{t('productTypesRequired')}</InputLabel>
                                <Select
                                    labelId="product-type-label"
                                    label={t('productTypesRequired')}
                                    value={data.type}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setData('type', val);
                                        if (val === 'configurable') {
                                            setConfigModalOpen(true);
                                        } else {
                                            setData('variants', []);
                                        }
                                    }}
                                >
                                    <MenuItem value="simple">{t('simple')}</MenuItem>
                                    <MenuItem value="configurable">{t('configurable')}</MenuItem>
                                </Select>
                                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                            </FormControl>

                            {/* SKU หลัก */}
                            <TextField
                                label={t('skuRequired')}
                                required
                                fullWidth
                                value={data.sku}
                                onChange={(e) => setData('sku', e.target.value)}
                                placeholder={t('skuPlaceholder')}
                                error={Boolean(errors.sku)}
                                helperText={errors.sku}
                            />
                        </Stack>
                    </Paper>

                    {/* ตาราง Variants ที่ generate แบบ cartesian */}
                    {data.type === 'configurable' && data.variants.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5, borderColor: UI_BORDER }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                <Typography variant="h6" fontWeight={700}>
                                    สร้างตัวเลือกสินค้าย่อย (Variants Cartesian List)
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => setConfigModalOpen(true)}
                                >
                                    เลือกคุณสมบัติย่อยเพิ่ม ({selectedAttributeObjects.length})
                                </Button>
                            </Stack>

                            <FioriResponsiveTable
                                variant="plain"
                                columns={variantColumns}
                                rows={variantRows}
                                getRowKey={(row) => row.__index}
                            />
                        </Paper>
                    )}
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctErrorsBeforeSaving')}
                    </Alert>
                )}
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
                    <Autocomplete
                        multiple
                        options={familyScopedAttributeOptions}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedAttributeObjects}
                        onChange={(_, newValue) => {
                            const newIds = newValue.map((item) => item.id);
                            handleGenerateVariants(newIds);
                        }}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip
                                    label={option.name || option.code}
                                    {...getTagProps({ index })}
                                    key={option.id}
                                    sx={mappedChipSx}
                                />
                            ))
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder={t('selectAttributesPlaceholder')}
                                variant="outlined"
                            />
                        )}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                        onClick={() => setConfigModalOpen(false)}
                        sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'none' }}
                    >
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
