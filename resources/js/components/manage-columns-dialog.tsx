import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    TextField,
    Typography,
} from '@mui/material';

export interface ManageColumnOption {
    key: string;
    label: string;
}

interface ManageColumnsDialogProps {
    open: boolean;
    onClose: () => void;
    columns: ManageColumnOption[];
    selected: string[];
    onApply: (selected: string[]) => void;
}

export function ManageColumnsDialog({ open, onClose, columns, selected, onApply }: ManageColumnsDialogProps) {
    const { t } = useTranslation('catalog');
    const [search, setSearch] = useState('');
    const [localSelected, setLocalSelected] = useState<string[]>(selected);
    const [dragKey, setDragKey] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setLocalSelected(selected);
            setSearch('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const labelByKey = new Map(columns.map((c) => [c.key, c.label]));

    const availableColumns = columns.filter(
        (c) => !localSelected.includes(c.key) && c.label.toLowerCase().includes(search.toLowerCase()),
    );
    const selectedColumns = localSelected.map((key) => ({ key, label: labelByKey.get(key) ?? key }));

    const addColumn = (key: string) => setLocalSelected((prev) => [...prev, key]);
    const removeColumn = (key: string) => setLocalSelected((prev) => prev.filter((k) => k !== key));

    const reorder = (target: string) => {
        if (!dragKey || dragKey === target) return;
        setLocalSelected((prev) => {
            const next = prev.filter((k) => k !== dragKey);
            const targetIndex = next.indexOf(target);
            next.splice(targetIndex, 0, dragKey);
            return next;
        });
    };

    const handleApply = () => {
        onApply(localSelected);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                {t('manageColumns')}
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ display: 'flex', minHeight: 420 }}>
                    {/* Available */}
                    <Box sx={{ flex: 1, p: 2, borderRight: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                            {t('availableColumns')}
                        </Typography>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('searchColumns')}
                            size="small"
                            fullWidth
                            sx={{ mb: 1 }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <List
                            dense
                            sx={{ maxHeight: 340, overflowY: 'auto' }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                                if (dragKey) removeColumn(dragKey);
                                setDragKey(null);
                            }}
                        >
                            {availableColumns.map((col) => (
                                <ListItemButton
                                    key={col.key}
                                    draggable
                                    onDragStart={() => setDragKey(col.key)}
                                    onDragEnd={() => setDragKey(null)}
                                    onClick={() => addColumn(col.key)}
                                    sx={{ borderRadius: 1 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 28, color: 'text.disabled', cursor: 'grab' }}>
                                        <DragIndicatorIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText primary={col.label} />
                                </ListItemButton>
                            ))}
                            {availableColumns.length === 0 && (
                                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                                    —
                                </Typography>
                            )}
                        </List>
                    </Box>

                    {/* Selected */}
                    <Box sx={{ flex: 1, p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                            {t('selectedColumns')}
                        </Typography>
                        <List dense sx={{ maxHeight: 380, overflowY: 'auto', mt: '44px' }}>
                            {selectedColumns.map((col) => (
                                <ListItemButton
                                    key={col.key}
                                    draggable
                                    onDragStart={() => setDragKey(col.key)}
                                    onDragEnd={() => setDragKey(null)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => {
                                        reorder(col.key);
                                        setDragKey(null);
                                    }}
                                    onClick={() => removeColumn(col.key)}
                                    sx={{ borderRadius: 1 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 28, color: 'text.disabled', cursor: 'grab' }}>
                                        <DragIndicatorIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText primary={col.label} />
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleApply} variant="contained" sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}>
                    {t('apply')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
