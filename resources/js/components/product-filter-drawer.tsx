import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { Autocomplete, Box, Button, Drawer, IconButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export interface ProductFamilyOption {
    id: number;
    code: string;
    name?: string | null;
}

export interface ProductFilterableAttribute {
    id: number;
    code: string;
    label: string;
    type: string;
    is_filterable?: boolean;
}

export interface ProductFilters {
    sku?: string;
    name?: string;
    family_id?: number | '';
    enabled?: '' | '1' | '0';
    type?: '' | 'simple' | 'configurable';
    [key: string]: string | number | undefined;
}

export interface AttributeFilterRow {
    attribute_id: number | '';
    value: string;
    [key: string]: string | number;
}

/**
 * Product-specific filter drawer: SKU/Name/Status/Type are simple fields,
 * Attribute Family is a real column (family_id), and "Add Filter" lets the
 * user filter by any attribute flagged `is_filterable` — those go through a
 * separate EAV (ProductValue) query on the backend since they aren't columns
 * on the `products` table itself.
 */
export function ProductFilterDrawer({
    open,
    onClose,
    families,
    attributes,
    filters,
    attributeFilters,
    onApply,
}: {
    open: boolean;
    onClose: () => void;
    families: ProductFamilyOption[];
    attributes: ProductFilterableAttribute[];
    filters: ProductFilters;
    attributeFilters: AttributeFilterRow[];
    onApply: (filters: ProductFilters, attributeFilters: AttributeFilterRow[]) => void;
}) {
    const [draftFilters, setDraftFilters] = useState<ProductFilters>(filters);
    const [draftAttrFilters, setDraftAttrFilters] = useState<AttributeFilterRow[]>(attributeFilters);

    useEffect(() => {
        if (open) {
            setDraftFilters(filters);
            setDraftAttrFilters(attributeFilters);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filterableAttributes = attributes.filter((attr) => attr.is_filterable);

    const addFilterRow = () => setDraftAttrFilters((prev) => [...prev, { attribute_id: '', value: '' }]);

    const updateFilterRow = (index: number, patch: Partial<AttributeFilterRow>) =>
        setDraftAttrFilters((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const removeFilterRow = (index: number) => setDraftAttrFilters((prev) => prev.filter((_, i) => i !== index));

    const save = () => {
        const cleaned: ProductFilters = {};
        if (draftFilters.sku) cleaned.sku = draftFilters.sku;
        if (draftFilters.name) cleaned.name = draftFilters.name;
        if (draftFilters.family_id) cleaned.family_id = draftFilters.family_id;
        if (draftFilters.enabled) cleaned.enabled = draftFilters.enabled;
        if (draftFilters.type) cleaned.type = draftFilters.type;

        const cleanedAttrFilters = draftAttrFilters.filter((row) => row.attribute_id !== '' && row.value !== '');

        onApply(cleaned, cleanedAttrFilters);
        onClose();
    };

    return (
        <Drawer anchor="right" open={open} onClose={onClose}>
            <Box sx={{ width: 340, p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="h6" fontWeight={700}>
                        Apply Filters
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Stack>

                <Stack spacing={2.5}>
                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            SKU
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="SKU"
                            value={draftFilters.sku ?? ''}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, sku: e.target.value }))}
                        />
                    </Box>

                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            Name
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Name"
                            value={draftFilters.name ?? ''}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, name: e.target.value }))}
                        />
                    </Box>

                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            Attribute Family
                        </Typography>
                        <Select
                            fullWidth
                            size="small"
                            displayEmpty
                            value={draftFilters.family_id ?? ''}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, family_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                        >
                            <MenuItem value="">
                                <em>Select option</em>
                            </MenuItem>
                            {families.map((family) => (
                                <MenuItem key={family.id} value={family.id}>
                                    {family.name || family.code}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            Status
                        </Typography>
                        <Select
                            fullWidth
                            size="small"
                            displayEmpty
                            value={draftFilters.enabled ?? ''}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, enabled: e.target.value as ProductFilters['enabled'] }))}
                        >
                            <MenuItem value="">
                                <em>Select</em>
                            </MenuItem>
                            <MenuItem value="1">Enabled</MenuItem>
                            <MenuItem value="0">Disabled</MenuItem>
                        </Select>
                    </Box>

                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                            Type
                        </Typography>
                        <Select
                            fullWidth
                            size="small"
                            displayEmpty
                            value={draftFilters.type ?? ''}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, type: e.target.value as ProductFilters['type'] }))}
                        >
                            <MenuItem value="">
                                <em>Select</em>
                            </MenuItem>
                            <MenuItem value="simple">Simple</MenuItem>
                            <MenuItem value="configurable">Configurable</MenuItem>
                        </Select>
                    </Box>

                    {draftAttrFilters.map((row, index) => (
                        <Stack key={index} direction="row" spacing={1} alignItems="center">
                            <Autocomplete
                                size="small"
                                sx={{ flex: 1 }}
                                options={filterableAttributes}
                                getOptionLabel={(opt) => opt.label || opt.code}
                                value={filterableAttributes.find((attr) => attr.id === row.attribute_id) ?? null}
                                onChange={(_, val) => updateFilterRow(index, { attribute_id: val?.id ?? '' })}
                                renderInput={(params) => <TextField {...params} placeholder="Search..." />}
                            />
                            <TextField
                                size="small"
                                placeholder="Value"
                                sx={{ flex: 1 }}
                                value={row.value}
                                onChange={(e) => updateFilterRow(index, { value: e.target.value })}
                            />
                            <IconButton size="small" onClick={() => removeFilterRow(index)}>
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    ))}

                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={addFilterRow}
                        sx={{ borderStyle: 'dashed' }}
                    >
                        Add Filter
                    </Button>
                </Stack>

                <Button fullWidth variant="contained" sx={{ mt: 3, color: 'white' }} onClick={save}>
                    Save
                </Button>
            </Box>
        </Drawer>
    );
}
