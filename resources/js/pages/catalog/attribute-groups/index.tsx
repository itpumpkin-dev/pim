import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface AttributeGroupRow {
    id: number;
    code: string;
    name?: string;
    [key: string]: unknown;
}
interface GridData {
    data: AttributeGroupRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE GROUPS', href: '/catalog/attributeGroups' },
];

export default function AttributeGroupIndex({ gridConfig, gridData, filters }: Props) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_groups.create_attribute_groups') || true;
    const canEdit = permissions.includes('attribute_groups.edit_attribute_groups') || true;
    const canDelete = permissions.includes('attribute_groups.delete_attribute_groups') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(10);
    const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributeGroups', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Attribute Groups" />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Create Button */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        Attribute Groups
                    </Typography>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/catalog/attributeGroups/create')}
                            sx={{
                                 bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                py: 1,
                                borderRadius: 1.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            Create Attribute Group
                        </Button>
                    )}
                </Stack>

                {/* Search & Controls Row */}
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search"
                            size="small"
                            sx={{
                                bgcolor: '#fff',
                                borderRadius: 5,
                                '& .MuiOutlinedInput-root': { borderRadius: 5 },
                                minWidth: 240,
                            }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {gridData.total} Results
                        </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            sx={{
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                bgcolor: '#fff',
                            }}
                        >
                            Filter
                        </Button>

                        <Select
                            value={perPage}
                            onChange={(e) => setPerPage(Number(e.target.value))}
                            size="small"
                            sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>

                        <Typography variant="body2" color="text.secondary">
                            Per Page
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" color="text.secondary">
                            of {lastPage}
                        </Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                {/* Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>Code</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>Name</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell sx={{ color: '#334155' }}>{row.id}</TableCell>
                                    <TableCell sx={{ color: '#334155', fontWeight: 500 }}>{row.code}</TableCell>
                                    <TableCell sx={{ color: '#334155' }}>{row.name || ucfirst(row.code)}</TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            {canEdit && (
                                                <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => router.visit(`/catalog/attributeGroups/${row.id}/edit`)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canDelete && (
                                                <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setDeleteGroupId(row.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {gridData.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                        No attribute groups found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {/* Delete Dialog */}
            <Dialog open={deleteGroupId !== null} onClose={() => setDeleteGroupId(null)}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this attribute group?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteGroupId(null)} color="inherit">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteGroupId !== null) {
                                router.delete(`/catalog/attributeGroups/${deleteGroupId}`, {
                                    onSuccess: () => setDeleteGroupId(null),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}

function ucfirst(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
