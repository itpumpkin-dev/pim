import { router } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Autocomplete,
    Box,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { fioriComboBoxPaperSx, fioriComboBoxSx } from '@/components/fiori-form';
import { FIORI, FioriBusyOverlay, fioriCardSx, fioriIconButtonSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface FamilyOption {
    id: number;
    code: string;
    name?: string;
}

interface DefaultAssignmentRow {
    family_id: number;
    family_code: string;
    family_name: string | null;
    group_id: number;
    group_name: string | null;
    subcategory_name: string | null;
    category_name: string | null;
}

interface DefaultAssignmentResponse {
    data: DefaultAssignmentRow[];
    current_page: number;
    last_page: number;
    total: number;
}

interface Props {
    families: FamilyOption[];
    canEdit: boolean;
    canAssignDefault: boolean;
    canEditProductGroup: boolean;
}

const familyLabel = (f: { code: string; name?: string | null }) => (f.name ? `${f.name} (${f.code})` : f.code);

/**
 * แท็บ "จัดการ" บนหน้า index ตระกูลแอตทริบิวต์ — ตารางว่าตอนนี้แต่ละกลุ่มสินค้า
 * ใช้ตระกูลไหนเป็นค่าเริ่มต้นอยู่ (ดู AttributeFamilyController::defaultAssignments())
 * พร้อมปุ่มเปลี่ยน/ถอดตระกูลทีละกลุ่ม ซึ่งยิงไปที่ endpoint set/unset-default-for-groups
 * ตัวเดียวกับ dialog บนหน้าแก้ไขตระกูล แค่ส่ง category_ids ไปกลุ่มเดียว
 */
export function ManageDefaultsTab({ families, canEdit, canAssignDefault, canEditProductGroup }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [familyFilter, setFamilyFilter] = useState<FamilyOption | null>(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [data, setData] = useState<DefaultAssignmentResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [changeRow, setChangeRow] = useState<DefaultAssignmentRow | null>(null);
    const [changeTarget, setChangeTarget] = useState<FamilyOption | null>(null);
    const [unassignRow, setUnassignRow] = useState<DefaultAssignmentRow | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (familyFilter) params.set('family_id', String(familyFilter.id));

        setLoading(true);
        fetch(`/catalog/attributeFamilies/default-assignments?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: DefaultAssignmentResponse | null) => {
                if (json) setData(json);
            })
            .catch(() => undefined)
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [page, perPage, debouncedSearch, familyFilter, reloadKey]);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    const submit = (url: string, groupId: number, onDone: () => void) => {
        setSubmitting(true);
        router.post(
            url,
            { category_ids: [groupId] },
            {
                preserveState: true,
                preserveScroll: true,
                onSuccess: () => {
                    onDone();
                    reload();
                },
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const currentPage = data?.current_page ?? 1;
    const lastPage = data?.last_page ?? 1;
    const initialLoading = loading && !data;

    const columns: FioriResponsiveColumn<DefaultAssignmentRow>[] = [
        { key: 'id', header: t('fields.id'), priority: 'low', render: (row) => row.family_id },
        { key: 'code', header: t('fields.code'), priority: 'always', render: (row) => <Typography sx={{ fontWeight: 500 }}>{row.family_code}</Typography> },
        { key: 'name', header: t('fields.name'), priority: 'high', render: (row) => row.family_name || row.family_code },
        {
            key: 'group',
            header: tCatalog('manageDefaultsProductGroup'),
            priority: 'always',
            render: (row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: FIORI.textPrimary }}>
                        {row.group_name}
                    </Typography>
                    {(row.category_name || row.subcategory_name) && (
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            {[row.category_name, row.subcategory_name].filter(Boolean).join(' › ')}
                        </Typography>
                    )}
                </Box>
            ),
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canEdit && (
                        <Tooltip title={tCatalog('manageDefaultsEditFamily')}>
                            <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/attributeFamilies/${row.family_id}/edit`)}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {canEditProductGroup && (
                        <Tooltip title={tCatalog('manageDefaultsOpenProductGroup')}>
                            <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/product-groups/${row.group_id}/edit`)}>
                                <OpenInNewIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {canAssignDefault && (
                        <Tooltip title={tCatalog('manageDefaultsChange')}>
                            <IconButton
                                size="small"
                                sx={fioriIconButtonSx}
                                onClick={() => {
                                    setChangeRow(row);
                                    setChangeTarget(null);
                                }}
                            >
                                <SwapHorizIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {canAssignDefault && (
                        <Tooltip title={tCatalog('manageDefaultsUnassign')}>
                            <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setUnassignRow(row)}>
                                <LinkOffIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            ),
        },
    ];

    return (
        <>
            <Paper elevation={0} sx={fioriCardSx}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ p: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tCatalog('manageDefaultsSearch')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 260 }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Autocomplete
                            size="small"
                            options={families}
                            value={familyFilter}
                            onChange={(_, v) => {
                                setFamilyFilter(v);
                                setPage(1);
                            }}
                            getOptionLabel={familyLabel}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            popupIcon={<KeyboardArrowDownIcon />}
                            slotProps={{ paper: { sx: fioriComboBoxPaperSx } }}
                            // ให้สูง/มุม/สีขอบเท่ากับช่องค้นหา (fioriSearchFieldSx) ข้างๆ
                            sx={{
                                ...(fioriComboBoxSx('none') as object),
                                minWidth: 260,
                                // selector ยาวกว่าของ fioriComboBoxSx หนึ่ง class เพื่อชนะ specificity
                                '& .MuiOutlinedInput-root.MuiInputBase-root.MuiAutocomplete-inputRoot': {
                                    minHeight: 40,
                                    borderRadius: '8px',
                                    '& fieldset': { borderColor: FIORI.border },
                                    '&:hover fieldset': { borderColor: FIORI.borderStrong },
                                    '&.Mui-focused fieldset': { borderColor: FIORI.brand, borderWidth: '1px' },
                                    '& .MuiAutocomplete-input': { padding: '8.5px 4px 8.5px 14px' },
                                },
                            }}
                            renderInput={(params) => <TextField {...params} placeholder={tCatalog('manageDefaultsAllFamilies')} />}
                        />
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', md: 'auto' }, rowGap: 1, justifyContent: { xs: 'space-between', md: 'flex-end' } }}>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('results', { count: data?.total ?? 0 })}
                        </Typography>
                        <Select
                            value={perPage}
                            onChange={(e) => {
                                setPerPage(Number(e.target.value));
                                setPage(1);
                            }}
                            size="small"
                            sx={{
                                bgcolor: FIORI.surface,
                                borderRadius: '8px',
                                minWidth: 60,
                                height: 34,
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: FIORI.border },
                            }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={15}>15</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('perPage')}
                        </Typography>
                        <Paper
                            variant="outlined"
                            sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}
                        >
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                        </Paper>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('pageOf', { lastPage })}
                        </Typography>
                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => setPage(1)}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => setPage(lastPage)}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                <Divider sx={{ borderColor: FIORI.border }} />

                {/* โชว์ indicator ทันทีทุกครั้งที่โหลด (ไม่รอ delay) ให้รู้ว่ากำลังดึงข้อมูล
                    และกันความสูงไว้ตอนยังไม่มีแถว ไม่งั้น spinner จะเบียดอยู่ในพื้นที่แคบๆ */}
                <FioriBusyOverlay busy={loading} delayMs={0}>
                    {initialLoading && <Box sx={{ minHeight: 160 }} />}
                    {!initialLoading && (
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={data?.data ?? []}
                        getRowKey={(row) => `${row.group_id}-${row.family_id}`}
                        emptyMessage={tCatalog('manageDefaultsEmpty')}
                    />
                    )}
                </FioriBusyOverlay>
            </Paper>

            {/* เปลี่ยนตระกูลเริ่มต้นของกลุ่มสินค้านี้ */}
            <FioriMessageBox
                open={changeRow !== null}
                onCancel={() => setChangeRow(null)}
                onConfirm={() => {
                    if (changeRow && changeTarget) {
                        submit(`/catalog/attributeFamilies/${changeTarget.id}/set-default-for-groups`, changeRow.group_id, () => setChangeRow(null));
                    }
                }}
                title={tCatalog('manageDefaultsChangeTitle')}
                severity="confirm"
                confirmLabel={tCatalog('manageDefaultsChange')}
                cancelLabel={t('cancel')}
                confirmLoading={submitting}
                confirmDisabled={!changeTarget || changeTarget.id === changeRow?.family_id}
            >
                {changeRow && (
                    <Stack spacing={1.5} sx={{ minWidth: { sm: 400 } }}>
                        <Typography variant="body2">
                            {tCatalog('manageDefaultsChangeMessage', {
                                group: changeRow.group_name,
                                family: familyLabel({ code: changeRow.family_code, name: changeRow.family_name }),
                            })}
                        </Typography>
                        <Autocomplete
                            size="small"
                            options={families.filter((f) => f.id !== changeRow.family_id)}
                            value={changeTarget}
                            onChange={(_, v) => setChangeTarget(v)}
                            getOptionLabel={familyLabel}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            popupIcon={<KeyboardArrowDownIcon />}
                            slotProps={{ paper: { sx: fioriComboBoxPaperSx } }}
                            sx={fioriComboBoxSx('none')}
                            renderInput={(params) => <TextField {...params} placeholder={tCatalog('manageDefaultsPickFamily')} />}
                        />
                    </Stack>
                )}
            </FioriMessageBox>

            {/* ถอดตระกูลออกจากกลุ่มสินค้านี้ */}
            <FioriMessageBox
                open={unassignRow !== null}
                onCancel={() => setUnassignRow(null)}
                onConfirm={() => {
                    if (unassignRow) {
                        submit(`/catalog/attributeFamilies/${unassignRow.family_id}/unset-default-for-groups`, unassignRow.group_id, () => setUnassignRow(null));
                    }
                }}
                title={tCatalog('manageDefaultsUnassign')}
                severity="warning"
                destructive
                confirmLabel={tCatalog('manageDefaultsUnassign')}
                cancelLabel={t('cancel')}
                confirmLoading={submitting}
            >
                {unassignRow &&
                    tCatalog('manageDefaultsUnassignMessage', {
                        group: unassignRow.group_name,
                        family: familyLabel({ code: unassignRow.family_code, name: unassignRow.family_name }),
                    })}
            </FioriMessageBox>
        </>
    );
}
