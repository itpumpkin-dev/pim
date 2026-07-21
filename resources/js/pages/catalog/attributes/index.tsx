import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Chip, colors, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

interface GridColumn { label: string; type: string; sortable?: boolean; }
interface GridAction { icon: string; label: string; }
interface GridConfig { columns: Record<string, GridColumn>; actions?: Record<string, GridAction>; }
interface GridData { data: Array<Record<string, unknown> & { id: number }>; total: number; }
interface Props { gridConfig: GridConfig; gridData: GridData; filters: { search?: string; sort?: string; dir?: string }; }

const breadcrumbs: BreadcrumbItem[] = [{ title: 'CATALOG', href: '#' }, { title: 'ATTRIBUTES', href: '/catalog/attributes' }];

function cellValue(value: unknown, type: string) {
    if (type === 'boolean') return <Chip label={value ? 'Yes' : 'No'} size="small" color={value ? 'primary' : 'default'} variant={value ? 'filled' : 'outlined'} />;
    if (type === 'datetime' && typeof value === 'string') return new Date(value).toLocaleDateString();
    return String(value ?? '-');
}

export default function AttributeIndex({ gridConfig, gridData, filters }: Props) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attributes.create_attributes');
    const canEdit = permissions.includes('attributes.edit_attributes');
    const canDelete = permissions.includes('attributes.delete_attributes');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteAttributeId, setDeleteAttributeId] = useState<number | null>(null);
    const firstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => router.get('/catalog/attributes', { search }, { preserveState: true, replace: true }), 300);
        return () => clearTimeout(timeout);
    }, [search]);

    return <AppLayout
        breadcrumbs={breadcrumbs}>
        <Head title="Attributes" />
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                <Box><Typography variant="h4" fontWeight={700}>Attributes</Typography>
                    <Typography color="text.secondary">{gridData.total} results</Typography>
                </Box>{canCreate &&
                    <Button sx={{ color: "white" }} variant="contained" startIcon={<AddIcon />} onClick={() => router.visit('/catalog/attributes/create')}>Create Attribute</Button>}
            </Box>
            <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search attributes" size="small" sx={{ mb: 3, minWidth: 280 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {Object.entries(gridConfig.columns).map(([key, column]) => (
                                <TableCell key={key} sx={{ fontWeight: 700 }}>{column.label}</TableCell>
                            ))}
                            {visibleActions.length > 0 && <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {gridData.data.map((row) => (
                            <TableRow key={row.id}>
                                {Object.entries(gridConfig.columns).map(([key, column]) => (
                                    <TableCell key={key}>{cellValue(row[key], column.type)}</TableCell>
                                ))}
                                {visibleActions.length > 0 && (
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            {visibleActions.map(([actionKey, action]) => {
                                                let Icon = EditIcon;
                                                if (action.icon === 'delete') Icon = DeleteIcon;

                                                const handleClick = () => {
                                                    if (actionKey === 'update') {
                                                        router.visit(`/catalog/attributes/${row.id}/edit`);
                                                    } else if (actionKey === 'delete') {
                                                        setDeleteAttributeId(row.id);
                                                    }
                                                };

                                                return (
                                                    <IconButton key={actionKey} size="small" sx={{ display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
                                                        <Icon fontSize="small" />
                                                        <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>{action.label}</Typography>
                                                    </IconButton>
                                                );
                                            })}
                                        </Box>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                        {gridData.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={Object.keys(gridConfig.columns).length + (visibleActions.length > 0 ? 1 : 0)} align="center">
                                    No attributes found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
        <Dialog open={deleteAttributeId !== null} onClose={() => setDeleteAttributeId(null)}>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Are you sure you want to delete this attribute?
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDeleteAttributeId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>Cancel</Button>
                <Button onClick={() => {
                    if (deleteAttributeId !== null) {
                        router.delete(`/catalog/attributes/${deleteAttributeId}`, {
                            onSuccess: () => setDeleteAttributeId(null),
                        });
                    }
                }} color="error" variant="contained" sx={{ fontWeight: 'bold' }}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    </AppLayout >;
}

