import AppLogo from '@/components/app-logo';
import { useForm } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Dialog, DialogContent, Divider, IconButton, TextField, Typography } from '@mui/material';
import { FormEventHandler } from 'react';

interface CreateUserForm {
    username: string;
    employee_id: string;
    password: string;
    password_confirmation: string;
    first_name: string;
    last_name: string;
    email: string;
    [key: string]: string;
}

interface CreateUserDialogProps {
    open: boolean;
    onClose: () => void;
}

const fields: { key: keyof CreateUserForm; label: string; type?: string }[] = [
    { key: 'username', label: 'Username' },
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'password_confirmation', label: 'Password (repeat)', type: 'password' },
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'email', label: 'Email', type: 'email' },
];

export default function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm<CreateUserForm>({
        username: '',
        employee_id: '',
        password: '',
        password_confirmation: '',
        first_name: '',
        last_name: '',
        email: '',
    });

    const handleClose = () => {
        clearErrors();
        reset();
        onClose();
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('system.user.store'), {
            preserveScroll: true,
            onSuccess: () => handleClose(),
        });
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth component="form" onSubmit={submit}>
            <DialogContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <AppLogo />
                    </Box>
                    <IconButton size="small" onClick={handleClose} sx={{ mt: -1, mr: -1 }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', lineHeight: 1 }}>
                    USERS
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                    CREATE
                </Typography>
                <Divider sx={{ mb: 3 }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {fields.map((field) => (
                        <Box key={field.key}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                {field.label} *
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                type={field.type || 'text'}
                                value={data[field.key]}
                                onChange={(e) => {
                                    setData(field.key, e.target.value);
                                    clearErrors(field.key);
                                }}
                                error={Boolean(errors[field.key])}
                                helperText={errors[field.key]}
                                autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                            />
                        </Box>
                    ))}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
                    <Button variant="contained" color="inherit" onClick={handleClose} sx={{ borderRadius: 8, px: 4 }}>
                        CANCEL
                    </Button>
                    <Button type="submit" variant="contained" color="primary" disabled={processing} sx={{ borderRadius: 8, px: 4, color: '#fff', }}>
                        SAVE
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
